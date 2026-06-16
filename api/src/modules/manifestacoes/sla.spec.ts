import { addDays, isWeekend } from 'date-fns';
import {
  adicionarDias,
  calcularPrazo,
  instanteAlerta,
  prazoAposPausa,
  prazoPadrao,
} from './sla';

const DIA = 86_400_000;

describe('SLA — prazos legais (LAI / Lei 13.460)', () => {
  describe('prazoPadrao', () => {
    it('ESIC = 20 + 10; Ouvidoria = 30 + 30', () => {
      expect(prazoPadrao('esic', 'acesso_informacao')).toMatchObject({ dias: 20, prorrogacaoDias: 10 });
      expect(prazoPadrao('ouvidoria', 'denuncia')).toMatchObject({ dias: 30, prorrogacaoDias: 30 });
    });
  });

  describe('adicionarDias', () => {
    const inicio = new Date('2026-01-02T12:00:00Z'); // sexta-feira

    it('corridos: soma dias de calendário', () => {
      expect(adicionarDias(inicio, 5, false)).toEqual(addDays(inicio, 5));
    });

    it('úteis: nunca cai em fim de semana e leva >= que corridos', () => {
      const r = adicionarDias(inicio, 5, true);
      expect(isWeekend(r)).toBe(false);
      expect(r.getTime()).toBeGreaterThanOrEqual(addDays(inicio, 5).getTime());
    });

    it('úteis: pula 1 dia útil a partir de sexta cai na segunda', () => {
      const r = adicionarDias(inicio, 1, true); // sex -> (sab,dom pulados) -> seg
      expect(r.toISOString().slice(0, 10)).toBe('2026-01-05');
    });

    it('úteis: pula feriados informados', () => {
      const feriados = new Set(['2026-01-05']); // segunda vira feriado
      const r = adicionarDias(inicio, 1, true);
      const rComFeriado = adicionarDias(inicio, 1, true, feriados);
      expect(rComFeriado.getTime()).toBeGreaterThan(r.getTime());
      expect(rComFeriado.toISOString().slice(0, 10)).toBe('2026-01-06');
    });
  });

  describe('calcularPrazo', () => {
    it('ESIC: 20 dias corridos a partir do registro', () => {
      const inicio = new Date('2026-06-01T12:00:00Z');
      const prazo = calcularPrazo(inicio, prazoPadrao('esic', 'acesso_informacao'));
      expect(Math.round((prazo.getTime() - inicio.getTime()) / DIA)).toBe(20);
    });
  });

  describe('instanteAlerta', () => {
    it('fica a ~80% da janela (entre início e prazo)', () => {
      const inicio = new Date(Date.now() + DIA); // futuro p/ não bater no piso "agora"
      const prazo = new Date(inicio.getTime() + 10 * DIA);
      const alerta = instanteAlerta(inicio, prazo);
      const frac = (alerta.getTime() - inicio.getTime()) / (prazo.getTime() - inicio.getTime());
      expect(frac).toBeCloseTo(0.8, 5);
    });

    it('nunca anterior a agora (prazo já vencido → ~agora)', () => {
      const inicio = new Date(Date.now() - 100 * DIA);
      const prazo = new Date(Date.now() - 50 * DIA);
      const alerta = instanteAlerta(inicio, prazo);
      expect(alerta.getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    });
  });

  describe('prazoAposPausa', () => {
    it('estende o prazo pela duração da pausa', () => {
      const prazo = new Date('2026-06-21T12:00:00Z');
      const pausado = new Date('2026-06-10T12:00:00Z');
      const retomado = new Date('2026-06-13T12:00:00Z'); // 3 dias de pausa
      const novo = prazoAposPausa(prazo, pausado, retomado);
      expect(Math.round((novo.getTime() - prazo.getTime()) / DIA)).toBe(3);
    });
  });
});
