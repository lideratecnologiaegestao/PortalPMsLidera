/**
 * Testes unitários do helper destinoCidadao.
 *
 * Verifica o comportamento para cada canal:
 *  - whatsapp  → visitanteTelefone first, fallback identificador
 *  - instagram → visitanteIdentificador first (PSID), fallback telefone
 *  - messenger → visitanteIdentificador first (PSID), fallback telefone
 *  - telegram  → visitanteIdentificador first (chat_id), fallback telefone
 *  - ambos null → null
 */

import { destinoCidadao } from './atendimento-destino.util';

describe('destinoCidadao()', () => {
  // ---- WhatsApp: destino é telefone ----

  it('whatsapp: retorna visitanteTelefone quando presente', () => {
    expect(
      destinoCidadao({ canal: 'whatsapp', visitanteTelefone: '5566999998888', visitanteIdentificador: 'PSID-123' }),
    ).toBe('5566999998888');
  });

  it('whatsapp: fallback para visitanteIdentificador quando telefone é null', () => {
    expect(
      destinoCidadao({ canal: 'whatsapp', visitanteTelefone: null, visitanteIdentificador: 'PSID-XYZ' }),
    ).toBe('PSID-XYZ');
  });

  it('whatsapp: retorna null quando ambos são null', () => {
    expect(
      destinoCidadao({ canal: 'whatsapp', visitanteTelefone: null, visitanteIdentificador: null }),
    ).toBeNull();
  });

  it('whatsapp: retorna null quando ambos são undefined', () => {
    expect(destinoCidadao({ canal: 'whatsapp' })).toBeNull();
  });

  // ---- Instagram: destino é PSID (visitanteIdentificador) ----

  it('instagram: retorna visitanteIdentificador (PSID) quando presente', () => {
    expect(
      destinoCidadao({ canal: 'instagram', visitanteTelefone: null, visitanteIdentificador: 'psid-1234567890' }),
    ).toBe('psid-1234567890');
  });

  it('instagram: NÃO usa visitanteTelefone como destino primário', () => {
    // telefone presente, identificador null → deve retornar telefone como fallback
    const resultado = destinoCidadao({
      canal: 'instagram',
      visitanteTelefone: '5566888887777',
      visitanteIdentificador: null,
    });
    // O telefone é fallback — retorna ele, mas não como primário
    expect(resultado).toBe('5566888887777');
  });

  it('instagram: retorna visitanteIdentificador preferindo-o ao telefone', () => {
    const resultado = destinoCidadao({
      canal: 'instagram',
      visitanteTelefone: '5566888887777',
      visitanteIdentificador: 'psid-abc',
    });
    expect(resultado).toBe('psid-abc');
  });

  it('instagram: retorna null quando ambos null', () => {
    expect(
      destinoCidadao({ canal: 'instagram', visitanteTelefone: null, visitanteIdentificador: null }),
    ).toBeNull();
  });

  // ---- Messenger: mesmo comportamento que Instagram ----

  it('messenger: retorna visitanteIdentificador (PSID)', () => {
    expect(
      destinoCidadao({ canal: 'messenger', visitanteTelefone: null, visitanteIdentificador: 'psid-fb-987' }),
    ).toBe('psid-fb-987');
  });

  it('messenger: fallback para telefone quando identificador null', () => {
    expect(
      destinoCidadao({ canal: 'messenger', visitanteTelefone: '5577000001234', visitanteIdentificador: null }),
    ).toBe('5577000001234');
  });

  // ---- Telegram: destino é chat_id (visitanteIdentificador) ----

  it('telegram: retorna visitanteIdentificador (chat_id)', () => {
    expect(
      destinoCidadao({ canal: 'telegram', visitanteTelefone: null, visitanteIdentificador: '123456789' }),
    ).toBe('123456789');
  });

  it('telegram: retorna null quando ambos null', () => {
    expect(
      destinoCidadao({ canal: 'telegram', visitanteTelefone: null, visitanteIdentificador: null }),
    ).toBeNull();
  });

  // ---- Widget (canal não externo) ----

  it('widget: retorna identificador first (comportamento genérico)', () => {
    // widget normalmente não chega a este helper (envio externo não ocorre),
    // mas o helper é agnóstico e retorna identificador para qualquer canal não-whatsapp.
    expect(
      destinoCidadao({ canal: 'widget', visitanteTelefone: '5566111110000', visitanteIdentificador: 'sess-abc' }),
    ).toBe('sess-abc');
  });
});
