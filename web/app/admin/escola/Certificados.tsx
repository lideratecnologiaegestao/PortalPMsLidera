'use client';

/**
 * Admin — Escola Cidadã / Certificados (Templates + Tipos).
 *
 * Endpoints (admin/gestor):
 *   GET    /api/admin/escola/templates
 *   POST   /api/admin/escola/templates
 *   PUT    /api/admin/escola/templates/:id
 *   DELETE /api/admin/escola/templates/:id
 *   GET    /api/admin/escola/tipos-certificado
 *   POST   /api/admin/escola/tipos-certificado
 *   DELETE /api/admin/escola/tipos-certificado/:id
 *
 * O editor de textos/elementos do template é simplificado: gere o modelo (fundo,
 * dimensões, orientação) e gerencie os blocos de texto posicionados. A composição
 * fina do PDF é resolvida no backend a partir desses metadados.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
} from '../../../lib/admin-api';
import { Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import CertificadoDesigner from './CertificadoDesigner';
import type { TemplateAdmin, TipoCertificadoAdmin } from './tipos';

// ─── Editor de blocos de texto (subconjunto do template) ─────────────────────

interface FormTexto {
  conteudo: string;
  posX: number;
  posY: number;
  tamanho: number;
  cor: string;
  alinhamento: string;
  negrito: boolean;
}

function textoVazio(): FormTexto {
  return {
    conteudo: '',
    posX: 50,
    posY: 50,
    tamanho: 16,
    cor: '#000000',
    alinhamento: 'center',
    negrito: false,
  };
}

const ALINHAMENTOS = [
  { v: 'left', l: 'Esquerda' },
  { v: 'center', l: 'Centro' },
  { v: 'right', l: 'Direita' },
];

function ModalTemplate({
  open,
  editando,
  tipos,
  onClose,
  onSalvo,
}: {
  open: boolean;
  editando: TemplateAdmin | null;
  tipos: TipoCertificadoAdmin[];
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState('');
  const [typeId, setTypeId] = useState('');
  const [fundoUrl, setFundoUrl] = useState('');
  const [largura, setLargura] = useState(842);
  const [altura, setAltura] = useState(595);
  const [orientacao, setOrientacao] = useState('paisagem');
  const [padrao, setPadrao] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [textos, setTextos] = useState<FormTexto[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErro('');
    setNome(editando?.nome ?? '');
    setTypeId(editando?.typeId ?? '');
    setFundoUrl(editando?.fundoUrl ?? '');
    setLargura(editando?.largura ?? 842);
    setAltura(editando?.altura ?? 595);
    setOrientacao(editando?.orientacao ?? 'paisagem');
    setPadrao(editando?.padrao ?? false);
    setAtivo(editando?.ativo ?? true);
    setTextos(
      (editando?.textos ?? []).map((t) => ({
        conteudo: t.conteudo,
        posX: Number(t.posX ?? 0),
        posY: Number(t.posY ?? 0),
        tamanho: Number(t.tamanho ?? 16),
        cor: t.cor ?? '#000000',
        alinhamento: t.alinhamento ?? 'center',
        negrito: !!t.negrito,
      })),
    );
  }, [open, editando]);

  function setT(i: number, patch: Partial<FormTexto>) {
    setTextos((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const body = {
      nome,
      typeId: typeId || undefined,
      fundoUrl: fundoUrl || undefined,
      largura: Number(largura) || undefined,
      altura: Number(altura) || undefined,
      orientacao,
      padrao,
      ativo,
      // textos só vão na criação (POST monta os blocos aninhados). Na atualização
      // o backend atualiza apenas metadados do template — ver escola.service.
      textos: editando
        ? undefined
        : textos
            .filter((t) => t.conteudo.trim())
            .map((t, i) => ({
              conteudo: t.conteudo,
              posX: Number(t.posX) || 0,
              posY: Number(t.posY) || 0,
              tamanho: Number(t.tamanho) || 16,
              cor: t.cor,
              alinhamento: t.alinhamento,
              negrito: t.negrito,
              ordem: i,
            })),
    };
    try {
      if (editando) await adminPut(`/api/admin/escola/templates/${editando.id}`, body);
      else await adminPost('/api/admin/escola/templates', body);
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar o modelo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar modelo' : 'Novo modelo de certificado'}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tpl-nome" className={ui.label}>
              Nome <span aria-hidden="true">*</span>
            </label>
            <input
              id="tpl-nome"
              type="text"
              required
              className={ui.input}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex.: Modelo padrão paisagem"
            />
          </div>
          <div>
            <label htmlFor="tpl-tipo" className={ui.label}>
              Tipo de certificado
            </label>
            <select
              id="tpl-tipo"
              className={ui.input}
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
            >
              <option value="">Sem tipo específico</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Fundo */}
        <div>
          <label htmlFor="tpl-fundo" className={ui.label}>
            Imagem de fundo
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="tpl-fundo"
              type="url"
              className={`flex-1 ${ui.input}`}
              value={fundoUrl}
              onChange={(e) => setFundoUrl(e.target.value)}
              placeholder="https://..."
            />
            <button
              type="button"
              className={ui.btnGhost}
              onClick={() => setPicker(true)}
              aria-label="Escolher imagem de fundo da biblioteca de mídia"
            >
              Escolher imagem
            </button>
          </div>
          {fundoUrl && (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fundoUrl}
                alt="Pré-visualização do fundo do certificado"
                className="max-h-40 rounded border border-border object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="tpl-orientacao" className={ui.label}>
              Orientação
            </label>
            <select
              id="tpl-orientacao"
              className={ui.input}
              value={orientacao}
              onChange={(e) => setOrientacao(e.target.value)}
            >
              <option value="paisagem">Paisagem</option>
              <option value="retrato">Retrato</option>
            </select>
          </div>
          <div>
            <label htmlFor="tpl-largura" className={ui.label}>
              Largura (pt)
            </label>
            <input
              id="tpl-largura"
              type="number"
              min={1}
              className={ui.input}
              value={largura}
              onChange={(e) => setLargura(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="tpl-altura" className={ui.label}>
              Altura (pt)
            </label>
            <input
              id="tpl-altura"
              type="number"
              min={1}
              className={ui.input}
              value={altura}
              onChange={(e) => setAltura(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={padrao}
              onChange={(e) => setPadrao(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Modelo padrão
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Ativo
          </label>
        </div>

        {/* Editor de blocos de texto — só na criação (POST aninhado). */}
        {editando ? (
          <div className="rounded border border-dashed border-border bg-muted/20 p-3 text-xs text-fg/60">
            Os blocos de texto já criados são preservados. Para reescrever a composição do modelo,
            crie um novo modelo — a API atualiza apenas os metadados (nome, fundo, dimensões) na
            edição. Blocos atuais: <strong>{editando.textos?.length ?? 0}</strong>.
          </div>
        ) : (
          <fieldset className="rounded border border-border p-3">
            <legend className="px-1 text-sm font-semibold">Blocos de texto</legend>
            <p className="mb-3 text-xs text-fg/60">
              Posições em pontos a partir do canto superior esquerdo. Você pode usar
              variáveis como <code>{'{{nomeAluno}}'}</code>, <code>{'{{tituloCurso}}'}</code>,{' '}
              <code>{'{{cargaHoraria}}'}</code>, <code>{'{{codigo}}'}</code> e{' '}
              <code>{'{{emitidoEm}}'}</code>.
            </p>

            {textos.length === 0 ? (
              <p className="mb-3 text-sm text-fg/60">Nenhum bloco adicionado.</p>
            ) : (
              <ul className="mb-3 space-y-3">
                {textos.map((t, i) => (
                  <li key={i} className="rounded border border-border/70 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-fg/60">Bloco {i + 1}</span>
                      <button
                        type="button"
                        className="text-xs text-danger hover:underline"
                        onClick={() => setTextos((ts) => ts.filter((_, idx) => idx !== i))}
                      >
                        remover
                      </button>
                    </div>
                    <input
                      type="text"
                      className={`${ui.input} mb-2`}
                      value={t.conteudo}
                      onChange={(e) => setT(i, { conteudo: e.target.value })}
                      placeholder="ex.: Certificamos que {{nomeAluno}} concluiu o curso {{tituloCurso}}"
                      aria-label={`Texto do bloco ${i + 1}`}
                    />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>
                        <label className={ui.label}>Pos. X</label>
                        <input
                          type="number"
                          className={ui.input}
                          value={t.posX}
                          onChange={(e) => setT(i, { posX: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className={ui.label}>Pos. Y</label>
                        <input
                          type="number"
                          className={ui.input}
                          value={t.posY}
                          onChange={(e) => setT(i, { posY: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className={ui.label}>Tamanho</label>
                        <input
                          type="number"
                          min={1}
                          className={ui.input}
                          value={t.tamanho}
                          onChange={(e) => setT(i, { tamanho: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className={ui.label}>Cor</label>
                        <input
                          type="color"
                          className="h-9 w-full rounded border border-border"
                          value={t.cor}
                          onChange={(e) => setT(i, { cor: e.target.value })}
                          aria-label={`Cor do bloco ${i + 1}`}
                        />
                      </div>
                      <div>
                        <label className={ui.label}>Alinhamento</label>
                        <select
                          className={ui.input}
                          value={t.alinhamento}
                          onChange={(e) => setT(i, { alinhamento: e.target.value })}
                        >
                          {ALINHAMENTOS.map((a) => (
                            <option key={a.v} value={a.v}>
                              {a.l}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
                          <input
                            type="checkbox"
                            checked={t.negrito}
                            onChange={(e) => setT(i, { negrito: e.target.checked })}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          Negrito
                        </label>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              className={ui.btnGhost}
              onClick={() => setTextos((ts) => [...ts, textoVazio()])}
            >
              + Adicionar bloco de texto
            </button>
          </fieldset>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.btnGhost} onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className={ui.btn} disabled={salvando} aria-busy={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>

      <MediaPicker
        open={picker}
        onClose={() => setPicker(false)}
        tipo="imagem"
        onSelect={(asset) => {
          if (asset.urlPublica) setFundoUrl(asset.urlPublica);
          setPicker(false);
        }}
      />
    </Modal>
  );
}

// ─── Painel: Tipos de certificado ────────────────────────────────────────────

function PainelTipos({
  tipos,
  onMudou,
}: {
  tipos: TipoCertificadoAdmin[];
  onMudou: () => void;
}) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setErro('Informe o nome do tipo.');
      return;
    }
    setErro('');
    try {
      await adminPost('/api/admin/escola/tipos-certificado', {
        nome,
        descricao: descricao || undefined,
      });
      setNome('');
      setDescricao('');
      onMudou();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao criar tipo.');
    }
  }

  async function excluir(id: string) {
    setErro('');
    try {
      await adminDelete(`/api/admin/escola/tipos-certificado/${id}`);
      setConfirmandoId(null);
      onMudou();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao excluir tipo.');
    }
  }

  return (
    <div className="rounded border border-border p-4">
      <h3 className="mb-2 font-heading text-base font-bold">Tipos de certificado</h3>
      <p className="mb-3 text-sm text-fg/60">
        Categorias para organizar os modelos (ex.: Conclusão, Participação, Aproveitamento).
      </p>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {tipos.length > 0 && (
        <ul className="mb-3 space-y-1">
          {tipos.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm"
            >
              <span>
                <span className="font-semibold">{t.nome}</span>
                {t.descricao ? <span className="text-fg/55"> — {t.descricao}</span> : null}
              </span>
              {confirmandoId === t.id ? (
                <span className="flex gap-2">
                  <button
                    type="button"
                    className="text-danger hover:underline"
                    onClick={() => excluir(t.id)}
                  >
                    confirmar
                  </button>
                  <button
                    type="button"
                    className="text-fg/60 hover:underline"
                    onClick={() => setConfirmandoId(null)}
                  >
                    cancelar
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="text-danger hover:underline"
                  onClick={() => setConfirmandoId(t.id)}
                >
                  remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={criar} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="tipo-nome" className={ui.label}>
            Nome
          </label>
          <input
            id="tipo-nome"
            type="text"
            className={ui.input}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex.: Conclusão"
          />
        </div>
        <div>
          <label htmlFor="tipo-desc" className={ui.label}>
            Descrição
          </label>
          <input
            id="tipo-desc"
            type="text"
            className={ui.input}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
        <button type="submit" className={ui.btn}>
          + Adicionar
        </button>
      </form>
    </div>
  );
}

// ─── Aba Certificados ────────────────────────────────────────────────────────

export default function Certificados() {
  const [templates, setTemplates] = useState<TemplateAdmin[]>([]);
  const [tipos, setTipos] = useState<TipoCertificadoAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<TemplateAdmin | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  // Designer visual (drag-drop em canvas). `designer` controla a tela cheia;
  // `designerTemplate` é o template em edição (null = novo).
  const [designer, setDesigner] = useState(false);
  const [designerTemplate, setDesignerTemplate] = useState<TemplateAdmin | null>(null);

  function abrirDesigner(template: TemplateAdmin | null) {
    setDesignerTemplate(template);
    setDesigner(true);
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const [tpls, tps] = await Promise.all([
        adminGet<TemplateAdmin[]>('/api/admin/escola/templates'),
        adminGet<TipoCertificadoAdmin[]>('/api/admin/escola/tipos-certificado'),
      ]);
      setTemplates(tpls);
      setTipos(tps);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar certificados.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function excluir(id: string) {
    setErro('');
    try {
      await adminDelete(`/api/admin/escola/templates/${id}`);
      setConfirmandoId(null);
      setMsgOk('Modelo excluído.');
      await carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao excluir modelo.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg/70">
          Modelos de certificado (fundo, dimensões e blocos de texto) e seus tipos. Os certificados
          são emitidos automaticamente aos alunos aprovados em cursos certificáveis.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={ui.btnGhost}
            onClick={() => abrirDesigner(null)}
          >
            Abrir designer visual
          </button>
          <button
            type="button"
            className={ui.btn}
            onClick={() => {
              setEditando(null);
              setModalAberto(true);
            }}
          >
            + Novo modelo
          </button>
        </div>
      </div>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {carregando ? (
        <p aria-live="polite" aria-busy="true" className="py-12 text-center text-sm text-fg/60">
          Carregando modelos…
        </p>
      ) : (
        <>
          {templates.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg/60">
              Nenhum modelo cadastrado. Clique em &ldquo;Novo modelo&rdquo; para criar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[640px] border-collapse text-sm"
                aria-label="Lista de modelos de certificado"
              >
                <thead>
                  <tr>
                    <th scope="col" className={ui.th}>
                      Nome
                    </th>
                    <th scope="col" className={ui.th}>
                      Orientação
                    </th>
                    <th scope="col" className={ui.th}>
                      Dimensões
                    </th>
                    <th scope="col" className={ui.th}>
                      Blocos
                    </th>
                    <th scope="col" className={ui.th}>
                      Situação
                    </th>
                    <th scope="col" className={ui.th}>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td className={ui.td}>
                        <span className="font-medium">{t.nome}</span>
                        {t.padrao && (
                          <span className={`${ui.badge} ml-2 bg-primary/10 text-primary`}>padrão</span>
                        )}
                      </td>
                      <td className={ui.td}>{t.orientacao === 'retrato' ? 'Retrato' : 'Paisagem'}</td>
                      <td className={ui.td}>
                        {t.largura}×{t.altura}
                      </td>
                      <td className={ui.td}>{t.textos?.length ?? 0}</td>
                      <td className={ui.td}>
                        <span
                          className={`${ui.badge} ${
                            t.ativo ? 'bg-success/10 text-success' : 'bg-muted text-fg/60'
                          }`}
                        >
                          {t.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className={ui.td}>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={ui.btnGhost}
                            onClick={() => abrirDesigner(t)}
                            aria-label={`Abrir designer visual do modelo "${t.nome}"`}
                          >
                            Designer
                          </button>
                          <button
                            type="button"
                            className={ui.btnGhost}
                            onClick={() => {
                              setEditando(t);
                              setModalAberto(true);
                            }}
                            aria-label={`Editar modelo "${t.nome}"`}
                          >
                            Editar
                          </button>
                          {confirmandoId === t.id ? (
                            <>
                              <button
                                type="button"
                                className={ui.btnDanger}
                                onClick={() => excluir(t.id)}
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                className={ui.btnGhost}
                                onClick={() => setConfirmandoId(null)}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={ui.btnDanger}
                              onClick={() => setConfirmandoId(t.id)}
                              aria-label={`Excluir modelo "${t.nome}"`}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <PainelTipos tipos={tipos} onMudou={carregar} />
        </>
      )}

      <ModalTemplate
        open={modalAberto}
        editando={editando}
        tipos={tipos}
        onClose={() => setModalAberto(false)}
        onSalvo={() => {
          setMsgOk(editando ? 'Modelo atualizado com sucesso.' : 'Modelo criado com sucesso.');
          carregar();
        }}
      />

      {designer && (
        <CertificadoDesigner
          editando={designerTemplate}
          tipos={tipos}
          onClose={() => setDesigner(false)}
          onSalvo={() => {
            setMsgOk(
              designerTemplate ? 'Modelo atualizado com sucesso.' : 'Modelo criado com sucesso.',
            );
            carregar();
          }}
        />
      )}
    </div>
  );
}
