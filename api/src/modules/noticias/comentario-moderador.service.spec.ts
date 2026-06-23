/**
 * Unit tests para ComentarioModeradorService.
 *
 * Foco: Camada 1 (determinística) — sem IA.
 * Camada 2 (IA): testada via mock do AnthropicService.
 *
 * Princípio: NÃO reprove crítica legítima; REPROVE código malicioso, baixo calão,
 * spam e conteúdo sem nexo quando a IA detecta.
 */
import { ComentarioModeradorService } from './comentario-moderador.service';

const TENANT_ID = 'tenant-aaaa-0000-0000-0000-000000000000';

const buildMockPrisma = (iaChatHabilitada = false) => ({
  platform: () => ({
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ iaChatHabilitada }),
    },
  }),
});

const buildMockAnthropic = (resposta = '{"decisao":"ok","categoria":"ok","motivo":null}') => ({
  completar: jest.fn().mockResolvedValue(resposta),
});

describe('ComentarioModeradorService', () => {
  // ---------------------------------------------------------------- Camada 1 — Código Malicioso

  describe('Camada 1 — código malicioso (sempre reprova, sem IA)', () => {
    let service: ComentarioModeradorService;

    beforeEach(() => {
      service = new ComentarioModeradorService(
        buildMockPrisma(false) as any,
        buildMockAnthropic() as any,
      );
    });

    const casosXSS = [
      ['tag script', '<script>alert(1)</script>'],
      ['tag script com atributo', '<script src="evil.js">'],
      ['tag iframe', '<iframe src="x">'],
      ['javascript: URI', 'clique aqui: javascript:void(0)'],
      ['onerror inline', '<img onerror="alert(1)" src="x">'],
      ['onload inline', '<body onload="evil()">'],
      ['onclick inline', '<a onclick="x()">link</a>'],
      ['eval call', 'eval(atob("eHh4"))'],
      ['document.cookie', 'document.cookie = "stolen"'],
      ['svg tag', '<svg onload="alert(1)">'],
      ['data:text/html', 'data:text/html,<script>alert(1)</script>'],
      ['template injection', '{{7*7}}'],
      ['template injection ${}', '${process.env}'],
    ];

    test.each(casosXSS)('reprova %s', async (_nome, conteudo) => {
      const result = await service.avaliar(conteudo, TENANT_ID);
      expect(result.decisao).toBe('reprovar');
      expect(result.categoria).toBe('codigo_malicioso');
    });

    const casosSQL = [
      ['union select', "' UNION SELECT * FROM users--"],
      ['drop table', 'DROP TABLE noticia_comentarios;'],
      ['insert into', "INSERT INTO users VALUES ('hacker','pw')"],
      ['or 1=1', "' OR '1'='1"],
      ['comentário SQL', "noticia; -- apagar tudo"],
    ];

    test.each(casosSQL)('reprova SQL injection: %s', async (_nome, conteudo) => {
      const result = await service.avaliar(conteudo, TENANT_ID);
      expect(result.decisao).toBe('reprovar');
      expect(result.categoria).toBe('codigo_malicioso');
    });
  });

  // ---------------------------------------------------------------- Camada 1 — Baixo Calão

  describe('Camada 1 — baixo calão (sempre reprova, sem IA)', () => {
    let service: ComentarioModeradorService;

    beforeEach(() => {
      service = new ComentarioModeradorService(
        buildMockPrisma(false) as any,
        buildMockAnthropic() as any,
      );
    });

    const casosBaixoCalao = [
      ['palavrão básico 1', 'isso é uma merda de prefeitura'],
      ['palavrão básico 2', 'que porra é essa'],
      ['FDP', 'você é um fdp'],
      ['palavrão composto', 'filho da puta prefeito'],
      ['palavrão com variação', 'babaca mesmo'],
      ['palavrão de xingamento direto', 'seu idiota'],
    ];

    test.each(casosBaixoCalao)('reprova %s', async (_nome, conteudo) => {
      const result = await service.avaliar(conteudo, TENANT_ID);
      expect(result.decisao).toBe('reprovar');
      expect(result.categoria).toBe('baixo_calao');
    });

    it('NÃO reprova crítica legítima sem palavrão', async () => {
      const critica = 'A gestão desta prefeitura é uma vergonha. O prefeito não cumpre suas promessas.';
      const result = await service.avaliar(critica, TENANT_ID);
      // Sem IA habilitada → pendente
      expect(result.decisao).toBe('pendente');
    });
  });

  // ---------------------------------------------------------------- Camada 1 — Spam

  describe('Camada 1 — spam heurístico (sempre reprova, sem IA)', () => {
    let service: ComentarioModeradorService;

    beforeEach(() => {
      service = new ComentarioModeradorService(
        buildMockPrisma(false) as any,
        buildMockAnthropic() as any,
      );
    });

    it('reprova quando há mais de 3 URLs', async () => {
      const spam = 'veja: http://x.com http://y.com https://z.com www.evil.com e mais!';
      const result = await service.avaliar(spam, TENANT_ID);
      expect(result.decisao).toBe('reprovar');
      expect(result.categoria).toBe('spam');
    });

    it('reprova sequência de caracteres repetidos (8+)', async () => {
      const spam = 'aaaaaaaaaaaaaaaaa spam aqui';
      const result = await service.avaliar(spam, TENANT_ID);
      expect(result.decisao).toBe('reprovar');
      expect(result.categoria).toBe('spam');
    });

    it('reprova texto com >60% CAIXA ALTA num texto longo', async () => {
      const spam = 'CLIQUE AQUI AGORA MESMO OFERTA IMPERDÍVEL COMPRE AGORA';
      const result = await service.avaliar(spam, TENANT_ID);
      expect(result.decisao).toBe('reprovar');
      expect(result.categoria).toBe('spam');
    });

    it('reprova mesma palavra repetida 5+ vezes', async () => {
      const spam = 'compre compre compre compre compre esse produto agora';
      const result = await service.avaliar(spam, TENANT_ID);
      expect(result.decisao).toBe('reprovar');
      expect(result.categoria).toBe('spam');
    });

    it('NÃO reprova texto com 1-3 URLs (legítimo)', async () => {
      const legit = 'Veja a lei em http://legislacao.gov.br e o decreto em https://pref.gov.br';
      const result = await service.avaliar(legit, TENANT_ID);
      // Sem IA → pendente (não spam)
      expect(result.decisao).toBe('pendente');
    });
  });

  // ---------------------------------------------------------------- Camada 1 — Conteúdo legítimo passa para IA / pendente

  describe('Camada 1 — conteúdo legítimo (não dispara regras determinísticas)', () => {
    let service: ComentarioModeradorService;

    beforeEach(() => {
      // IA desabilitada → resultado sempre 'pendente' se Camada 1 não reprovar
      service = new ComentarioModeradorService(
        buildMockPrisma(false) as any,
        buildMockAnthropic() as any,
      );
    });

    const casosLegitimos = [
      'Ótima notícia! Parabéns à equipe da prefeitura.',
      'Gostaria de saber quando a obra da rua 7 será concluída.',
      'A gestão pública precisa melhorar o atendimento ao cidadão.',
      'Por favor, verifiquem o buraco na calçada da Av. Central.',
      'Quando será publicado o edital do concurso?',
    ];

    test.each(casosLegitimos)('passa para pendente: "%s"', async (conteudo) => {
      const result = await service.avaliar(conteudo, TENANT_ID);
      expect(result.decisao).toBe('pendente');
    });
  });

  // ---------------------------------------------------------------- Camada 2 — IA habilita moderação contextual

  describe('Camada 2 — IA (iaChatHabilitada=true)', () => {
    it('chama IA quando Camada 1 não reprova e IA está habilitada', async () => {
      const mockAnthropic = buildMockAnthropic('{"decisao":"ok","categoria":"ok","motivo":null}');
      const service = new ComentarioModeradorService(
        buildMockPrisma(true) as any,
        mockAnthropic as any,
      );
      const result = await service.avaliar('Comentário normal sem problemas.', TENANT_ID);
      expect(mockAnthropic.completar).toHaveBeenCalled();
      expect(result.decisao).toBe('pendente');
    });

    it('reprova quando IA retorna decisao=reprovar', async () => {
      const mockAnthropic = buildMockAnthropic(
        '{"decisao":"reprovar","categoria":"ofensivo","motivo":"Linguagem ofensiva detectada."}',
      );
      const service = new ComentarioModeradorService(
        buildMockPrisma(true) as any,
        mockAnthropic as any,
      );
      const result = await service.avaliar('Conteúdo limítrofe.', TENANT_ID);
      expect(result.decisao).toBe('reprovar');
      expect(result.categoria).toBe('ofensivo');
    });

    it('degrada graciosamente se IA lançar erro — retorna pendente', async () => {
      const mockAnthropic = { completar: jest.fn().mockRejectedValue(new Error('503 Anthropic')) };
      const service = new ComentarioModeradorService(
        buildMockPrisma(true) as any,
        mockAnthropic as any,
      );
      const result = await service.avaliar('Comentário normal.', TENANT_ID);
      expect(result.decisao).toBe('pendente');
      expect(result.motivo).toBeNull();
    });

    it('degrada graciosamente se IA retornar JSON inválido — retorna pendente', async () => {
      const mockAnthropic = buildMockAnthropic('Não sei responder isso agora.');
      const service = new ComentarioModeradorService(
        buildMockPrisma(true) as any,
        mockAnthropic as any,
      );
      const result = await service.avaliar('Comentário normal.', TENANT_ID);
      expect(result.decisao).toBe('pendente');
    });

    it('NÃO chama IA quando Camada 1 já reprovou (economia de tokens)', async () => {
      const mockAnthropic = buildMockAnthropic();
      const service = new ComentarioModeradorService(
        buildMockPrisma(true) as any,
        mockAnthropic as any,
      );
      // Script malicioso → Camada 1 reprova imediatamente
      await service.avaliar('<script>evil()</script>', TENANT_ID);
      expect(mockAnthropic.completar).not.toHaveBeenCalled();
    });

    it('NÃO chama IA quando iaChatHabilitada=false', async () => {
      const mockAnthropic = buildMockAnthropic();
      const service = new ComentarioModeradorService(
        buildMockPrisma(false) as any, // IA desabilitada
        mockAnthropic as any,
      );
      await service.avaliar('Comentário normal.', TENANT_ID);
      expect(mockAnthropic.completar).not.toHaveBeenCalled();
    });

    it('parseia JSON embrulhado em markdown (```json ... ```)', async () => {
      const mockAnthropic = buildMockAnthropic(
        '```json\n{"decisao":"reprovar","categoria":"sem_nexo","motivo":"Texto sem nexo."}\n```',
      );
      const service = new ComentarioModeradorService(
        buildMockPrisma(true) as any,
        mockAnthropic as any,
      );
      const result = await service.avaliar('asdjk asdjk asdjk xzxz', TENANT_ID);
      expect(result.decisao).toBe('reprovar');
      expect(result.categoria).toBe('sem_nexo');
    });
  });
});
