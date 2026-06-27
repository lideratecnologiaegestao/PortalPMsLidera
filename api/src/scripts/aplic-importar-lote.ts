/**
 * Importação EM LOTE de cargas APLIC (TCE-MT) para um tenant.
 *
 * Reaproveita o serviço real de ingestão (mesma validação de nomenclatura/UG,
 * mesma idempotência e gravação em aplic_ e transp_). Pensado para rodar no
 * SERVIDOR, após aplicar as migrations (086/087) — aponta para uma pasta de
 * cargas e importa todas as que pertencem à UG da entidade.
 *
 * Build + uso (no servidor):
 *   npm run build
 *   node dist/scripts/aplic-importar-lote.js \
 *     --tenant exemplolandia --dir "E:\\ENTIDADES\\PM_DIAMANTINO" \
 *     --habilitar --ug 1112796
 *
 * Flags:
 *   --tenant <slug|id>   (obrigatório) entidade alvo.
 *   --dir <pasta>        (obrigatório) raiz onde estão os .ZIP (busca recursiva).
 *   --ug <7 dígitos>     UG da entidade no TCE (necessária na 1ª vez / com --habilitar).
 *   --habilitar          liga a fonte APLIC da entidade e grava a UG informada.
 *   --modulos CT,CC,PL,00 filtra os módulos a importar (padrão: todos suportados).
 *   --dry                não importa; só lista o plano (quais arquivos e ordem).
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AplicIngestaoService } from '../modules/aplic/aplic-ingestao.service';
import { AplicConfigService } from '../modules/aplic/aplic-config.service';
import { parseNomeCargaTce } from '../modules/aplic/aplic-nomenclatura.util';

// Ordem de importação: CT primeiro (popula credores → nome do fornecedor nos
// contratos), depois os demais. Módulos não suportados ficam de fora.
const PRIORIDADE: Record<string, number> = { CT: 0, CC: 1, PL: 2, ORCAMENTO: 3 };
const ALIAS_MODULO: Record<string, string> = { '00': 'ORCAMENTO', ORCAMENTO: 'ORCAMENTO', CT: 'CT', CC: 'CC', PL: 'PL' };

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(nome: string): boolean {
  return process.argv.includes(`--${nome}`);
}

/** Lista recursiva de .ZIP sob um diretório. */
function listarZips(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listarZips(p));
    else if (/\.zip$/i.test(e.name)) out.push(p);
  }
  return out;
}

async function main() {
  const tenantRef = arg('tenant');
  const dir = arg('dir');
  const ugArg = arg('ug');
  const habilitar = flag('habilitar');
  const dry = flag('dry');
  const filtroModulos = (arg('modulos') ?? '')
    .split(',').map((m) => ALIAS_MODULO[m.trim().toUpperCase()] ?? m.trim().toUpperCase()).filter(Boolean);

  if (!tenantRef || !dir) {
    console.error('Uso: --tenant <slug|id> --dir <pasta> [--ug 1112796] [--habilitar] [--modulos CT,CC,PL,00] [--dry]');
    process.exit(2);
  }
  if (!fs.existsSync(dir)) {
    console.error(`Pasta não encontrada: ${dir}`);
    process.exit(2);
  }
  if (ugArg && !/^\d{7}$/.test(ugArg)) {
    console.error('A UG deve ter exatamente 7 dígitos.');
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const ingestao = app.get(AplicIngestaoService);
    const config = app.get(AplicConfigService);

    // 1) Resolve o tenant por slug ou id.
    const tenant = await prisma.platform().tenant.findFirst({
      where: { OR: [{ slug: tenantRef }, { id: tenantRef }] },
      select: { id: true, slug: true, nome: true, aplicHabilitado: true, aplicUg: true },
    });
    if (!tenant) {
      console.error(`Tenant "${tenantRef}" não encontrado.`);
      process.exit(2);
    }
    console.log(`Entidade: ${tenant.nome} (${tenant.slug})`);

    // 2) Habilita a fonte / grava a UG, se pedido.
    if (habilitar) {
      const ug = ugArg ?? tenant.aplicUg;
      if (!ug) { console.error('--habilitar exige --ug (7 dígitos).'); process.exit(2); }
      if (!dry) {
        await prisma.platform().tenant.update({ where: { id: tenant.id }, data: { aplicHabilitado: true, aplicUg: ug } });
      }
      console.log(`Fonte APLIC ${dry ? '(dry) ' : ''}habilitada — UG ${ug}.`);
    }

    // 3) Confere a config efetiva.
    const cfg = await config.obter(tenant.id);
    const ugEsperada = ugArg ?? cfg.ug;
    if (!habilitar && !cfg.habilitado) {
      console.error('A fonte APLIC não está habilitada para esta entidade. Use --habilitar --ug, ou ligue no Gerenciador.');
      process.exit(1);
    }
    if (!ugEsperada) {
      console.error('UG não definida. Informe --ug ou configure no Gerenciador.');
      process.exit(1);
    }

    // 4) Seleciona as cargas: nome no padrão TCE, UG da entidade, módulo suportado.
    type Carga = { file: string; meta: ReturnType<typeof parseNomeCargaTce>; size: number };
    const candidatos: Carga[] = [];
    for (const file of listarZips(dir)) {
      const meta = parseNomeCargaTce(file);
      if (!meta) continue;
      if (meta.ug !== ugEsperada) continue;
      if (!(meta.modulo in PRIORIDADE)) continue; // só CT/CC/PL/ORCAMENTO
      if (filtroModulos.length && !filtroModulos.includes(meta.modulo)) continue;
      candidatos.push({ file, meta, size: fs.statSync(file).size });
    }

    // 5) Dedup por carga (ug+modulo+exercicio+competencia): se houver variantes
    //    (ex.: "2025" com PDFs e "2025_sem_pdf"), fica a MENOR (mais rápida).
    const porChave = new Map<string, Carga>();
    for (const c of candidatos) {
      const m = c.meta!;
      const chave = `${m.modulo}|${m.exercicio}|${m.competencia ?? ''}`;
      const atual = porChave.get(chave);
      if (!atual) { porChave.set(chave, c); continue; }
      const cSemPdf = /sem_pdf/i.test(c.file);
      const aSemPdf = /sem_pdf/i.test(atual.file);
      // Prefere a variante "sem_pdf"; em empate, fica a menor (mais rápida de ler).
      if ((cSemPdf && !aSemPdf) || (cSemPdf === aSemPdf && c.size < atual.size)) {
        porChave.set(chave, c);
      }
    }
    const cargas = [...porChave.values()].sort((a, b) => {
      const pa = PRIORIDADE[a.meta!.modulo], pb = PRIORIDADE[b.meta!.modulo];
      if (pa !== pb) return pa - pb;
      if (a.meta!.exercicio !== b.meta!.exercicio) return a.meta!.exercicio - b.meta!.exercicio;
      return (a.meta!.competencia ?? '').localeCompare(b.meta!.competencia ?? '');
    });

    console.log(`\n${cargas.length} carga(s) selecionada(s) (UG ${ugEsperada})${dry ? ' — DRY RUN' : ''}:`);
    for (const c of cargas) {
      const m = c.meta!;
      console.log(`  ${m.modulo.padEnd(10)} ${m.exercicio}/${m.competencia ?? '--'}  ${path.basename(c.file)} (${(c.size / 1e6).toFixed(1)} MB)`);
    }
    if (dry) { console.log('\nDRY RUN — nada foi importado.'); return; }

    // 6) Importa em ordem, tolerante a falhas.
    let ok = 0, falhas = 0, totalReg = 0;
    for (const c of cargas) {
      const nome = path.basename(c.file);
      try {
        const buf = fs.readFileSync(c.file);
        const r = await ingestao.importarZip(tenant.id, buf, { arquivoNome: nome, ugEsperada });
        const tabelas = Object.entries(r.porTabela).map(([k, v]) => `${k}:${v}`).join(' ');
        console.log(`✓ ${nome} — ${r.modulo} ${r.exercicio}/${r.competencia ?? '--'} — ${r.total} reg (${tabelas})`);
        ok++; totalReg += r.total;
      } catch (e) {
        console.error(`✗ ${nome} — ${(e as Error).message}`);
        falhas++;
      }
    }
    console.log(`\nConcluído: ${ok} importada(s), ${falhas} falha(s), ${totalReg} registro(s) no total.`);
    process.exitCode = falhas ? 1 : 0;
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Erro fatal na importação em lote:', e);
  process.exit(1);
});
