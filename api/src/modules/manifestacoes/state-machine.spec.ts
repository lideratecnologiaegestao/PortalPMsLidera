import { transicionar, eventosValidos } from './state-machine';

describe('FSM de manifestações (ESIC/Ouvidoria)', () => {
  describe('transicionar', () => {
    it('aceita transição válida e retorna o próximo estado', () => {
      const r = transicionar('registrada', 'iniciar_analise', 'esic');
      expect(r.ok).toBe(true);
      expect(r.para).toBe('em_analise');
    });

    it('rejeita transição inválida (evento não existe no estado)', () => {
      const r = transicionar('registrada', 'responder', 'esic');
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/inválida/i);
    });

    it('aplica guard de canal: indeferir só no ESIC', () => {
      expect(transicionar('em_analise', 'indeferir', 'esic').ok).toBe(true);
      const ouv = transicionar('em_analise', 'indeferir', 'ouvidoria');
      expect(ouv.ok).toBe(false);
      expect(ouv.erro).toMatch(/canal/i);
    });

    it('recurso de 1ª instância é exclusivo do ESIC', () => {
      expect(transicionar('respondida', 'abrir_recurso_1a', 'esic').ok).toBe(true);
      expect(transicionar('respondida', 'abrir_recurso_1a', 'ouvidoria').ok).toBe(false);
    });

    it('sinaliza os efeitos de SLA corretos', () => {
      expect(transicionar('em_analise', 'solicitar_complemento', 'esic').efeito).toBe('pausa_sla');
      expect(transicionar('aguardando_cidadao', 'retomar', 'esic').efeito).toBe('retoma_sla');
      expect(transicionar('em_tratamento', 'prorrogar', 'esic').efeito).toBe('estende_sla');
      expect(transicionar('em_analise', 'responder', 'esic').efeito).toBe('encerra_sla');
    });
  });

  describe('eventosValidos', () => {
    it('lista os eventos do estado e filtra os guardados por canal', () => {
      const esic = eventosValidos('em_tratamento', 'esic');
      expect(esic).toEqual(expect.arrayContaining(['indeferir', 'atender_parcial', 'responder']));

      const ouv = eventosValidos('em_tratamento', 'ouvidoria');
      expect(ouv).not.toContain('indeferir'); // guard soEsic
      expect(ouv).not.toContain('atender_parcial');
      expect(ouv).toEqual(expect.arrayContaining(['responder', 'prorrogar']));
    });

    it('estado terminal/desconhecido retorna lista vazia', () => {
      expect(eventosValidos('concluida', 'esic')).toEqual([]);
      expect(eventosValidos('arquivada', 'ouvidoria')).toEqual([]);
    });
  });
});
