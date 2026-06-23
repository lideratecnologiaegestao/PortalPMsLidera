import {
  corrigirLinksInternos,
  limparQuebrasResposta,
  montarContexto,
  parseTriagem,
  sanitizarTexto,
  sistemaTriagem,
  usuarioTriagem,
} from './ia.prompts';

describe('IA prompts/parser', () => {
  describe('corrigirLinksInternos', () => {
    it('remove host inventado de link de rota interna (vira relativo)', () => {
      const t = 'Veja o [Orçamento 2023](https://exemplolandia.mt.gov.br/midia/documento/leis/abc.pdf).';
      expect(corrigirLinksInternos(t)).toBe('Veja o [Orçamento 2023](/midia/documento/leis/abc.pdf).');
    });

    it('preserva o host correto do tenant também como relativo', () => {
      const t = '[doc](https://exemplolandia.lidera.app.br/midia/documento/leis/abc.pdf)';
      expect(corrigirLinksInternos(t)).toBe('[doc](/midia/documento/leis/abc.pdf)');
    });

    it('NÃO mexe em link externo oficial (gov.br)', () => {
      const t = 'Fonte: [Ministério da Saúde](https://www.gov.br/saude/pt-br/assuntos/dengue)';
      expect(corrigirLinksInternos(t)).toBe(t);
    });

    it('NÃO mexe em link já relativo', () => {
      const t = '[Serviço](/servicos/iptu) e [Notícia](/noticias/abertura)';
      expect(corrigirLinksInternos(t)).toBe(t);
    });
  });

  describe('limparQuebrasResposta', () => {
    it('junta frases quebradas pelas citações da busca web', () => {
      const bruto =
        'O Aedes aegypti transmite várias doenças. \nAs principais são: dengue e zika\n.\n\n\nO mosquito é o vetor';
      const limpo = limparQuebrasResposta(bruto);
      expect(limpo).toContain('doenças. As principais são: dengue e zika.');
      expect(limpo).not.toMatch(/\n{3,}/);
      expect(limpo).toContain('zika.\n\nO mosquito');
    });

    it('preserva parágrafos e blocos Markdown (listas, títulos)', () => {
      const md = 'Intro do texto.\n\n## Título\n\n- item um\n- item dois\n\nFim.';
      expect(limparQuebrasResposta(md)).toBe(md);
    });

    it('é seguro com entrada vazia/nula', () => {
      expect(limparQuebrasResposta('')).toBe('');
      expect(limparQuebrasResposta(undefined as never)).toBe('');
    });
  });

  describe('parseTriagem', () => {
    it('faz parse de JSON puro', () => {
      const r = parseTriagem(
        '{"tipoSugerido":"reclamacao","secretariaSugerida":"Obras","prioridade":2,"resumo":"buraco na rua","confianca":0.8}',
      );
      expect(r.tipoSugerido).toBe('reclamacao');
      expect(r.secretariaSugerida).toBe('Obras');
      expect(r.prioridade).toBe(2);
    });

    it('tolera fences markdown e texto ao redor', () => {
      const r = parseTriagem('Claro!\n```json\n{"tipoSugerido":"denuncia","prioridade":1}\n```\n');
      expect(r.tipoSugerido).toBe('denuncia');
      expect(r.prioridade).toBe(1);
    });

    it('clampa prioridade fora de 1..5 e normaliza tipo inválido', () => {
      const r = parseTriagem('{"tipoSugerido":"xpto","prioridade":99}');
      expect(r.prioridade).toBe(5);
      expect(r.tipoSugerido).toBe('solicitacao'); // fallback
    });

    it('lança erro quando não há JSON', () => {
      expect(() => parseTriagem('desculpe, não sei')).toThrow();
    });
  });

  it('sistemaTriagem lista as secretarias do tenant', () => {
    expect(sistemaTriagem(['Saúde', 'Educação'])).toContain('Saúde, Educação');
  });

  it('usuarioTriagem não inclui dados do solicitante (minimização)', () => {
    const msg = usuarioTriagem({ canal: 'ouvidoria', assunto: 'a', descricao: 'b' });
    expect(msg).toContain('Assunto: a');
    expect(msg).not.toMatch(/solicitante/i);
  });

  describe('sanitizarTexto', () => {
    it('remove CPF, e-mail e telefone', () => {
      const s = sanitizarTexto('Sou 123.456.789-09, fone (65) 99999-8888, joao@x.com');
      expect(s).toContain('[CPF REMOVIDO]');
      expect(s).toContain('[EMAIL REMOVIDO]');
      expect(s).toContain('[TELEFONE REMOVIDO]');
      expect(s).not.toMatch(/123\.456|joao@x/);
    });
    it('usuarioTriagem sanitiza a descrição', () => {
      const msg = usuarioTriagem({ canal: 'esic', assunto: 'x', descricao: 'CPF 11122233344' });
      expect(msg).toContain('[CPF REMOVIDO]');
    });
  });

  it('montarContexto numera os trechos para citação', () => {
    const ctx = montarContexto([{ titulo: 'Página X', texto: 'conteúdo' }]);
    expect(ctx).toContain('[1] Página X');
  });
});
