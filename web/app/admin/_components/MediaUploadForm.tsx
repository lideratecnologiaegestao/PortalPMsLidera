'use client';

/**
 * Formulario de upload de midia.
 * Reutilizado pela galeria /admin/midia e pelo MediaPicker.
 */

import { useId, useRef, useState } from 'react';
import { uploadMidia, type MediaAsset, type MediaCategoria, type MediaTipoMidia, type MediaVisibilidade } from '../../../lib/media';
import { Aviso, ui } from './ui';

interface Props {
  categorias: MediaCategoria[];
  /** Tipos de mídia (rótulo opcional). Vazio/omitido → seletor não aparece. */
  tipos?: MediaTipoMidia[];
  tipoFixo?: string;
  onSucesso: (asset: MediaAsset) => void;
}

const IMAGEM_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];

export default function MediaUploadForm({ categorias, tipos, tipoFixo, onSucesso }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // id único por instância — evita colisão se houver mais de um formulário montado
  const fileId = useId();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [categoriaId, setCategoriaId] = useState('');
  const [tipoMidiaId, setTipoMidiaId] = useState('');
  const [visibilidade, setVisibilidade] = useState<MediaVisibilidade>('publico');
  const [altText, setAltText] = useState('');

  function selecionar(f: File | null) {
    setArquivo(f);
    setErro('');
    setOk('');
  }

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const ehImagem = arquivo ? IMAGEM_MIMES.includes(arquivo.type) : false;
  const altObrigatorio = ehImagem;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');

    if (!arquivo) {
      setErro('Selecione um arquivo para enviar.');
      return;
    }
    if (!categoriaId) {
      setErro('Selecione uma categoria.');
      return;
    }
    if (altObrigatorio && !altText.trim()) {
      setErro('O texto alternativo (alt) e obrigatorio para imagens (WCAG).');
      return;
    }

    setEnviando(true);
    try {
      const asset = await uploadMidia(arquivo, {
        categoriaId,
        visibilidade,
        altText: altText.trim() || undefined,
        tipoMidiaId: tipoMidiaId || undefined,
      });
      setOk(`"${asset.nomeOriginal}" enviado com sucesso.`);
      setArquivo(null);
      setAltText('');
      if (inputRef.current) inputRef.current.value = '';
      onSucesso(asset);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar arquivo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {/* Arquivo — botão explícito + arrastar-e-soltar (não depende só do diálogo nativo) */}
      <div>
        <label htmlFor={fileId} className={ui.label}>
          Arquivo <span aria-hidden="true" className="text-danger">*</span>
        </label>

        {/* input nativo escondido — acionado pelo botão e pela área de drop */}
        <input
          ref={inputRef}
          id={fileId}
          type="file"
          className="sr-only"
          accept={tipoFixo === 'imagem' ? 'image/*' : undefined}
          onChange={(e) => selecionar(e.target.files?.[0] ?? null)}
          aria-describedby={`${fileId}-hint`}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            selecionar(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`mt-1 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-5 text-center transition-colors ${
            arrastando ? 'border-primary bg-muted' : 'border-border'
          }`}
        >
          <button type="button" className={ui.btn} onClick={() => inputRef.current?.click()}>
            Escolher arquivo
          </button>
          <p className="text-sm text-fg" aria-live="polite">
            {arquivo ? (
              <span className="font-semibold">{arquivo.name}</span>
            ) : (
              <span className="text-fg/60">ou arraste e solte o arquivo aqui</span>
            )}
          </p>
        </div>

        <p id={`${fileId}-hint`} className="mt-1 text-xs text-fg/60">
          Tipos aceitos: imagens, PDF, Word, Excel, ZIP, audio, video. Maximo definido pelo servidor.
        </p>
      </div>

      {/* Categoria */}
      <div>
        <label htmlFor="upload-categoria" className={ui.label}>
          Categoria <span aria-hidden="true" className="text-danger">*</span>
        </label>
        <select
          id="upload-categoria"
          required
          className={`mt-1 ${ui.input}`}
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
        >
          <option value="">Selecione uma categoria…</option>
          {/* Categoria desativada não deve aparecer para novo upload. */}
          {categorias.filter((c) => c.ativo !== false).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      {/* Tipo de mídia — rótulo opcional (taxonomia editável) */}
      {tipos && tipos.length > 0 && (
        <div>
          <label htmlFor="upload-tipo-midia" className={ui.label}>
            Tipo de mídia <span className="text-fg/50">(opcional)</span>
          </label>
          <select
            id="upload-tipo-midia"
            className={`mt-1 ${ui.input}`}
            value={tipoMidiaId}
            onChange={(e) => setTipoMidiaId(e.target.value)}
          >
            <option value="">Sem tipo</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Visibilidade */}
      <fieldset>
        <legend className={`${ui.label} mb-1`}>Visibilidade</legend>
        <div className="flex gap-4">
          {(['publico', 'restrito'] as MediaVisibilidade[]).map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="upload-vis"
                value={v}
                checked={visibilidade === v}
                onChange={() => setVisibilidade(v)}
                className="accent-primary"
              />
              {v === 'publico' ? 'Publico (URL acessivel)' : 'Restrito (somente interno)'}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Alt text — obrigatorio para imagens */}
      <div>
        <label htmlFor="upload-alt" className={ui.label}>
          Texto alternativo (alt)
          {altObrigatorio && (
            <span aria-hidden="true" className="text-danger ml-1">*</span>
          )}
        </label>
        <p id="upload-alt-desc" className="text-xs text-fg/60">
          {altObrigatorio
            ? 'Obrigatorio para imagens — descreva o conteudo visual para leitores de tela (WCAG).'
            : 'Recomendado para imagens.'}
        </p>
        <input
          id="upload-alt"
          type="text"
          className={`mt-1 ${ui.input}`}
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          aria-describedby="upload-alt-desc"
          aria-required={altObrigatorio}
          placeholder="Ex.: Brasao do municipio sobre fundo branco"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className={ui.btn}
          disabled={enviando}
          aria-busy={enviando}
        >
          {enviando ? 'Enviando…' : 'Enviar arquivo'}
        </button>
      </div>
    </form>
  );
}
