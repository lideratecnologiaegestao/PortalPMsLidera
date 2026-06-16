import { Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  exercicioDeNumero,
  nuloSeVazio,
  parseDataAplic,
  parseDatapacket,
  parseValorAplic,
} from './aplic-datapacket.parser';

export interface ResultadoImportacao {
  cargaId: string;
  modulo: string;
  ug: string | null;
  exercicio: number;
  competencia: string | null;
  porTabela: Record<string, number>;
  total: number;
}

/**
 * Ingestão da carga contábil APLIC (TCE-MT) — módulo CT (execução da despesa).
 * Recebe o .zip (buffer), faz parse dos XMLs DATAPACKET e grava nas tabelas
 * canônicas aplic_* (RLS por tenant). Idempotente:
 *   - credores: upsert por (tenant, identificacao);
 *   - movimentos (empenho/liquidação/pagamento/dotação): substituídos por
 *     (tenant, exercicio, competencia) — reimportar a competência sobrescreve.
 *
 * LGPD: CADASTRO_GERAL traz CPF/CNPJ; é armazenado para rastreabilidade, mas o
 * mascaramento ocorre na camada de leitura pública/IA (nunca aqui em claro em log).
 */
@Injectable()
export class AplicIngestaoService {
  private readonly log = new Logger(AplicIngestaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importarZip(
    tenantId: string,
    zipBuffer: Buffer,
    opts: { arquivoNome?: string; criadoPor?: string } = {},
  ): Promise<ResultadoImportacao> {
    const zip = await JSZip.loadAsync(zipBuffer);
    const meta = this.detectarMeta(opts.arquivoNome, zip);

    // Determina exercício: do nome do arquivo OU do 1º empenho da carga.
    const empBuf = await this.lerEntrada(zip, 'EMPENHO.XML');
    const empenhoRows = empBuf ? parseDatapacket(empBuf).rows : [];
    const exercicio =
      meta.exercicio ??
      (empenhoRows.length ? exercicioDeNumero(empenhoRows[0].EMP_Numero) : null) ??
      null;
    if (exercicio == null) {
      throw new Error('Não foi possível determinar o exercício da carga (nome do arquivo e dados sem ano).');
    }
    const competencia = meta.competencia ?? null;
    const ug = meta.ug;

    // Módulo: do nome; se o nome não casar mas houver EMPENHO.XML, é CT.
    let modulo = meta.modulo;
    if (!modulo && empBuf) modulo = 'CT';
    if (!modulo) {
      throw new Error('Não identifiquei o módulo pelo nome do arquivo. Esperado algo como "1113190CT202601.ZIP".');
    }
    // Fase 1 cobre apenas CT (Contabilidade). Demais módulos virão depois.
    if (modulo !== 'CT') {
      const nomes: Record<string, string> = {
        CC: 'Contratos e Convênios', FP: 'Folha de Pagamento', PA: 'Patrimônio e Administrativo',
        PL: 'Processo Licitatório', ORCAMENTO: 'Orçamento', CARGA_INICIAL: 'Carga Inicial', ENCERRAMENTO: 'Encerramento',
      };
      throw new Error(`Módulo "${modulo}"${nomes[modulo] ? ` (${nomes[modulo]})` : ''} ainda não é suportado. No momento importamos apenas o módulo CT (Contabilidade).`);
    }

    return TenantContext.run({ tenantId }, async () => {
      // Validação de UG: não misturar a carga de uma entidade na de outra.
      if (ug) {
        const outras = await this.prisma.db.aplicCarga.findMany({
          where: { ug: { not: null }, NOT: { ug } },
          select: { ug: true },
          distinct: ['ug'],
          take: 1,
        });
        if (outras.length) {
          throw new Error(`Esta carga é da UG ${ug}, mas esta entidade já tem dados da UG ${outras[0].ug}. Confira se está importando na entidade correta.`);
        }
      }

      // 1) Registra a carga (status processando)
      const carga = await this.prisma.db.aplicCarga.create({
        data: {
          tenantId,
          modulo,
          ug,
          exercicio,
          competencia,
          arquivoNome: opts.arquivoNome ?? null,
          status: 'processando',
          criadoPor: opts.criadoPor ?? null,
        },
      });

      const porTabela: Record<string, number> = {};
      try {
        // 2) Credores (upsert por identificação)
        porTabela.CADASTRO_GERAL = await this.importarCredores(zip, tenantId);

        // 3) Movimentos (substitui a competência)
        porTabela.DOTACAO = await this.importarDotacao(zip, tenantId, carga.id, exercicio, competencia);
        porTabela.EMPENHO = await this.importarEmpenhos(empenhoRows, tenantId, carga.id, exercicio, competencia);
        porTabela.LIQUIDACAO_EMPENHO = await this.importarLiquidacoes(zip, tenantId, carga.id, exercicio, competencia);
        porTabela.PAGAMENTO_EMPENHO = await this.importarPagamentos(zip, tenantId, carga.id, exercicio, competencia);
        porTabela.PAGAMENTO_EMPENHO_LIQUIDACAO = await this.importarPagLiq(zip, tenantId, carga.id, exercicio, competencia);

        const total = Object.values(porTabela).reduce((a, b) => a + b, 0);
        await this.prisma.db.aplicCarga.update({
          where: { id: carga.id },
          data: { status: 'concluida', totalRegistros: total, porTabela },
        });
        this.log.log(`Carga APLIC ${modulo} UG ${ug ?? '-'} ${exercicio}/${competencia ?? '-'} tenant ${tenantId}: ${total} registros.`);
        return { cargaId: carga.id, modulo, ug, exercicio, competencia, porTabela, total };
      } catch (e) {
        await this.prisma.db.aplicCarga.update({
          where: { id: carga.id },
          data: { status: 'erro', erro: String((e as Error).message).slice(0, 500), porTabela },
        });
        throw e;
      }
    });
  }

  // ---------------------------------------------------------------- tabelas

  private async importarCredores(zip: JSZip, tenantId: string): Promise<number> {
    const buf = await this.lerEntrada(zip, 'CADASTRO_GERAL.XML');
    if (!buf) return 0;
    const { rows } = parseDatapacket(buf);
    let n = 0;
    for (const r of rows) {
      const identificacao = nuloSeVazio(r.CG_Identificacao);
      if (!identificacao) continue;
      const dados = {
        identificacao,
        tipoPessoa: nuloSeVazio(r.CG_TipoPessoa),
        nome: nuloSeVazio(r.CG_Nome),
        municipioCod: nuloSeVazio(r.CG_CodMunicipio),
        dados: r as object,
      };
      await this.prisma.db.aplicCredor.upsert({
        where: { tenantId_identificacao: { tenantId, identificacao } },
        create: { tenantId, ...dados },
        update: { ...dados },
      });
      n++;
    }
    return n;
  }

  private async importarDotacao(
    zip: JSZip, tenantId: string, cargaId: string, exercicio: number, competencia: string | null,
  ): Promise<number> {
    const buf = await this.lerEntrada(zip, 'DOTACAO.XML');
    if (!buf) return 0;
    const { rows } = parseDatapacket(buf);
    await this.prisma.db.aplicDotacao.deleteMany({ where: { tenantId, exercicio, competencia } });
    if (!rows.length) return 0;
    await this.prisma.db.aplicDotacao.createMany({
      data: rows.map((r) => ({
        tenantId, cargaId, exercicio, competencia,
        orgCodigo: nuloSeVazio(r.ORG_Codigo), unorCodigo: nuloSeVazio(r.UNOR_Codigo),
        dados: r as object,
      })),
    });
    return rows.length;
  }

  private async importarEmpenhos(
    rows: Record<string, string>[], tenantId: string, cargaId: string, exercicio: number, competencia: string | null,
  ): Promise<number> {
    await this.prisma.db.aplicEmpenho.deleteMany({ where: { tenantId, exercicio, competencia } });
    if (!rows.length) return 0;
    await this.prisma.db.aplicEmpenho.createMany({
      data: rows.map((r) => ({
        tenantId, cargaId, exercicio, competencia,
        orgCodigo: nuloSeVazio(r.ORG_Codigo), unorCodigo: nuloSeVazio(r.UNOR_Codigo),
        empNumero: r.EMP_Numero ?? '', empData: parseDataAplic(r.EMP_Data),
        empValor: parseValorAplic(r.EMP_Valor), credorIdent: nuloSeVazio(r.CG_Identificacao),
        fnCodigo: nuloSeVazio(r.FN_Codigo), elementoDesp: nuloSeVazio(r.ELDE_Codigo),
        descricao: nuloSeVazio(r.EMP_Descricao), dados: r as object,
      })),
    });
    return rows.length;
  }

  private async importarLiquidacoes(
    zip: JSZip, tenantId: string, cargaId: string, exercicio: number, competencia: string | null,
  ): Promise<number> {
    const buf = await this.lerEntrada(zip, 'LIQUIDACAO_EMPENHO.XML');
    if (!buf) return 0;
    const { rows } = parseDatapacket(buf);
    await this.prisma.db.aplicLiquidacao.deleteMany({ where: { tenantId, exercicio, competencia } });
    if (!rows.length) return 0;
    await this.prisma.db.aplicLiquidacao.createMany({
      data: rows.map((r) => ({
        tenantId, cargaId, exercicio, competencia,
        orgCodigo: nuloSeVazio(r.ORG_Codigo), unorCodigo: nuloSeVazio(r.UNOR_Codigo),
        empNumero: r.EMP_Numero ?? '', liqNumero: r.LIQ_Numero ?? '',
        liqData: parseDataAplic(r.LIQ_Data), liqValor: parseValorAplic(r.LIQ_Valor),
        dados: r as object,
      })),
    });
    return rows.length;
  }

  private async importarPagamentos(
    zip: JSZip, tenantId: string, cargaId: string, exercicio: number, competencia: string | null,
  ): Promise<number> {
    const buf = await this.lerEntrada(zip, 'PAGAMENTO_EMPENHO.XML');
    if (!buf) return 0;
    const { rows } = parseDatapacket(buf);
    await this.prisma.db.aplicPagamento.deleteMany({ where: { tenantId, exercicio, competencia } });
    if (!rows.length) return 0;
    await this.prisma.db.aplicPagamento.createMany({
      data: rows.map((r) => ({
        tenantId, cargaId, exercicio, competencia,
        pgtoNumero: r.PGTO_Numero ?? '', pgtoData: parseDataAplic(r.PGTO_Data),
        pgtoValor: parseValorAplic(r.PGTO_Valor), dados: r as object,
      })),
    });
    return rows.length;
  }

  private async importarPagLiq(
    zip: JSZip, tenantId: string, cargaId: string, exercicio: number, competencia: string | null,
  ): Promise<number> {
    const buf = await this.lerEntrada(zip, 'PAGAMENTO_EMPENHO_LIQUIDACAO.XML');
    if (!buf) return 0;
    const { rows } = parseDatapacket(buf);
    await this.prisma.db.aplicPagamentoLiquidacao.deleteMany({ where: { tenantId, exercicio, competencia } });
    if (!rows.length) return 0;
    await this.prisma.db.aplicPagamentoLiquidacao.createMany({
      data: rows.map((r) => ({
        tenantId, cargaId, exercicio, competencia,
        orgCodigo: nuloSeVazio(r.ORG_Codigo), unorCodigo: nuloSeVazio(r.UNOR_Codigo),
        empNumero: nuloSeVazio(r.EMP_Numero), liqNumero: nuloSeVazio(r.LIQ_Numero),
        pgtoNumero: nuloSeVazio(r.PGTO_Numero), dados: r as object,
      })),
    });
    return rows.length;
  }

  // ---------------------------------------------------------------- helpers

  /** Lê uma entrada do zip por nome (case-insensitive). */
  private async lerEntrada(zip: JSZip, nome: string): Promise<Buffer | null> {
    const alvo = nome.toUpperCase();
    const chave = Object.keys(zip.files).find((k) => k.toUpperCase() === alvo);
    if (!chave) return null;
    return zip.files[chave].async('nodebuffer');
  }

  /**
   * Extrai UG/módulo/exercício/competência do nome do arquivo da carga.
   * Ex.: "1113190CT202601.ZIP" → UG 1113190, módulo CT, 2026, comp. 01.
   * Os 7 primeiros dígitos são a Unidade Gestora (código da entidade no TCE-MT).
   * Módulos: CT (Contabilidade), CC (Contratos/Convênios), FP (Folha), PA
   * (Patrimônio/Administrativo), PL (Processo Licitatório, tempestiva). Tolera sufixo "_NNN".
   */
  private detectarMeta(
    arquivoNome: string | undefined,
    _zip: JSZip,
  ): { ug: string | null; modulo: string | null; exercicio: number | null; competencia: string | null } {
    const base = (arquivoNome ?? '').split(/[\\/]/).pop()?.replace(/\.zip$/i, '') ?? '';
    const mUg = base.match(/^(\d{7})/);
    const ug = mUg?.[1] ?? null;
    const resto = mUg ? base.slice(7) : base;

    // Módulos MENSAIS por LETRAS: CT/CC/FP/PA/PL + ano(4) + competência(2).
    const mLetra = resto.match(/^([A-Za-z]{2})(\d{4})(\d{2})/);
    if (mLetra) {
      return { ug, modulo: mLetra[1].toUpperCase(), exercicio: Number(mLetra[2]), competencia: mLetra[3] };
    }
    // Módulos ANUAIS por CÓDIGO numérico (sem competência):
    //   00 = Orçamento, 99 = Carga Inicial, 13 = Encerramento.
    const mCod = resto.match(/^(\d{2})(\d{4})/);
    if (mCod) {
      const cod: Record<string, string> = { '00': 'ORCAMENTO', '99': 'CARGA_INICIAL', '13': 'ENCERRAMENTO' };
      return { ug, modulo: cod[mCod[1]] ?? `COD_${mCod[1]}`, exercicio: Number(mCod[2]), competencia: null };
    }
    return { ug, modulo: null, exercicio: null, competencia: null };
  }
}
