import {
  montarContexto,
  parseTriagem,
  sanitizarTexto,
  sistemaTriagem,
  usuarioTriagem,
} from './ia.prompts';

describe('IA prompts/parser', () => {
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
