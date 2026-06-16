import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Criterio, CRITERIOS, PESO_EXIG } from './criterios';

// pesos dos 5 itens de verificação (somam 1)
const ITENS = { disp: 0.3, atual: 0.3, serie: 0.2, download: 0.1, filtro: 0.1 };

interface AvaliacaoCriterio extends Criterio {
  pct: number; // 0..1
  itens: { disp: boolean; atual: boolean; serie: boolean; download: boolean; filtro: boolean };
  atendido: boolean; // pct === 1
}

/**
 * Calcula o índice de conformidade PNTP do tenant atual (RLS), avaliando cada
 * critério pelos 5 itens de verificação. Aponta o selo e os ESSENCIAIS não
 * atendidos (bloqueantes do selo). Ver docs/13-pntp-criterios.md.
 */
@Injectable()
export class PntpService {
  constructor(private readonly prisma: PrismaService) {}

  private delegates(): Record<string, { count: (a?: unknown) => Promise<number> }> {
    const db = this.prisma.db;
    return {
      despesas: db.transpDespesa,
      receitas: db.transpReceita,
      folha: db.transpFolha,
      diarias: db.transpDiaria,
      obras: db.transpObra,
      'divida-ativa': db.transpDividaAtiva,
      terceirizados: db.transpTerceirizado,
      convenios: db.transpConvenio,
      licitacoes: db.transpLicitacao,
      contratos: db.transpContrato,
    };
  }

  /**
   * Uma URL de documento só "conta" para o PNTP se for de fato acessível ao
   * cidadão. O seed legado usava `https://<host>/doc/<arq>.pdf` (404) — esse
   * padrão não conta. URLs http(s) reais ou caminhos servidos pelo portal
   * (/api/transparencia/modelo/…, /midia/…) contam.
   */
  private urlPublicavel(url: string | null | undefined): boolean {
    if (!url) return false;
    if (/^https?:\/\/[^/]+\/doc\//i.test(url)) return false; // placeholder legado
    return /^https?:\/\//i.test(url) || url.startsWith('/');
  }

  private async ultima(dataset: string): Promise<boolean> {
    const log = await this.prisma.db.transpSyncLog.findFirst({
      where: { dataset, status: 'ok' },
      select: { id: true },
    });
    return !!log;
  }

  private async avaliar(c: Criterio): Promise<AvaliacaoCriterio> {
    let itens = { disp: false, atual: false, serie: false, download: false, filtro: false };

    if (c.fonte === 'dataset' && c.dataset) {
      const total = await this.delegates()[c.dataset].count();
      const disp = total > 0;
      itens = { disp, atual: disp && (await this.ultima(c.dataset)), serie: disp, download: disp, filtro: disp };
    } else if (c.fonte === 'documento' && c.categoria) {
      // Conta apenas documentos com URL REALMENTE publicável (não o placeholder
      // legado que apontava para um arquivo inexistente — link 404). Assim o
      // critério reflete o que o cidadão consegue baixar, não só o registro.
      const docs = await this.prisma.db.transpDocumento.findMany({
        where: { categoria: c.categoria },
        select: { urlExterna: true },
      });
      const disp = docs.some((d) => this.urlPublicavel(d.urlExterna));
      itens = { disp, atual: disp, serie: disp, download: disp, filtro: disp };
    } else if (c.fonte === 'cms' && c.cmsSlug) {
      const pg = await this.prisma.db.cmsPage.findFirst({ where: { slug: c.cmsSlug, publicado: true }, select: { id: true } });
      const ok = !!pg;
      itens = { disp: ok, atual: ok, serie: ok, download: ok, filtro: ok };
    } else {
      // manual: a plataforma já entrega (portal próprio, busca, e-SIC, a11y, dados abertos)
      itens = { disp: true, atual: true, serie: true, download: true, filtro: true };
    }

    const pct =
      (itens.disp ? ITENS.disp : 0) +
      (itens.atual ? ITENS.atual : 0) +
      (itens.serie ? ITENS.serie : 0) +
      (itens.download ? ITENS.download : 0) +
      (itens.filtro ? ITENS.filtro : 0);

    return { ...c, itens, pct, atendido: pct >= 0.999 };
  }

  async conformidade() {
    const avals = await Promise.all(CRITERIOS.map((c) => this.avaliar(c)));

    let possivel = 0;
    let obtido = 0;
    const porDimensao: Record<string, { peso: number; atendidos: number; total: number; obtido: number; possivel: number }> = {};

    for (const a of avals) {
      const peso = a.pesoDim * PESO_EXIG[a.exig];
      possivel += peso;
      obtido += peso * a.pct;
      const d = (porDimensao[a.dimensao] ??= { peso: a.pesoDim, atendidos: 0, total: 0, obtido: 0, possivel: 0 });
      d.total++;
      if (a.atendido) d.atendidos++;
      d.obtido += peso * a.pct;
      d.possivel += peso;
    }

    const indice = possivel > 0 ? (obtido / possivel) * 100 : 0;
    const bloqueantes = avals.filter((a) => a.exig === 'E' && !a.atendido);
    const essenciaisOk = bloqueantes.length === 0;
    const selo = this.selo(indice, essenciaisOk);

    return {
      indice: Math.round(indice * 100) / 100,
      selo,
      essenciaisOk,
      bloqueantes: bloqueantes.map((b) => ({ id: b.id, dimensao: b.dimensao, desc: b.desc })),
      porDimensao: Object.entries(porDimensao).map(([dimensao, v]) => ({
        dimensao,
        peso: v.peso,
        atendidos: v.atendidos,
        total: v.total,
        percentual: v.possivel > 0 ? Math.round((v.obtido / v.possivel) * 10000) / 100 : 0,
      })),
      criterios: avals.map((a) => ({ id: a.id, dimensao: a.dimensao, desc: a.desc, exig: a.exig, pct: Math.round(a.pct * 100), atendido: a.atendido, itens: a.itens })),
    };
  }

  private selo(indice: number, essenciaisOk: boolean): string {
    if (essenciaisOk) {
      if (indice >= 95) return 'Diamante';
      if (indice >= 85) return 'Ouro';
      if (indice >= 75) return 'Prata';
    }
    if (indice > 75) return 'Elevado';
    if (indice >= 50) return 'Intermediário';
    if (indice >= 30) return 'Básico';
    if (indice >= 1) return 'Inicial';
    return 'Inexistente';
  }
}
