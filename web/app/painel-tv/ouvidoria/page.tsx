'use client';

import {
  usePainel, useRodizio, Moldura, Kpi, Bloco, Barras, Satisfacao, Vazio, Rodizio, AlertaVencidas,
  MANIF_STATUS, CANAL, TIPO, CHAMADO_CATEGORIA,
} from '../_components/kit';

interface OuvidoriaDados {
  manifestacoes: {
    total: number; abertas: number; vencidas: number; vencendo48h: number;
    noPrazoPct: number | null; tempoMedioDias: number | null;
    porStatus: { k: string; n: number }[]; porCanal: { k: string; n: number }[]; porTipo: { k: string; n: number }[];
    filaPrazo: { protocolo: string; tipo: string; canal: string; status: string; diasRestantes: number }[];
  };
  chamados: {
    total: number; abertos: number; resolvidos: number; tempoMedioDias: number | null;
    porStatus: { k: string; n: number }[]; porCategoria: { k: string; n: number }[];
  };
  satisfacao: { total: number; media: number | null; distribuicao: { nota: number; n: number }[] };
}

const TELAS = ['Visão geral', 'Operação e denúncias'];

export default function PainelOuvidoria() {
  const { dados, erro, atualizado } = usePainel<OuvidoriaDados>('ouvidoria');
  const tela = useRodizio(TELAS.length);

  const vencidas = dados?.manifestacoes.vencidas ?? 0;

  return (
    <Moldura
      titulo="Painel da Ouvidoria"
      subtitulo="Atendimento ao cidadão em tempo real"
      erro={erro && !dados ? erro : ''}
      atualizado={atualizado}
      alerta={<AlertaVencidas n={vencidas} />}
      indicador={dados ? <Rodizio titulos={TELAS} indice={tela} /> : undefined}
    >
      {dados && (
        <div className="grid h-full grid-rows-[auto_1fr] gap-5">
          {/* KPIs sempre visíveis */}
          <div className="grid grid-cols-5 gap-5">
            <Kpi rotulo="Em andamento" valor={dados.manifestacoes.abertas} tom="marca" legenda="manifestações abertas" />
            <Kpi rotulo="Vencendo (48h)" valor={dados.manifestacoes.vencendo48h} tom={dados.manifestacoes.vencendo48h > 0 ? 'alerta' : 'neutro'} legenda="prazo legal próximo" />
            <Kpi rotulo="Vencidas" valor={dados.manifestacoes.vencidas} tom={dados.manifestacoes.vencidas > 0 ? 'perigo' : 'ok'} legenda="fora do prazo legal" />
            <Kpi rotulo="No prazo" valor={dados.manifestacoes.noPrazoPct ?? '—'} sufixo={dados.manifestacoes.noPrazoPct != null ? '%' : ''} tom="ok" legenda="respostas dentro do prazo" />
            <Kpi rotulo="Tempo médio" valor={dados.manifestacoes.tempoMedioDias ?? '—'} sufixo={dados.manifestacoes.tempoMedioDias != null ? 'dias' : ''} legenda="para responder" />
          </div>

          {/* Área que faz rodízio */}
          {tela === 0 ? (
            <div className="grid grid-cols-3 gap-5">
              <Bloco titulo="Manifestações por situação">
                <Barras dados={dados.manifestacoes.porStatus} rotulos={MANIF_STATUS} />
              </Bloco>
              <Bloco titulo="Por tipo e canal">
                <Barras dados={dados.manifestacoes.porTipo} rotulos={TIPO} />
                <div className="mt-4 border-t border-white/10 pt-4">
                  <Barras dados={dados.manifestacoes.porCanal} rotulos={CANAL} cor="#38bdf8" />
                </div>
              </Bloco>
              <Bloco titulo="Satisfação do cidadão">
                <Satisfacao media={dados.satisfacao.media} total={dados.satisfacao.total} dist={dados.satisfacao.distribuicao} />
              </Bloco>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-5">
              <Bloco titulo="Fila de prazo — próximas a vencer">
                {dados.manifestacoes.filaPrazo.length === 0 ? (
                  <Vazio>Nenhuma manifestação em aberto</Vazio>
                ) : (
                  <ul className="space-y-2">
                    {dados.manifestacoes.filaPrazo.map((f) => {
                      const tom = f.diasRestantes < 0 ? 'text-red-400' : f.diasRestantes <= 2 ? 'text-amber-400' : 'text-emerald-400';
                      return (
                        <li key={f.protocolo} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2.5">
                          <div>
                            <span className="font-mono text-lg">{f.protocolo}</span>
                            <span className="ml-3 text-lg text-white/60">{TIPO[f.tipo] ?? f.tipo} · {CANAL[f.canal] ?? f.canal}</span>
                          </div>
                          <div className={`text-2xl font-bold tabular-nums ${tom}`}>
                            {f.diasRestantes < 0 ? `${Math.abs(f.diasRestantes)}d atrasada` : `${f.diasRestantes}d`}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Bloco>
              <Bloco titulo="Denúncias do App (demandas urbanas)">
                <div className="mb-4 grid grid-cols-3 gap-4">
                  <Kpi rotulo="Abertas" valor={dados.chamados.abertos} tom={dados.chamados.abertos > 0 ? 'alerta' : 'ok'} />
                  <Kpi rotulo="Resolvidas" valor={dados.chamados.resolvidos} tom="ok" />
                  <Kpi rotulo="Tempo médio" valor={dados.chamados.tempoMedioDias ?? '—'} sufixo={dados.chamados.tempoMedioDias != null ? 'd' : ''} />
                </div>
                <Barras dados={dados.chamados.porCategoria} rotulos={CHAMADO_CATEGORIA} cor="#f59e0b" />
              </Bloco>
            </div>
          )}
        </div>
      )}
    </Moldura>
  );
}
