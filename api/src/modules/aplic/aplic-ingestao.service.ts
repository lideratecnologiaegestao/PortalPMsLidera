import { Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  nuloSeVazio,
  parseDataAplic,
  parseDatapacket,
  parseValorAplic,
} from './aplic-datapacket.parser';
import { exigirNomeCargaTce } from './aplic-nomenclatura.util';
import { modalidadeLicitacao } from './aplic-tabelas.ref';
import { extrairReceitaArrecadada } from './aplic-receita.util';

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
    opts: { arquivoNome?: string; criadoPor?: string; ugEsperada?: string | null } = {},
  ): Promise<ResultadoImportacao> {
    // 1) O nome DEVE seguir a nomenclatura padrão do TCE-MT (rejeita .zip fora do padrão).
    const meta = exigirNomeCargaTce(opts.arquivoNome);
    const { ug, exercicio, competencia, modulo } = meta;

    // 2) A carga precisa ser da MESMA UG configurada para a entidade.
    if (opts.ugEsperada && ug !== opts.ugEsperada) {
      throw new Error(
        `Esta carga é da UG ${ug}, mas a entidade está configurada para a UG ${opts.ugEsperada}. ` +
          `Confira se está importando o arquivo correto (ou ajuste a UG no Gerenciador).`,
      );
    }

    // 3) Módulos suportados: CT (despesa), CC (contratos/convênios), PL
    //    (licitações) e ORCAMENTO (previsão de receita). Os demais virão depois.
    const SUPORTADOS = ['CT', 'CC', 'PL', 'ORCAMENTO'];
    if (!SUPORTADOS.includes(modulo)) {
      const nomes: Record<string, string> = {
        FP: 'Folha de Pagamento', PA: 'Patrimônio e Administrativo',
        CP: 'Concurso', CARGA_INICIAL: 'Carga Inicial', ENCERRAMENTO: 'Encerramento',
      };
      throw new Error(`Módulo "${modulo}"${nomes[modulo] ? ` (${nomes[modulo]})` : ''} ainda não é suportado. Importamos os módulos CT (Contabilidade), CC (Contratos/Convênios), PL (Licitações) e 00 (Orçamento/Receita).`);
    }

    const zip = await JSZip.loadAsync(zipBuffer);

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
        // 2) Credores (upsert por identificação) — presente em CT e PL.
        porTabela.CADASTRO_GERAL = await this.importarCredores(zip, tenantId);

        // 3) Por módulo (idempotente — ver migrations 057/086/087).
        if (modulo === 'CT') {
          const empBuf = await this.lerEntrada(zip, 'EMPENHO.XML');
          const empenhoRows = empBuf ? parseDatapacket(empBuf).rows : [];
          porTabela.DOTACAO = await this.importarDotacao(zip, tenantId, carga.id, exercicio, competencia);
          porTabela.EMPENHO = await this.importarEmpenhos(empenhoRows, tenantId, carga.id, exercicio, competencia);
          porTabela.LIQUIDACAO_EMPENHO = await this.importarLiquidacoes(zip, tenantId, carga.id, exercicio, competencia);
          porTabela.PAGAMENTO_EMPENHO = await this.importarPagamentos(zip, tenantId, carga.id, exercicio, competencia);
          porTabela.PAGAMENTO_EMPENHO_LIQUIDACAO = await this.importarPagLiq(zip, tenantId, carga.id, exercicio, competencia);
          // Receita arrecadada derivada do lançamento contábil (6.2.1.2 por natureza).
          porTabela.RECEITA_ARRECADADA = await this.importarReceitaArrecadada(zip, tenantId, carga.id, exercicio, competencia);
          await this.recomputarTranspReceitas(tenantId, exercicio);
        } else if (modulo === 'CC') {
          porTabela.CONTRATO = await this.importarContratos(zip, tenantId, exercicio);
          porTabela.CONVENIO = await this.importarConvenios(zip, tenantId, exercicio);
          await this.registrarSync(tenantId, 'contratos', porTabela.CONTRATO);
          await this.registrarSync(tenantId, 'convenios', porTabela.CONVENIO);
        } else if (modulo === 'PL') {
          porTabela.PROCESSO_LICITATORIO = await this.importarLicitacoes(zip, tenantId, exercicio);
          await this.registrarSync(tenantId, 'licitacoes', porTabela.PROCESSO_LICITATORIO);
        } else if (modulo === 'ORCAMENTO') {
          porTabela.PREVISAO_RECEITA = await this.importarPrevisaoReceita(zip, tenantId, carga.id, exercicio);
          // Atualiza a previsão em transp_receitas (arrecadado vem da carga CT).
          await this.recomputarTranspReceitas(tenantId, exercicio);
        }

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
      skipDuplicates: true,
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
      skipDuplicates: true,
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
      skipDuplicates: true,
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
      skipDuplicates: true,
      data: rows.map((r) => ({
        tenantId, cargaId, exercicio, competencia,
        orgCodigo: nuloSeVazio(r.ORG_Codigo), unorCodigo: nuloSeVazio(r.UNOR_Codigo),
        empNumero: nuloSeVazio(r.EMP_Numero), liqNumero: nuloSeVazio(r.LIQ_Numero),
        pgtoNumero: nuloSeVazio(r.PGTO_Numero), dados: r as object,
      })),
    });
    return rows.length;
  }

  // ---------------------------------------------------------- CC (contratos/convênios)
  // A ingestão alimenta as tabelas de Transparência existentes (transp_*),
  // marcando fonte_origem='APLIC/TCE-MT'. Upsert pela chave natural de cada
  // tabela (nunca duplica; reimportar atualiza). O CPF do fornecedor é guardado
  // inteiro e MASCARADO na leitura pública (datasets.service / mascararDocumento).

  /** Contratos (CONTRATO.XML + CONTRATADO.XML) → transp_contratos. */
  private async importarContratos(
    zip: JSZip, tenantId: string, exercicio: number,
  ): Promise<number> {
    const buf = await this.lerEntrada(zip, 'CONTRATO.XML');
    if (!buf) return 0;
    const { rows } = parseDatapacket(buf);

    // Mapa (numero|aditivo|tipo) → 1ª identificação do contratado.
    const contratadoBuf = await this.lerEntrada(zip, 'CONTRATADO.XML');
    const contratados = new Map<string, string>();
    if (contratadoBuf) {
      for (const c of parseDatapacket(contratadoBuf).rows) {
        const k = `${c.CONT_Numero ?? ''}|${c.CONT_NumAditivo ?? ''}|${c.CONT_Tipo ?? ''}`;
        const ident = nuloSeVazio(c.CG_Identificacao);
        if (ident && !contratados.has(k)) contratados.set(k, ident);
      }
    }

    let n = 0;
    for (const r of rows) {
      const base = nuloSeVazio(r.CONT_Numero);
      if (!base) continue;
      const aditivo = nuloSeVazio(r.CONT_NumAditivo);
      const numero = aditivo ? `${base}/${aditivo}` : base;
      const fornecedorDoc = contratados.get(`${base}|${r.CONT_NumAditivo ?? ''}|${r.CONT_Tipo ?? ''}`) ?? null;
      const fornecedorNome = fornecedorDoc ? await this.nomeCredor(tenantId, fornecedorDoc) : null;
      const dados = {
        exercicio,
        fornecedorNome,
        fornecedorDoc,
        objeto: nuloSeVazio(r.CONT_Objetivo),
        valor: parseValorAplic(r.CONT_Valor),
        vigenciaInicio: parseDataAplic(r.CONT_DataAssinatura),
        vigenciaFim: parseDataAplic(r.CONT_DataVencimento),
        fonteOrigem: 'APLIC/TCE-MT',
      };
      await this.prisma.db.transpContrato.upsert({
        where: { tenantId_numero: { tenantId, numero } },
        create: { tenantId, numero, ...dados },
        update: dados,
      });
      n++;
    }
    return n;
  }

  /** Convênios (CONVENIO.XML) → transp_convenios. */
  private async importarConvenios(
    zip: JSZip, tenantId: string, exercicio: number,
  ): Promise<number> {
    const buf = await this.lerEntrada(zip, 'CONVENIO.XML');
    if (!buf) return 0;
    const { rows } = parseDatapacket(buf);
    let n = 0;
    for (const r of rows) {
      const base = nuloSeVazio(r.CONV_Numero);
      if (!base) continue;
      const aditivo = nuloSeVazio(r.CONV_NumAditivo);
      const numero = aditivo ? `${base}/${aditivo}` : base;
      const dados = {
        objeto: nuloSeVazio(r.CONV_Objetivo),
        valor: parseValorAplic(r.CONV_Valor),
        vigenciaInicio: parseDataAplic(r.CONV_DataAssinatura),
        vigenciaFim: parseDataAplic(r.CONV_DataVencimento),
        fonteOrigem: 'APLIC/TCE-MT',
      };
      await this.prisma.db.transpConvenio.upsert({
        where: { tenantId_exercicio_numero: { tenantId, exercicio, numero } },
        create: { tenantId, exercicio, numero, ...dados },
        update: dados,
      });
      n++;
    }
    return n;
  }

  // ---------------------------------------------------------- PL (licitações)

  /** Licitações (PROCESSO_LICITATORIO.XML + ITEM_PROC_LICIT.XML) → transp_licitacoes. */
  private async importarLicitacoes(
    zip: JSZip, tenantId: string, exercicio: number,
  ): Promise<number> {
    const buf = await this.lerEntrada(zip, 'PROCESSO_LICITATORIO.XML');
    if (!buf) return 0;
    const { rows } = parseDatapacket(buf);

    // Agrega ITEM_PROC_LICIT por PLIC_Numero: soma estimada + 1º objeto.
    const itensBuf = await this.lerEntrada(zip, 'ITEM_PROC_LICIT.XML');
    const agreg = new Map<string, { valor: number; objeto: string | null }>();
    if (itensBuf) {
      for (const it of parseDatapacket(itensBuf).rows) {
        const k = nuloSeVazio(it.PLIC_Numero) ?? '';
        const cur = agreg.get(k) ?? { valor: 0, objeto: null };
        cur.valor += parseValorAplic(it.IPLIC_ValEstimado);
        if (!cur.objeto) cur.objeto = nuloSeVazio(it.IPLIC_DescricaoItem);
        agreg.set(k, cur);
      }
    }

    let n = 0;
    for (const r of rows) {
      const numero = nuloSeVazio(r.PLIC_Numero);
      if (!numero) continue;
      const ag = agreg.get(numero) ?? { valor: 0, objeto: null };
      const dados = {
        modalidade: modalidadeLicitacao(nuloSeVazio(r.MLIC_Codigo)),
        objeto: ag.objeto,
        valorEstimado: ag.valor || null,
        situacao: nuloSeVazio(r.PLIC_SituacaoPlanejamento),
        dataAbertura: parseDataAplic(r.PLICP_Data),
        fonteOrigem: 'APLIC/TCE-MT',
      };
      await this.prisma.db.transpLicitacao.upsert({
        where: { tenantId_exercicio_numero: { tenantId, exercicio, numero } },
        create: { tenantId, exercicio, numero, ...dados },
        update: dados,
      });
      n++;
    }
    return n;
  }

  /** Nome do credor (para o fornecedor do contrato), se já cadastrado por uma carga CT. */
  private async nomeCredor(tenantId: string, identificacao: string): Promise<string | null> {
    const c = await this.prisma.db.aplicCredor.findUnique({
      where: { tenantId_identificacao: { tenantId, identificacao } },
      select: { nome: true },
    });
    return c?.nome ?? null;
  }

  // ---------------------------------------------------------- 00 (previsão de receita)

  /** Previsão de receita (PREVISAO_RECEITA.XML). Carga anual: substitui o exercício. */
  private async importarPrevisaoReceita(
    zip: JSZip, tenantId: string, cargaId: string, exercicio: number,
  ): Promise<number> {
    const buf = await this.lerEntrada(zip, 'PREVISAO_RECEITA.XML');
    if (!buf) return 0;
    const { rows } = parseDatapacket(buf);
    await this.prisma.db.aplicPrevisaoReceita.deleteMany({ where: { tenantId, exercicio } });
    if (!rows.length) return 0;
    await this.prisma.db.aplicPrevisaoReceita.createMany({
      data: rows.map((r) => ({
        tenantId, cargaId, exercicio,
        esprcCodigo: nuloSeVazio(r.ESPRC_Codigo), toprCodigo: nuloSeVazio(r.TOPR_Codigo),
        drgrpCodigo: nuloSeVazio(r.DRGRP_Codigo), drespCodigo: nuloSeVazio(r.DRESP_Codigo),
        destrecCodigo: nuloSeVazio(r.DESTREC_Codigo), tipoPrevisao: nuloSeVazio(r.PVRC_TipoPrevisao),
        mesReferencia: nuloSeVazio(r.PVRC_MesReferencia), valor: parseValorAplic(r.PVRC_Valor),
        dados: r as object,
      })),
    });
    return rows.length;
  }

  /**
   * Receita ARRECADADA por natureza, derivada do LANCAMENTO_CONTABIL_DIARIO
   * (conta de controle 6.2.1.2 do PCASP/TCE). Carga mensal: substitui a
   * competência. Devolve a qtd de naturezas.
   */
  private async importarReceitaArrecadada(
    zip: JSZip, tenantId: string, cargaId: string, exercicio: number, competencia: string | null,
  ): Promise<number> {
    const buf = await this.lerEntrada(zip, 'LANCAMENTO_CONTABIL_DIARIO_TCE.XML');
    await this.prisma.db.aplicReceitaArrecadada.deleteMany({ where: { tenantId, exercicio, competencia } });
    if (!buf) return 0;
    if (buf.length > 300 * 1024 * 1024) {
      this.log.warn(`LANCAMENTO_CONTABIL_DIARIO ${buf.length} bytes — acima do limite; receita arrecadada não processada.`);
      return 0;
    }
    const naturezas = extrairReceitaArrecadada(buf.toString('latin1'))
      .filter((n) => n.arrecadado !== 0 || n.deducao !== 0);
    if (!naturezas.length) return 0;
    await this.prisma.db.aplicReceitaArrecadada.createMany({
      data: naturezas.map((n) => ({
        tenantId, cargaId, exercicio, competencia,
        naturezaCodigo: n.codigo, naturezaNome: n.nome,
        valorArrecadado: n.arrecadado, valorDeducao: n.deducao,
      })),
    });
    return naturezas.length;
  }

  /**
   * Recalcula `transp_receitas` (origem APLIC) do exercício: previsto (de
   * aplic_previsao_receita) × arrecadado (soma de aplic_receita_arrecadada por
   * natureza). Substitui apenas as linhas de fonte APLIC — preserva cadastro
   * manual. Alimenta a página de Receitas e o PNTP 3.1.
   */
  private async recomputarTranspReceitas(tenantId: string, exercicio: number): Promise<void> {
    const linhas = await this.prisma.db.$queryRaw<
      { codigo: string; nome: string | null; arrecadado: string; previsto: string }[]
    >`
      SELECT a.natureza_codigo AS codigo,
             max(a.natureza_nome) AS nome,
             coalesce(sum(a.valor_arrecadado), 0) AS arrecadado,
             coalesce((SELECT sum(p.valor) FROM aplic_previsao_receita p
                        WHERE p.exercicio = ${exercicio} AND p.esprc_codigo = a.natureza_codigo), 0) AS previsto
      FROM aplic_receita_arrecadada a
      WHERE a.exercicio = ${exercicio}
      GROUP BY a.natureza_codigo`;

    const dataLanc = new Date(Date.UTC(exercicio, 0, 1)); // sentinela por exercício
    await this.prisma.db.transpReceita.deleteMany({
      where: { exercicio, fonteOrigem: 'APLIC/TCE-MT', dataLancamento: dataLanc },
    });
    if (!linhas.length) return;
    await this.prisma.db.transpReceita.createMany({
      data: linhas.map((l) => ({
        tenantId, exercicio,
        codigo: l.codigo, descricao: l.nome,
        valorPrevisto: l.previsto, valorArrecadado: l.arrecadado,
        dataLancamento: dataLanc, fonteOrigem: 'APLIC/TCE-MT',
      })),
    });
    await this.registrarSync(tenantId, 'receitas', linhas.length);
  }

  // ---------------------------------------------------------------- helpers

  /** Registra a sincronização do dataset de Transparência (alimenta "última atualização"). */
  private async registrarSync(tenantId: string, dataset: string, registros: number): Promise<void> {
    await this.prisma.db.transpSyncLog.create({
      data: { tenantId, dataset, origem: 'APLIC/TCE-MT', registros, status: 'ok' },
    });
  }

  /** Lê uma entrada do zip por nome (case-insensitive). */
  private async lerEntrada(zip: JSZip, nome: string): Promise<Buffer | null> {
    const alvo = nome.toUpperCase();
    const chave = Object.keys(zip.files).find((k) => k.toUpperCase() === alvo);
    if (!chave) return null;
    return zip.files[chave].async('nodebuffer');
  }
}
