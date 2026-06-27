import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { TenantContext } from '../../common/tenant/tenant.context';
import { AplicConsultaService } from './aplic-consulta.service';
import { AplicConfigService } from './aplic-config.service';

/**
 * Vitrine PÚBLICA da execução da despesa (APLIC/TCE-MT) — Transparência ativa
 * (LC 131/2009) + Dados Abertos (CSV/JSON, CC BY 4.0). Sem auth; tenant via Host
 * (RLS automático). Credores pessoa física com CPF mascarado (LGPD).
 *
 * Só serve dados quando a fonte APLIC está HABILITADA para a entidade (painel
 * central). Desligada → respostas vazias (a página mostra "não publicado").
 */
@Controller('transparencia/despesas')
export class AplicPublicController {
  constructor(
    private readonly consulta: AplicConsultaService,
    private readonly config: AplicConfigService,
  ) {}

  /** true quando há tenant no contexto e a fonte APLIC está habilitada. */
  private async ativo(): Promise<boolean> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) return false;
    return (await this.config.obter(tenantId)).habilitado;
  }

  @Get('resumo')
  @Header('Cache-Control', 'public, max-age=300')
  async resumo(@Query('exercicio') ex?: string) {
    if (!(await this.ativo())) return null;
    return this.consulta.resumo(ex ? Number(ex) : undefined);
  }

  @Get('empenhos')
  @Header('Cache-Control', 'public, max-age=300')
  async empenhos(
    @Query('exercicio') ex?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (!(await this.ativo())) return { page: 1, pageSize: 20, total: 0, itens: [] };
    return this.consulta.listarEmpenhos({
      exercicio: ex ? Number(ex) : undefined,
      q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('credores')
  @Header('Cache-Control', 'public, max-age=300')
  async credores(@Query('exercicio') ex?: string, @Query('por') por?: string, @Query('limite') limite?: string) {
    if (!(await this.ativo())) return null;
    return this.consulta.maioresCredores({
      exercicio: ex ? Number(ex) : undefined,
      por: por === 'liquidado' ? 'liquidado' : 'empenhado',
      limite: limite ? Number(limite) : undefined,
    });
  }

  /** Dicionário de dados do conjunto de empenhos (dados abertos). */
  @Get('dicionario')
  @Header('Cache-Control', 'public, max-age=3600')
  dicionario() {
    return {
      conjunto: 'execucao-despesa-empenhos',
      licenca: 'CC BY 4.0',
      fonte: 'APLIC/TCE-MT (carga contábil da entidade)',
      campos: [
        { campo: 'exercicio', tipo: 'inteiro', descricao: 'Ano do exercício financeiro.' },
        { campo: 'orgao', tipo: 'texto', descricao: 'Código do órgão.' },
        { campo: 'empenho', tipo: 'texto', descricao: 'Número do empenho (NNNNNN/AAAA).' },
        { campo: 'data', tipo: 'data', descricao: 'Data do empenho (AAAA-MM-DD).' },
        { campo: 'credor', tipo: 'texto', descricao: 'CPF (mascarado) ou CNPJ do credor.' },
        { campo: 'credorNome', tipo: 'texto', descricao: 'Nome do credor (quando cadastrado).' },
        { campo: 'descricao', tipo: 'texto', descricao: 'Descrição/objeto do empenho.' },
        { campo: 'empenhado', tipo: 'decimal', descricao: 'Valor empenhado (R$).' },
        { campo: 'liquidado', tipo: 'decimal', descricao: 'Valor liquidado do empenho (R$).' },
        { campo: 'pago', tipo: 'decimal', descricao: 'Valor pago do empenho (R$).' },
      ],
    };
  }

  /** Dados abertos — JSON. */
  @Get('export/empenhos.json')
  @Header('Cache-Control', 'public, max-age=600')
  async exportJson(@Query('exercicio') ex?: string) {
    if (!(await this.ativo())) return { licenca: 'CC BY 4.0', dados: [] };
    const dados = await this.consulta.empenhosExport(ex ? Number(ex) : undefined);
    return { licenca: 'CC BY 4.0', fonte: 'APLIC/TCE-MT', exercicio: ex ? Number(ex) : null, total: dados.length, dados };
  }

  /** Dados abertos — CSV. */
  @Get('export/empenhos.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=600')
  async exportCsv(@Res() res: Response, @Query('exercicio') ex?: string) {
    res.setHeader('Content-Disposition', `attachment; filename="empenhos${ex ? '-' + ex : ''}.csv"`);
    if (!(await this.ativo())) {
      res.send('');
      return;
    }
    const dados = await this.consulta.empenhosExport(ex ? Number(ex) : undefined);
    const cols = ['exercicio', 'orgao', 'empenho', 'data', 'credor', 'credorNome', 'descricao', 'empenhado', 'liquidado', 'pago'] as const;
    const linhas = [cols.join(';')];
    for (const d of dados) {
      linhas.push(cols.map((c) => csvCampo((d as Record<string, unknown>)[c])).join(';'));
    }
    res.send('﻿' + linhas.join('\r\n')); // BOM p/ Excel abrir acentos
  }
}

/** Escapa um campo para CSV (delimitador ';'). */
function csvCampo(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
