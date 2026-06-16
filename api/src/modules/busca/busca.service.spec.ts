/**
 * Unit tests para BuscaService — busca híbrida (FTS lexical + semântica + rerank).
 *
 * Cenários cobertos:
 *   1. Busca híbrida retorna resultados quando embeddings configurado.
 *   2. Fallback para FTS puro quando embeddings.configurado = false.
 *   3. Fallback para FTS puro quando embed() retorna null.
 *   4. rerank retornando null não quebra a busca (usa ordem RRF).
 *   5. rerank retornando resultados reordena candidatos corretamente.
 *   6. Filtro por tipo aplicado antes da paginação.
 *   7. Paginação page/pageSize correta.
 *   8. Isolamento de tenant: query roda dentro de prisma.tx() (GUC de tenant).
 *   9. Candidatos semânticos SEM entrada no search_index são excluídos (LGPD/segurança).
 *  10. Fonte 'conhecimento' é excluída da leg semântica.
 */

import { BuscaService } from './busca.service';
import { TipoBusca } from './busca.dto';

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------

const CANDIDATO_NOTICIA = {
  tipo: 'noticia' as TipoBusca,
  ref_id: 'uuid-noticia-1',
  titulo: 'Prefeitura lança programa de saúde',
  subtitulo: 'Saúde',
  url: '/noticias/prefeitura-lanca-programa',
  snippet_src: 'programa de saúde municipal',
  publicado_em: new Date('2026-01-15'),
  rank_lex: 0.75,
};

const CANDIDATO_SERVICO = {
  tipo: 'servico' as TipoBusca,
  ref_id: 'uuid-servico-1',
  titulo: 'Alvará de funcionamento',
  subtitulo: null,
  url: '/servicos/alvara',
  snippet_src: 'solicitação de alvará',
  publicado_em: new Date('2025-06-01'),
  rank_lex: 0.5,
};

const HEADLINE_NOTICIA = {
  tipo: 'noticia' as TipoBusca,
  ref_id: 'uuid-noticia-1',
  snippet: 'programa <mark>saúde</mark> municipal',
};

const HEADLINE_SERVICO = {
  tipo: 'servico' as TipoBusca,
  ref_id: 'uuid-servico-1',
  snippet: '<mark>alvará</mark> de funcionamento',
};

// -------------------------------------------------------------------------
// Helpers de mock
// -------------------------------------------------------------------------

/** Cria um mock de PrismaService que executa `fn(mockTx)` ao chamar prisma.tx(). */
function buildPrisma(txImpl?: (fn: (t: any) => Promise<any>) => Promise<any>) {
  // Sequência de chamadas ao $queryRaw dentro da transação:
  //   1ª call → lexRows (search_index)
  //   2ª call → headlines
  let queryRawCallCount = 0;
  const mockTx = {
    $queryRaw: jest.fn(async () => {
      queryRawCallCount++;
      // Por padrão: 1ª = lex candidatos, 2ª = headlines, restantes = []
      if (queryRawCallCount === 1) return [CANDIDATO_NOTICIA, CANDIDATO_SERVICO];
      if (queryRawCallCount === 2) return [HEADLINE_NOTICIA, HEADLINE_SERVICO];
      return [];
    }),
    $queryRawUnsafe: jest.fn(async () => [] as any[]), // leg semântica vazia por default
  };

  return {
    tx: txImpl ?? jest.fn(async (fn: any) => {
      queryRawCallCount = 0; // reseta por chamada a tx()
      return fn(mockTx);
    }),
    _mockTx: mockTx,
  };
}

function buildEmbeddings(configurado: boolean, embedding?: number[]) {
  return {
    configurado,
    embed: jest.fn().mockResolvedValue(embedding ? [embedding] : null),
  };
}

function buildRerank(result: { index: number; score: number }[] | null = null) {
  return {
    rerank: jest.fn().mockResolvedValue(result),
  };
}

// -------------------------------------------------------------------------
// Testes
// -------------------------------------------------------------------------

describe('BuscaService', () => {

  // -----------------------------------------------------------------------
  // 1. Busca híbrida retorna resultados com embeddings configurado
  // -----------------------------------------------------------------------
  describe('busca híbrida (embeddings configurado)', () => {
    it('retorna resultados quando leg semântica está disponível', async () => {
      const prisma = buildPrisma();
      const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
      const rerank = buildRerank(null); // rerank retorna null → usa RRF

      const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
      const result = await service.buscar({ q: 'saúde', page: 1, pageSize: 10 });

      expect(result.resultados.length).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('chama embed() exatamente uma vez por busca', async () => {
      const prisma = buildPrisma();
      const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
      const rerank = buildRerank(null);

      const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
      await service.buscar({ q: 'saúde', page: 1, pageSize: 10 });

      expect(embeddings.embed).toHaveBeenCalledTimes(1);
      expect(embeddings.embed).toHaveBeenCalledWith(['saúde']);
    });

    it('mapeia campos snake_case → camelCase no resultado', async () => {
      const prisma = buildPrisma();
      const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
      const rerank = buildRerank(null);

      const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
      const result = await service.buscar({ q: 'saúde', page: 1, pageSize: 10 });

      const item = result.resultados.find(r => r.refId === 'uuid-noticia-1');
      expect(item).toBeDefined();
      expect(item!.tipo).toBe('noticia');
      expect(item!.titulo).toBe('Prefeitura lança programa de saúde');
      expect(item!.publicadoEm).toBeInstanceOf(Date);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Fallback FTS puro quando embeddings.configurado = false
  // -----------------------------------------------------------------------
  describe('fallback FTS puro', () => {
    it('vai direto ao FTS quando embeddings.configurado = false', async () => {
      let txCallCount = 0;
      const mockTxFts = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([CANDIDATO_NOTICIA]) // rows
          .mockResolvedValueOnce([{ total: BigInt(1) }]), // total
      };
      const prisma = {
        tx: jest.fn(async (fn: any) => {
          txCallCount++;
          return fn(mockTxFts);
        }),
      };
      const embeddings = buildEmbeddings(false);
      const rerank = buildRerank(null);

      const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
      const result = await service.buscar({ q: 'saúde', page: 1, pageSize: 10 });

      // embed nunca é chamado
      expect(embeddings.embed).not.toHaveBeenCalled();
      // resultado vem do FTS
      expect(result.total).toBe(1);
      expect(result.resultados[0].refId).toBe('uuid-noticia-1');
    });

    it('retorna paginação correta no caminho FTS', async () => {
      const mockTxFts = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([CANDIDATO_NOTICIA])
          .mockResolvedValueOnce([{ total: BigInt(42) }]),
      };
      const prisma = { tx: jest.fn(async (fn: any) => fn(mockTxFts)) };
      const service = new BuscaService(
        prisma as any,
        buildEmbeddings(false) as any,
        buildRerank(null) as any,
      );

      const result = await service.buscar({ q: 'saúde', page: 3, pageSize: 5 });
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(5);
      expect(result.total).toBe(42);
    });

    it('retorna lista vazia quando FTS não encontra resultados', async () => {
      const mockTxFts = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
      };
      const prisma = { tx: jest.fn(async (fn: any) => fn(mockTxFts)) };
      const service = new BuscaService(
        prisma as any,
        buildEmbeddings(false) as any,
        buildRerank(null) as any,
      );

      const result = await service.buscar({ q: 'inexistente', page: 1, pageSize: 10 });
      expect(result.resultados).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Fallback para FTS quando embed() retorna null
  // -----------------------------------------------------------------------
  it('degrada para FTS quando embed() retorna null', async () => {
    // embed retorna null → buscarHibrido continua com leg semântica vazia (não faz throw),
    // então retorna resultado da leg lexical apenas.
    const mockTx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([CANDIDATO_NOTICIA]) // lexRows
        .mockResolvedValueOnce([HEADLINE_NOTICIA]),  // headlines
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = { tx: jest.fn(async (fn: any) => fn(mockTx)) };
    const embeddings = buildEmbeddings(true, undefined); // embed retorna null
    const rerank = buildRerank(null);

    const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
    const result = await service.buscar({ q: 'saúde', page: 1, pageSize: 10 });

    // Retorna a leg lexical com sucesso
    expect(result.resultados.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 4. rerank retornando null não quebra a busca (usa ordem RRF)
  // -----------------------------------------------------------------------
  it('rerank null → usa ordem RRF sem quebrar', async () => {
    const mockTx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([CANDIDATO_NOTICIA, CANDIDATO_SERVICO])
        .mockResolvedValueOnce([HEADLINE_NOTICIA, HEADLINE_SERVICO]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = { tx: jest.fn(async (fn: any) => fn(mockTx)) };
    const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
    const rerank = buildRerank(null); // rerank retorna null

    const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
    const result = await service.buscar({ q: 'saúde', page: 1, pageSize: 10 });

    // Busca NÃO quebra; retorna resultados em ordem RRF
    expect(result.resultados.length).toBe(2);
    // rerank foi chamado mas retornou null — sem erro
    expect(rerank.rerank).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. rerank reordena candidatos quando retorna resultados
  // -----------------------------------------------------------------------
  it('rerank reordena: servico (index 1, score 0.9) vem antes de noticia (index 0, score 0.5)', async () => {
    const mockTx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([CANDIDATO_NOTICIA, CANDIDATO_SERVICO]) // lex: noticia, servico
        .mockResolvedValueOnce([HEADLINE_NOTICIA, HEADLINE_SERVICO]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = { tx: jest.fn(async (fn: any) => fn(mockTx)) };
    const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
    // Rerank inverte: servico (índice 1) tem score mais alto
    const rerank = buildRerank([
      { index: 1, score: 0.9 }, // servico
      { index: 0, score: 0.5 }, // noticia
    ]);

    const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
    const result = await service.buscar({ q: 'alvará', page: 1, pageSize: 10 });

    expect(result.resultados[0].refId).toBe('uuid-servico-1');
    expect(result.resultados[0].score).toBeCloseTo(0.9);
    expect(result.resultados[1].refId).toBe('uuid-noticia-1');
    expect(result.resultados[1].score).toBeCloseTo(0.5);
  });

  // -----------------------------------------------------------------------
  // 6. Filtro por tipo antes da paginação
  // -----------------------------------------------------------------------
  it('filtra por tipo antes de paginar', async () => {
    const mockTx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([CANDIDATO_NOTICIA, CANDIDATO_SERVICO])
        .mockResolvedValueOnce([HEADLINE_NOTICIA]), // headline só para noticia
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = { tx: jest.fn(async (fn: any) => fn(mockTx)) };
    const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
    const rerank = buildRerank(null);

    const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
    const result = await service.buscar({ q: 'saúde', tipo: 'noticia', page: 1, pageSize: 10 });

    // Somente noticias retornadas
    expect(result.total).toBe(1);
    expect(result.resultados).toHaveLength(1);
    expect(result.resultados[0].tipo).toBe('noticia');
  });

  // -----------------------------------------------------------------------
  // 7. Paginação page/pageSize
  // -----------------------------------------------------------------------
  it('pagina corretamente: page 2 com pageSize 1 retorna o segundo candidato', async () => {
    const mockTx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([CANDIDATO_NOTICIA, CANDIDATO_SERVICO])
        .mockResolvedValueOnce([HEADLINE_SERVICO]), // headline do segundo
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = { tx: jest.fn(async (fn: any) => fn(mockTx)) };
    const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
    const rerank = buildRerank(null); // ordem RRF: noticia, servico

    const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
    const result = await service.buscar({ q: 'saúde', page: 2, pageSize: 1 });

    expect(result.total).toBe(2);
    expect(result.resultados).toHaveLength(1);
    // Segundo item na ordem RRF (servico)
    expect(result.resultados[0].refId).toBe('uuid-servico-1');
  });

  // -----------------------------------------------------------------------
  // 8. Isolamento de tenant: query SEMPRE roda dentro de prisma.tx()
  // -----------------------------------------------------------------------
  it('executa ambas as legs dentro de prisma.tx() (garante GUC de tenant)', async () => {
    const mockTx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([CANDIDATO_NOTICIA])
        .mockResolvedValueOnce([HEADLINE_NOTICIA]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = { tx: jest.fn(async (fn: any) => fn(mockTx)) };
    const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
    const rerank = buildRerank(null);

    const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
    await service.buscar({ q: 'saúde', page: 1, pageSize: 10 });

    // Ao menos 2 chamadas a tx(): 1 para ambas as legs, 1 para headlines.
    expect(prisma.tx).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 9. Candidatos semânticos SEM entrada no search_index são excluídos (LGPD)
  // -----------------------------------------------------------------------
  it('exclui candidato semântico que não existe no search_index (proteção LGPD/segurança)', async () => {
    // A leg lexical retorna apenas CANDIDATO_NOTICIA.
    // A leg semântica retorna CANDIDATO_SERVICO (uuid-servico-1, fonte=servicos)
    // mas esse ref_id não está na leg lexical → deve ser excluído.
    const mockTx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([CANDIDATO_NOTICIA]) // lexRows: só noticia
        .mockResolvedValueOnce([HEADLINE_NOTICIA]),  // headlines
      // Leg semântica retorna o servico (não está no search_index desta consulta)
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        { fonte: 'servicos', ref_id: 'uuid-servico-1', titulo: 'Alvará', url: '/servicos/alvara', trecho: 'texto' },
      ]),
    };
    const prisma = { tx: jest.fn(async (fn: any) => fn(mockTx)) };
    const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
    const rerank = buildRerank(null);

    const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
    const result = await service.buscar({ q: 'alvará', page: 1, pageSize: 10 });

    // Apenas a noticia deve aparecer — o servico foi bloqueado pelo filtro LGPD
    expect(result.total).toBe(1);
    expect(result.resultados[0].refId).toBe('uuid-noticia-1');
  });

  // -----------------------------------------------------------------------
  // 10. Fonte 'conhecimento' é excluída da leg semântica
  // -----------------------------------------------------------------------
  it("exclui fonte 'conhecimento' da leg semântica (base interna da IA)", async () => {
    const mockTx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([CANDIDATO_NOTICIA])
        .mockResolvedValueOnce([HEADLINE_NOTICIA]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        // Este chunk é de 'conhecimento' → deve ser ignorado
        { fonte: 'conhecimento', ref_id: 'uuid-noticia-1', titulo: 'Resposta interna', url: null, trecho: 'interno' },
      ]),
    };
    const prisma = { tx: jest.fn(async (fn: any) => fn(mockTx)) };
    const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
    const rerank = buildRerank(null);

    const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
    const result = await service.buscar({ q: 'saúde', page: 1, pageSize: 10 });

    // O chunk de 'conhecimento' não enriquece rank nem apareçe no resultado.
    // A noticia aparece apenas pela leg lexical (rank_sem ausente não some).
    expect(result.resultados[0].refId).toBe('uuid-noticia-1');
    // Verifica que rerank foi chamado com o texto correto (sem 'Resposta interna')
    if (rerank.rerank.mock.calls.length > 0) {
      const docs: string[] = rerank.rerank.mock.calls[0][1];
      const temInterno = docs.some((d: string) => d.includes('Resposta interna'));
      expect(temInterno).toBe(false);
    }
  });

  // -----------------------------------------------------------------------
  // 11. Fallback para FTS quando buscarHibrido lança erro inesperado
  // -----------------------------------------------------------------------
  it('cai no FTS puro quando buscarHibrido lança erro inesperado', async () => {
    const mockTxFts = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([CANDIDATO_NOTICIA])
        .mockResolvedValueOnce([{ total: BigInt(1) }]),
    };
    let txCallCount = 0;
    const prisma = {
      tx: jest.fn(async (fn: any) => {
        txCallCount++;
        // Primeira chamada (leg híbrida) explode
        if (txCallCount === 1) throw new Error('pgvector indisponível');
        // Segunda chamada (FTS puro) funciona
        return fn(mockTxFts);
      }),
    };
    const embeddings = buildEmbeddings(true, new Array(1024).fill(0.1));
    const rerank = buildRerank(null);

    const service = new BuscaService(prisma as any, embeddings as any, rerank as any);
    const result = await service.buscar({ q: 'saúde', page: 1, pageSize: 10 });

    // Busca não quebra — retorna via FTS puro
    expect(result.total).toBe(1);
    expect(result.resultados[0].refId).toBe('uuid-noticia-1');
  });
});
