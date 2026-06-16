'use client';

import {
  usePainel, useRodizio, Moldura, Kpi, Bloco, Barras, Tendencia, Satisfacao, Vazio, Rodizio, AlertaBarra,
  CHAMADO_CATEGORIA,
} from '../_components/kit';

interface PrefeitoDados {
  resumo: {
    demandasMes: number; demandasTotal: number; resolvidasPct: number | null;
    satisfacao: number | null; satisfacaoTotal: number; tempoMedioDias: number | null; slaCumprimentoPct: number | null;
  };
  demandas: { manifestacoesAbertas: number; chamadosAbertos: number; chamadosParados: number; diasParado: number; vencidas: number };
  porSecretaria: { k: string; n: number }[];
  denunciasPorCategoria: { k: string; n: number }[];
  tendencia: { mes: string; entradas: number; resolvidas: number }[];
  satisfacaoDist: { nota: number; n: number }[];
  comentarios: { nota: number; comentario: string; criadoEm: string }[];
}

const TELAS = ['Desempenho', 'Onde estão as demandas'];

export default function PainelPrefeito() {
  const { dados, erro, atualizado } = usePainel<PrefeitoDados>('prefeito');
  const tela = useRodizio(TELAS.length);

  const vencidas = dados?.demandas.vencidas ?? 0;
  const parados = dados?.demandas.chamadosParados ?? 0;
  const diasParado = dados?.demandas.diasParado ?? 15;
  const alertas = [
    vencidas > 0
      ? { texto: `${vencidas} ${vencidas === 1 ? 'manifestação vencida' : 'manifestações vencidas'} — fora do prazo legal`, tom: 'perigo' as const }
      : null,
    parados > 0
      ? { texto: `${parados} ${parados === 1 ? 'denúncia urbana parada' : 'denúncias urbanas paradas'} há mais de ${diasParado} dias`, tom: 'aviso' as const }
      : null,
  ].filter((a): a is { texto: string; tom: 'perigo' | 'aviso' } => a !== null);

  return (
    <Moldura
      titulo="Painel de Gestão"
      subtitulo="Visão executiva do atendimento ao cidadão"
      erro={erro && !dados ? erro : ''}
      atualizado={atualizado}
      alerta={<AlertaBarra alertas={alertas} />}
      indicador={dados ? <Rodizio titulos={TELAS} indice={tela} /> : undefined}
    >
      {dados && (
        <div className="grid h-full grid-rows-[auto_1fr] gap-5">
          {/* KPIs executivos sempre visíveis */}
          <div className="grid grid-cols-5 gap-5">
            <Kpi rotulo="Demandas no mês" valor={dados.resumo.demandasMes} tom="marca" legenda="manifestações + denúncias" />
            <Kpi rotulo="Total acumulado" valor={dados.resumo.demandasTotal} legenda="histórico do município" />
            <Kpi rotulo="Resolvidas" valor={dados.resumo.resolvidasPct ?? '—'} sufixo={dados.resumo.resolvidasPct != null ? '%' : ''} tom="ok" legenda="do total de demandas" />
            <Kpi rotulo="Satisfação" valor={dados.resumo.satisfacao != null ? dados.resumo.satisfacao.toFixed(1) : '—'} sufixo={dados.resumo.satisfacao != null ? '★' : ''} tom="alerta" legenda={`${dados.resumo.satisfacaoTotal} avaliações`} />
            <Kpi rotulo="Prazos legais" valor={dados.resumo.slaCumprimentoPct ?? '—'} sufixo={dados.resumo.slaCumprimentoPct != null ? '%' : ''} tom={dados.demandas.vencidas > 0 ? 'perigo' : 'ok'} legenda="cumprimento do SLA" />
          </div>

          {/* Área que faz rodízio */}
          {tela === 0 ? (
            <div className="grid grid-cols-3 gap-5">
              <Bloco titulo="Tendência (últimos 6 meses)" className="col-span-2">
                <Tendencia dados={dados.tendencia} />
              </Bloco>
              <Bloco titulo="Satisfação do cidadão">
                <Satisfacao media={dados.resumo.satisfacao} total={dados.resumo.satisfacaoTotal} dist={dados.satisfacaoDist} />
              </Bloco>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-5">
              <Bloco titulo="Demandas por secretaria" className="col-span-2">
                <Barras dados={dados.porSecretaria} />
              </Bloco>
              <Bloco titulo="O que mais aflige a cidade">
                {dados.denunciasPorCategoria.length === 0 ? (
                  <Vazio>Sem denúncias registradas</Vazio>
                ) : (
                  <Barras dados={dados.denunciasPorCategoria} rotulos={CHAMADO_CATEGORIA} cor="#f59e0b" />
                )}
              </Bloco>
            </div>
          )}
        </div>
      )}
    </Moldura>
  );
}
