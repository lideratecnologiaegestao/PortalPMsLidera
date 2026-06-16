import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantContext } from '../../../common/tenant/tenant.context';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import {
  aplicarVars,
  renderHtmlDocumento,
  renderHtmlFragmento,
  renderPdf,
  renderTxt,
  type VarsLgpd,
} from './lgpd-doc.render';

/** Dados complementares da geração (não cobertos por `tenants`). */
export interface DadosLgpdEntidade {
  dpoTelefone?: string;
  dpoEndereco?: string;
  enderecoEntidade?: string;
  municipio?: string;
  responsavelNome?: string;
  responsavelCargo?: string;
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function dataExtenso(d = new Date()): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Geração da documentação LGPD por entidade: combina o TEMPLATE global
 * (platform_settings) com os dados do tenant (`tenants` + complementos em
 * `lgpd_documentos.dados`) e renderiza HTML/TXT/PDF.
 *
 * RLS: a tabela `lgpd_documentos` tem RLS por tenant. Toda leitura/escrita roda
 * dentro de TenantContext.run({ tenantId }) — funciona tanto na chamada do
 * super_admin (cross-tenant, no Gerenciador) quanto do responsável da entidade.
 */
@Injectable()
export class LgpdDocService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /** Monta o dicionário de placeholders a partir do tenant + complementos + operadora. */
  private async montarVars(tenantId: string, dados: DadosLgpdEntidade): Promise<{ vars: VarsLgpd; entidadeNome: string; slug: string }> {
    const t = await this.prisma.platform().tenant.findUnique({
      where: { id: tenantId },
      select: { nome: true, cnpj: true, uf: true, slug: true, dpoNome: true, dpoEmail: true },
    });
    if (!t) throw new NotFoundException('Entidade não encontrada.');
    const op = await this.settings.operadora();
    const municipio = dados.municipio?.trim() || t.nome.replace(/^Prefeitura (Municipal )?(de |do |da )?/i, '').trim();

    const vars: VarsLgpd = {
      ENTIDADE: t.nome,
      CNPJ: t.cnpj ?? '—',
      MUNICIPIO: municipio,
      UF: t.uf,
      ENDERECO: dados.enderecoEntidade?.trim() || '—',
      DPO_NOME: t.dpoNome ?? '—',
      DPO_EMAIL: t.dpoEmail ?? '—',
      DPO_TELEFONE: dados.dpoTelefone?.trim() || '—',
      DPO_ENDERECO: dados.dpoEndereco?.trim() || '—',
      RESPONSAVEL_NOME: dados.responsavelNome?.trim() || '—',
      RESPONSAVEL_CARGO: dados.responsavelCargo?.trim() || 'Autoridade competente',
      OPERADORA_NOME: op.nome,
      OPERADORA_CNPJ: op.cnpj,
      DATA_EXTENSO: dataExtenso(),
      VERSAO: '1.0',
    };
    return { vars, entidadeNome: t.nome, slug: t.slug };
  }

  /** (Re)gera a documentação, persistindo dados + HTML. Retorna o estado atual. */
  async gerar(tenantId: string, dados: DadosLgpdEntidade, atorId?: string) {
    const { vars } = await this.montarVars(tenantId, dados);
    const { template } = await this.settings.getLgpdTemplate();
    const texto = aplicarVars(template, vars);
    const html = renderHtmlFragmento(texto);

    return TenantContext.run({ tenantId }, async () => {
      const existente = await this.prisma.db.lgpdDocumento.findUnique({ where: { tenantId } });
      const versao = (existente?.versao ?? 0) + 1;
      await this.prisma.db.lgpdDocumento.upsert({
        where: { tenantId },
        create: {
          tenantId,
          dados: dados as object,
          html,
          versao: 1,
          geradoEm: new Date(),
          geradoPor: atorId ?? null,
        },
        update: {
          dados: dados as object,
          html,
          versao,
          geradoEm: new Date(),
          geradoPor: atorId ?? null,
        },
      });
      return this.obterInterno(tenantId);
    });
  }

  /** Estado atual da documentação do tenant (sem o HTML completo — só metadados + inputs). */
  async obter(tenantId: string) {
    return TenantContext.run({ tenantId }, () => this.obterInterno(tenantId));
  }

  private async obterInterno(tenantId: string) {
    const doc = await this.prisma.db.lgpdDocumento.findUnique({ where: { tenantId } });
    return {
      gerado: !!doc?.geradoEm,
      publicado: doc?.publicado ?? false,
      versao: doc?.versao ?? null,
      geradoEm: doc?.geradoEm ?? null,
      publicadoEm: doc?.publicadoEm ?? null,
      dados: (doc?.dados as DadosLgpdEntidade) ?? {},
      temHtml: !!doc?.html,
    };
  }

  /** Publica/despublica a documentação na página /privacidade/sobre-lgpd. */
  async publicar(tenantId: string, publicado: boolean) {
    return TenantContext.run({ tenantId }, async () => {
      const doc = await this.prisma.db.lgpdDocumento.findUnique({ where: { tenantId } });
      if (!doc?.html) throw new NotFoundException('Gere a documentação antes de publicar.');
      await this.prisma.db.lgpdDocumento.update({
        where: { tenantId },
        data: { publicado, publicadoEm: publicado ? new Date() : null },
      });
      return this.obterInterno(tenantId);
    });
  }

  /** Conteúdo para download em pdf|txt|html. Re-renderiza a partir dos dados salvos. */
  async download(tenantId: string, formato: 'pdf' | 'txt' | 'html') {
    const doc = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.lgpdDocumento.findUnique({ where: { tenantId } }),
    );
    if (!doc?.geradoEm) throw new NotFoundException('Documentação ainda não gerada.');

    const { vars, slug, entidadeNome } = await this.montarVars(tenantId, (doc.dados as DadosLgpdEntidade) ?? {});
    const { template } = await this.settings.getLgpdTemplate();
    const texto = aplicarVars(template, vars);
    const titulo = `Documentação LGPD — ${entidadeNome}`;
    const base = `documentacao-lgpd-${slug}`;

    if (formato === 'txt') {
      return { buffer: Buffer.from(renderTxt(texto), 'utf8'), mime: 'text/plain; charset=utf-8', filename: `${base}.txt` };
    }
    if (formato === 'html') {
      return { buffer: Buffer.from(renderHtmlDocumento(texto, titulo), 'utf8'), mime: 'text/html; charset=utf-8', filename: `${base}.html` };
    }
    return { buffer: renderPdf(texto), mime: 'application/pdf', filename: `${base}.pdf` };
  }

  /** Documentação PUBLICADA para a página pública (RLS pelo host). null se não publicada. */
  async publico(tenantId: string): Promise<{ html: string; atualizadoEm: Date | null } | null> {
    return TenantContext.run({ tenantId }, async () => {
      const doc = await this.prisma.db.lgpdDocumento.findUnique({ where: { tenantId } });
      if (!doc?.publicado || !doc.html) return null;
      return { html: doc.html, atualizadoEm: doc.geradoEm ?? doc.atualizadoEm };
    });
  }
}
