/**
 * Página pública de estatísticas do e-SIC (Server Component / SSR+ISR).
 *
 * Exibe indicadores agregados e anonimizados do serviço de Acesso à
 * Informação (LAI 12.527/2011), sem dados pessoais dos solicitantes.
 *
 * Acessibilidade: tabelas com caption + th scope, contraste por tokens,
 * estado vazio descritivo, foco visível, lang="pt-BR" no layout raiz.
 */

import type { Metadata } from 'next';
import PageContainer from '../../../components/portal/PageContainer';
import { getEsicEstatisticas, type EsicEstatisticas } from '../../../lib/esic';
import { dataCurta, dataHora } from '../../../lib/format';

export const metadata: Metadata = {
  title: 'Estatísticas e-SIC — Acesso à Informação',
  description:
    'Indicadores públicos do Serviço de Informação ao Cidadão (e-SIC): total de pedidos, taxa de resposta, cumprimento de prazos e série histórica mensal.',
};

// ISR: a página é regenerada a cada 5 minutos no servidor; sem pageview SSR
// para cada visita.
export const revalidate = 300;

// ─── Utilitários de formatação ────────────────────────────────────────────────

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1).replace('.', ',')} %`;
}

function dias(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1).replace('.', ',')} dias`;
}

/**
 * Converte "2024-01" → "jan/2024" (abreviado pt-BR).
 */
function mesAbrev(iso: string): string {
  const [ano, mes] = iso.split('-');
  const data = new Date(Number(ano), Number(mes) - 1, 1);
  return data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

/** Label legível para cada status vindo da API. */
function labelStatus(status: string): string {
  const mapa: Record<string, string> = {
    ABERTO: 'Aberto',
    EM_ANDAMENTO: 'Em andamento',
    RESPONDIDO: 'Respondido',
    CONCLUIDO: 'Concluído',
    RECURSO: 'Em recurso',
    CANCELADO: 'Cancelado',
    AGUARDANDO_COMPLEMENTO: 'Aguardando complemento',
  };
  return mapa[status] ?? status;
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function CardResumo({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-lg border p-5 flex flex-col gap-1',
        destaque
          ? 'border-primary bg-primary/5'
          : 'border-border bg-muted/30',
      ].join(' ')}
    >
      <span className="text-sm text-fg/70 font-medium">{rotulo}</span>
      <span
        className={[
          'font-heading text-2xl font-bold',
          destaque ? 'text-primary' : 'text-fg',
        ].join(' ')}
        aria-label={`${rotulo}: ${valor}`}
      >
        {valor}
      </span>
    </div>
  );
}

// Barra de progresso acessível para exibir percentuais
function BarraProgresso({ valor, max }: { valor: number; max: number }) {
  const pctNum = max > 0 ? Math.min(100, (valor / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`${valor} de ${max}`}
      className="h-2 w-full rounded-full bg-muted overflow-hidden"
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pctNum}%` }}
      />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

function EstadoVazio() {
  return (
    <p
      role="status"
      className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center text-fg/70"
    >
      Não há dados de estatísticas disponíveis no momento. Tente novamente
      mais tarde.
    </p>
  );
}

function Conteudo({ dados }: { dados: EsicEstatisticas }) {
  const {
    geradoEm,
    total,
    abertos,
    respondidas,
    taxaResposta,
    taxaNoPrazo,
    tempoMedioDias,
    porStatus,
    serieMensal,
    ultimasSolicitacoes,
  } = dados;

  return (
    <div className="space-y-10">
      {/* ── Cards de resumo ── */}
      <section aria-labelledby="resumo-titulo">
        <h2
          id="resumo-titulo"
          className="font-heading text-xl font-bold mb-4"
        >
          Resumo
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardResumo
            rotulo="Total de pedidos"
            valor={total.toLocaleString('pt-BR')}
          />
          <CardResumo
            rotulo="Em aberto"
            valor={abertos.toLocaleString('pt-BR')}
          />
          <CardResumo
            rotulo="Taxa de resposta"
            valor={pct(taxaResposta)}
            destaque
          />
          <CardResumo
            rotulo="Respondidos no prazo"
            valor={pct(taxaNoPrazo)}
            destaque
          />
        </div>
        <p className="mt-3 text-sm text-fg/60">
          Tempo médio de resposta:{' '}
          <strong className="text-fg">{dias(tempoMedioDias)}</strong>
          {' · '}
          Prazo legal: 20 dias úteis + 10 dias prorrogáveis (LAI 12.527/2011)
        </p>
      </section>

      {/* ── Distribuição por status ── */}
      {porStatus.length > 0 && (
        <section aria-labelledby="status-titulo">
          <h2
            id="status-titulo"
            className="font-heading text-xl font-bold mb-4"
          >
            Distribuição por Status
          </h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Quantidade de pedidos de acesso à informação por status
              </caption>
              <thead className="bg-muted/50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-semibold text-fg w-24"
                  >
                    Pedidos
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg w-48 hidden sm:table-cell"
                  >
                    Proporção
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porStatus.map((s) => (
                  <tr key={s.status} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-fg">
                      {labelStatus(s.status)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg">
                      {s.total.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <BarraProgresso valor={s.total} max={total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Série mensal ── */}
      {serieMensal.length > 0 && (
        <section aria-labelledby="serie-titulo">
          <h2
            id="serie-titulo"
            className="font-heading text-xl font-bold mb-4"
          >
            Pedidos por Mês (últimos 12 meses)
          </h2>

          {/* Gráfico de barras acessível via tabela + representação visual CSS */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Número de pedidos de acesso à informação por mês nos últimos 12
                meses
              </caption>
              <thead className="bg-muted/50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg"
                  >
                    Mês
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-semibold text-fg w-24"
                  >
                    Pedidos
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg hidden sm:table-cell"
                  >
                    Volume
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {serieMensal.map((m) => {
                  const maxMes = Math.max(...serieMensal.map((x) => x.total));
                  return (
                    <tr key={m.mes} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-fg font-medium">
                        {mesAbrev(m.mes)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-fg">
                        {m.total.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <BarraProgresso valor={m.total} max={maxMes} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Últimas solicitações ── */}
      {ultimasSolicitacoes.length > 0 && (
        <section aria-labelledby="ultimas-titulo">
          <h2
            id="ultimas-titulo"
            className="font-heading text-xl font-bold mb-4"
          >
            Últimas Solicitações
          </h2>
          <p className="text-sm text-fg/70 mb-3">
            Informações anonimizadas, sem identificação do solicitante, em
            cumprimento à LGPD (Lei 13.709/2018).
          </p>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <caption className="sr-only">
                Lista das últimas solicitações de acesso à informação
                (anonimizadas)
              </caption>
              <thead className="bg-muted/50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg"
                  >
                    Protocolo
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg"
                  >
                    Assunto
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg hidden md:table-cell"
                  >
                    Tipo
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg hidden lg:table-cell"
                  >
                    Abertura
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-semibold text-fg hidden lg:table-cell"
                  >
                    Resposta
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ultimasSolicitacoes.map((sol) => (
                  <tr key={sol.protocolo} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs text-fg/80 whitespace-nowrap">
                      {sol.protocolo}
                    </td>
                    <td className="px-4 py-3 text-fg max-w-xs truncate">
                      {sol.assunto}
                    </td>
                    <td className="px-4 py-3 text-fg/80 hidden md:table-cell">
                      {sol.tipo}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
                          sol.status === 'RESPONDIDO' ||
                          sol.status === 'CONCLUIDO'
                            ? 'bg-success/10 text-success'
                            : sol.status === 'ABERTO' ||
                              sol.status === 'EM_ANDAMENTO'
                            ? 'bg-warning/20 text-fg'
                            : 'bg-muted text-fg/70',
                        ].join(' ')}
                      >
                        {labelStatus(sol.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-fg/70 whitespace-nowrap hidden lg:table-cell">
                      {dataCurta(sol.criadoEm)}
                    </td>
                    <td className="px-4 py-3 text-fg/70 whitespace-nowrap hidden lg:table-cell">
                      {dataCurta(sol.respondidoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Rodapé informativo ── */}
      <footer className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-fg/70 space-y-1">
        <p>
          <strong className="text-fg">Base legal:</strong> Lei de Acesso à
          Informação — Lei Federal 12.527/2011. Prazo legal de resposta: 20
          dias úteis, prorrogáveis por mais 10 dias mediante justificativa.
        </p>
        <p>
          Dados gerados em{' '}
          <time dateTime={geradoEm}>{dataHora(geradoEm)}</time>.{' '}
          Estatísticas atualizadas automaticamente a cada 5 minutos.
        </p>
        <p>
          <a
            href="/esic"
            className="font-semibold text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Registrar um pedido de acesso à informação
          </a>
          {' · '}
          <a
            href="/acompanhar"
            className="font-semibold text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Acompanhar pedido existente
          </a>
        </p>
      </footer>
    </div>
  );
}

// ─── Export da página ─────────────────────────────────────────────────────────

export default async function EsicEstatisticasPage() {
  const dados = await getEsicEstatisticas();

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Cabeçalho da página */}
        <header className="space-y-2">
          <nav aria-label="Navegação estrutural" className="text-sm text-fg/60">
            <ol className="flex items-center gap-1">
              <li>
                <a
                  href="/"
                  className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                  Início
                </a>
              </li>
              <li aria-hidden="true" className="select-none">
                /
              </li>
              <li>
                <a
                  href="/esic"
                  className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                  e-SIC
                </a>
              </li>
              <li aria-hidden="true" className="select-none">
                /
              </li>
              <li aria-current="page" className="text-fg font-medium">
                Estatísticas
              </li>
            </ol>
          </nav>

          <h1 className="font-heading text-2xl font-bold text-fg">
            Estatísticas do e-SIC — Acesso à Informação
          </h1>
          <p className="max-w-3xl text-fg/80">
            Indicadores consolidados do Serviço de Informação ao Cidadão,
            exigidos pela Lei de Acesso à Informação (Lei 12.527/2011). Todas
            as informações são anonimizadas e não identificam os solicitantes.
          </p>
          <p className="text-sm text-fg/70">
            Quer registrar um pedido?{' '}
            <a
              href="/esic"
              className="font-semibold text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Acesse o e-SIC
            </a>
            .
          </p>
        </header>

        {/* Conteúdo ou estado vazio */}
        {dados ? <Conteudo dados={dados} /> : <EstadoVazio />}
      </div>
    </PageContainer>
  );
}
