import {
  solicitacaoTransicionar,
  incidenteTransicionar,
  calcularPrazoComunicacao,
} from './lgpd-fsm';
import { SolicitacaoStatus, IncidenteStatus } from './lgpd.dto';

describe('FSM de Solicitações do Titular (spec 3.2.4)', () => {
  it('aberta → em_andamento (válida)', () => {
    const r = solicitacaoTransicionar(
      SolicitacaoStatus.ABERTA,
      SolicitacaoStatus.EM_ANDAMENTO,
    );
    expect(r.ok).toBe(true);
  });

  it('aberta → encaminhada (válida)', () => {
    const r = solicitacaoTransicionar(
      SolicitacaoStatus.ABERTA,
      SolicitacaoStatus.ENCAMINHADA,
    );
    expect(r.ok).toBe(true);
  });

  it('aberta → concluida (inválida — pula estado)', () => {
    const r = solicitacaoTransicionar(
      SolicitacaoStatus.ABERTA,
      SolicitacaoStatus.CONCLUIDA,
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toMatch(/inválida/i);
  });

  it('em_andamento → concluida (válida)', () => {
    expect(
      solicitacaoTransicionar(
        SolicitacaoStatus.EM_ANDAMENTO,
        SolicitacaoStatus.CONCLUIDA,
      ).ok,
    ).toBe(true);
  });

  it('em_andamento → indeferida (válida)', () => {
    expect(
      solicitacaoTransicionar(
        SolicitacaoStatus.EM_ANDAMENTO,
        SolicitacaoStatus.INDEFERIDA,
      ).ok,
    ).toBe(true);
  });

  it('concluida → qualquer (terminal — inválida)', () => {
    const r = solicitacaoTransicionar(
      SolicitacaoStatus.CONCLUIDA,
      SolicitacaoStatus.ABERTA,
    );
    expect(r.ok).toBe(false);
  });

  it('encerrado → registrado (inválida — status não reconhecido para Sol)', () => {
    // 'encerrado' não é um status de solicitacao — deve retornar erro
    const r = solicitacaoTransicionar('encerrado', SolicitacaoStatus.ABERTA);
    expect(r.ok).toBe(false);
  });
});

describe('FSM de Incidentes de Segurança (spec 4.2)', () => {
  it('registrado → em_avaliacao (válida)', () => {
    expect(
      incidenteTransicionar(
        IncidenteStatus.REGISTRADO,
        IncidenteStatus.EM_AVALIACAO,
      ).ok,
    ).toBe(true);
  });

  it('registrado → em_contencao (inválida — pula estado)', () => {
    const r = incidenteTransicionar(
      IncidenteStatus.REGISTRADO,
      IncidenteStatus.EM_CONTENCAO,
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toMatch(/inválida/i);
  });

  it('em_avaliacao → comunicado (válida — baixa sev. pode ir diretamente)', () => {
    expect(
      incidenteTransicionar(
        IncidenteStatus.EM_AVALIACAO,
        IncidenteStatus.COMUNICADO,
      ).ok,
    ).toBe(true);
  });

  it('em_contencao → encerrado (válida)', () => {
    expect(
      incidenteTransicionar(
        IncidenteStatus.EM_CONTENCAO,
        IncidenteStatus.ENCERRADO,
      ).ok,
    ).toBe(true);
  });

  it('encerrado → registrado (terminal — inválida)', () => {
    const r = incidenteTransicionar(
      IncidenteStatus.ENCERRADO,
      IncidenteStatus.REGISTRADO,
    );
    expect(r.ok).toBe(false);
  });
});

describe('calcularPrazoComunicacao (spec 4.3)', () => {
  const base = new Date('2026-06-10T08:00:00Z');

  it('severidade critica → 2 dias', () => {
    const prazo = calcularPrazoComunicacao(base, 'critica', ['nome']);
    const diff = prazo.getTime() - base.getTime();
    expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('severidade alta → 2 dias', () => {
    const prazo = calcularPrazoComunicacao(base, 'alta', ['email']);
    const diff = prazo.getTime() - base.getTime();
    expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('dado sensível (cpf) + media → 2 dias', () => {
    const prazo = calcularPrazoComunicacao(base, 'media', ['cpf', 'email']);
    const diff = prazo.getTime() - base.getTime();
    expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('dado sensível (dado_saude) → 2 dias', () => {
    const prazo = calcularPrazoComunicacao(base, 'baixa', ['dado_saude']);
    const diff = prazo.getTime() - base.getTime();
    expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('severidade media + dados não sensíveis → 5 dias', () => {
    const prazo = calcularPrazoComunicacao(base, 'media', ['nome', 'email']);
    const diff = prazo.getTime() - base.getTime();
    expect(diff).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it('severidade baixa sem dados sensíveis → 5 dias', () => {
    const prazo = calcularPrazoComunicacao(base, 'baixa', ['nome']);
    const diff = prazo.getTime() - base.getTime();
    expect(diff).toBe(5 * 24 * 60 * 60 * 1000);
  });
});
