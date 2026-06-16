'use client';

/**
 * Hook compartilhado para listagem e upload de midia.
 * Usado tanto pela galeria /admin/midia quanto pelo MediaPicker.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  listarMidia,
  listarCategorias,
  uploadMidia,
  atualizarMidia,
  excluirMidia,
  type MediaAsset,
  type MediaCategoria,
  type MediaTipo,
  type ListaMidiaFiltros,
} from '../../../lib/media';

export const PAGE_SIZE = 40;

export interface UseMediaLibraryOptions {
  tipoInicial?: MediaTipo | '';
}

export function useMediaLibrary(opts: UseMediaLibraryOptions = {}) {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [filtroTipo, setFiltroTipo] = useState<MediaTipo | ''>(opts.tipoInicial ?? '');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroQ, setFiltroQ] = useState('');

  const [categorias, setCategorias] = useState<MediaCategoria[]>([]);
  const [carregandoCats, setCarregandoCats] = useState(false);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // Carrega categorias ao montar ou ao mudar tipo
  useEffect(() => {
    setCarregandoCats(true);
    listarCategorias(filtroTipo || undefined)
      .then(setCategorias)
      .catch(() => setCategorias([]))
      .finally(() => setCarregandoCats(false));
  }, [filtroTipo]);

  const carregar = useCallback(
    async (filtros: ListaMidiaFiltros) => {
      setCarregando(true);
      setErro('');
      try {
        const res = await listarMidia(filtros);
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao carregar midia.');
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  // Carrega inicial e ao mudar pagina
  useEffect(() => {
    carregar({ tipo: filtroTipo, categoria: filtroCategoria, q: filtroQ, page });
  }, [carregar, page]); // eslint-disable-line react-hooks/exhaustive-deps

  function buscar() {
    setPage(1);
    carregar({ tipo: filtroTipo, categoria: filtroCategoria, q: filtroQ, page: 1 });
  }

  function recarregar() {
    carregar({ tipo: filtroTipo, categoria: filtroCategoria, q: filtroQ, page });
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    items,
    total,
    page,
    totalPaginas,
    setPage,
    filtroTipo,
    setFiltroTipo,
    filtroCategoria,
    setFiltroCategoria,
    filtroQ,
    setFiltroQ,
    categorias,
    carregandoCats,
    carregando,
    erro,
    buscar,
    recarregar,
    // acoes diretas (expoe para a pagina usar)
    atualizarMidia,
    excluirMidia,
    uploadMidia,
  };
}
