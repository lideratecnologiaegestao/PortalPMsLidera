/**
 * Testes unitários — MetaCloudProvider: sendList e parseInbound (id preferido).
 */

import { of } from 'rxjs';
import { MetaCloudProvider } from './meta-cloud.provider';

function makeHttp(respData: unknown) {
  return {
    post: jest.fn().mockReturnValue(of({ data: respData })),
    get: jest.fn().mockReturnValue(of({ data: respData })),
  };
}

const CREDS = {
  phoneNumberId: '123456789',
  token: 'META_TOKEN_SECRET',
  apiVersion: 'v21.0',
};

// ============================================================================
// sendList — payload correto para lista interativa
// ============================================================================

describe('MetaCloudProvider.sendList', () => {
  it('monta payload interactive.type=list com 1 section', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.001' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    const result = await p.sendList('5565999990000', {
      message: 'Escolha o tipo de manifestação:',
      tituloBotao: 'Ver opções',
      rows: [
        { id: 'Quero fazer uma denúncia.', label: '🚨 Denúncia' },
        { id: 'Quero fazer uma reclamação.', label: '😠 Reclamação' },
        { id: 'Quero deixar uma sugestão.', label: '💡 Sugestão' },
        { id: 'Quero deixar um elogio.', label: '👏 Elogio' },
        { id: 'Quero fazer uma solicitação.', label: '📋 Solicitação' },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe('wamid.001');

    const body = http.post.mock.calls[0][1] as {
      type: string;
      interactive: {
        type: string;
        body: { text: string };
        action: { button: string; sections: { rows: { id: string; title: string }[] }[] };
      };
    };

    expect(body.type).toBe('interactive');
    expect(body.interactive.type).toBe('list');
    expect(body.interactive.body.text).toBe('Escolha o tipo de manifestação:');
    expect(body.interactive.action.button).toBe('Ver opções');
    expect(body.interactive.action.sections).toHaveLength(1);
    expect(body.interactive.action.sections[0].rows).toHaveLength(5);
  });

  it('o id da row carrega o valor da opção do bot', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.002' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    await p.sendList('5565999990000', {
      message: 'Menu:',
      rows: [
        { id: 'Quero fazer uma denúncia.', label: '🚨 Denúncia' },
        { id: 'Quero fazer uma reclamação.', label: '😠 Reclamação' },
      ],
    });

    const body = http.post.mock.calls[0][1] as {
      interactive: { action: { sections: { rows: { id: string; title: string }[] }[] } };
    };
    const rows = body.interactive.action.sections[0].rows;
    expect(rows[0].id).toBe('Quero fazer uma denúncia.');
    expect(rows[1].id).toBe('Quero fazer uma reclamação.');
  });

  it('usa "Escolher" como botão padrão quando tituloBotao não fornecido', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.003' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    await p.sendList('5565999990000', {
      message: 'Menu',
      rows: [{ id: 'val1', label: 'Opção 1' }],
    });

    const body = http.post.mock.calls[0][1] as {
      interactive: { action: { button: string } };
    };
    expect(body.interactive.action.button).toBe('Escolher');
  });

  it('trunca rows a 10 (limite Meta)', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.004' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    const muitasRows = Array.from({ length: 15 }, (_, i) => ({
      id: `val-${i}`,
      label: `Opção ${i + 1}`,
    }));

    await p.sendList('5565999990000', { message: 'Menu grande', rows: muitasRows });

    const body = http.post.mock.calls[0][1] as {
      interactive: { action: { sections: { rows: unknown[] }[] } };
    };
    expect(body.interactive.action.sections[0].rows).toHaveLength(10);
  });

  it('trunca row.id a 200 chars', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.005' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    const idLongo = 'x'.repeat(250);
    await p.sendList('5565999990000', {
      message: 'Menu',
      rows: [{ id: idLongo, label: 'Opção' }],
    });

    const body = http.post.mock.calls[0][1] as {
      interactive: { action: { sections: { rows: { id: string }[] }[] } };
    };
    expect(body.interactive.action.sections[0].rows[0].id.length).toBe(200);
  });

  it('trunca row.title a 24 chars', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.006' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    await p.sendList('5565999990000', {
      message: 'Menu',
      rows: [{ id: 'val', label: 'Rótulo muito longo que passa de 24' }],
    });

    const body = http.post.mock.calls[0][1] as {
      interactive: { action: { sections: { rows: { title: string }[] }[] } };
    };
    expect(body.interactive.action.sections[0].rows[0].title.length).toBeLessThanOrEqual(24);
  });

  it('inclui description quando fornecida', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.007' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    await p.sendList('5565999990000', {
      message: 'Menu',
      rows: [{ id: 'val', label: 'Opção', descricao: 'Descrição da opção' }],
    });

    const body = http.post.mock.calls[0][1] as {
      interactive: { action: { sections: { rows: { description?: string }[] }[] } };
    };
    expect(body.interactive.action.sections[0].rows[0].description).toBe('Descrição da opção');
  });

  it('normaliza número para E.164 BR', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.008' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    await p.sendList('65999990000', {
      message: 'Menu',
      rows: [{ id: 'v', label: 'L' }],
    });

    const body = http.post.mock.calls[0][1] as { to: string };
    expect(body.to).toBe('5565999990000');
  });
});

// ============================================================================
// parseInbound — prefere id da resposta interativa sobre title
// ============================================================================

describe('MetaCloudProvider.parseInbound — id interativo preferido', () => {
  const provider = new MetaCloudProvider(null as any, CREDS);

  it('retorna button_reply.id quando disponível (não title)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: '123456789' },
            contacts: [{ profile: { name: 'Maria' }, wa_id: '5565999990001' }],
            messages: [{
              from: '5565999990001',
              id: 'wamid.inbound001',
              type: 'interactive',
              interactive: {
                button_reply: {
                  id: 'Quero fazer uma denúncia.',
                  title: '🚨 Denúncia',
                },
              },
            }],
          },
        }],
      }],
    };

    const result = provider.parseInbound(payload);

    expect(result).not.toBeNull();
    // Deve retornar o id (valor que o bot entende), não o title (rótulo de exibição)
    expect(result!.texto).toBe('Quero fazer uma denúncia.');
  });

  it('retorna list_reply.id quando disponível (não title)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: '123456789' },
            contacts: [{ profile: { name: 'João' }, wa_id: '5565999990002' }],
            messages: [{
              from: '5565999990002',
              id: 'wamid.inbound002',
              type: 'interactive',
              interactive: {
                list_reply: {
                  id: 'Quero fazer uma reclamação.',
                  title: '😠 Reclamação',
                },
              },
            }],
          },
        }],
      }],
    };

    const result = provider.parseInbound(payload);

    expect(result).not.toBeNull();
    expect(result!.texto).toBe('Quero fazer uma reclamação.');
  });

  it('usa button.text para respostas de botão de template (não interativo)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: '123456789' },
            contacts: [{ profile: { name: 'Ana' }, wa_id: '5565999990003' }],
            messages: [{
              from: '5565999990003',
              id: 'wamid.inbound003',
              type: 'button',
              button: { text: 'Sim, concordo' },
            }],
          },
        }],
      }],
    };

    const result = provider.parseInbound(payload);

    expect(result).not.toBeNull();
    expect(result!.texto).toBe('Sim, concordo');
  });

  it('usa text.body para mensagens de texto livre', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: '123456789' },
            contacts: [{ profile: { name: 'Carlos' }, wa_id: '5565999990004' }],
            messages: [{
              from: '5565999990004',
              id: 'wamid.inbound004',
              type: 'text',
              text: { body: 'Quero registrar uma denúncia' },
            }],
          },
        }],
      }],
    };

    const result = provider.parseInbound(payload);

    expect(result).not.toBeNull();
    expect(result!.texto).toBe('Quero registrar uma denúncia');
  });

  it('retorna null para status updates (sem messages)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: '123456789' },
            statuses: [{ id: 'wamid.001', status: 'delivered' }],
          },
        }],
      }],
    };

    expect(provider.parseInbound(payload)).toBeNull();
  });

  it('expõe phoneNumberId em instancia para validação multi-canal', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: '123456789' },
            contacts: [{ profile: { name: 'Eva' }, wa_id: '5565999990005' }],
            messages: [{
              from: '5565999990005',
              id: 'wamid.inbound005',
              type: 'text',
              text: { body: 'Oi' },
            }],
          },
        }],
      }],
    };

    const result = provider.parseInbound(payload);

    expect(result!.instancia).toBe('123456789');
  });
});

// ============================================================================
// sendButtons — limites respeitados (regressão)
// ============================================================================

describe('MetaCloudProvider.sendButtons — limites', () => {
  it('trunca a 3 botões no máximo', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.btn001' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    await p.sendButtons('5565999990000', {
      message: 'Escolha:',
      buttons: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D' }, // deve ser descartado
      ],
    });

    const body = http.post.mock.calls[0][1] as {
      interactive: { action: { buttons: unknown[] } };
    };
    expect(body.interactive.action.buttons).toHaveLength(3);
  });

  it('trunca id do botão a 200 chars', async () => {
    const http = makeHttp({ messages: [{ id: 'wamid.btn002' }] });
    const p = new MetaCloudProvider(http as any, CREDS);

    const idLongo = 'y'.repeat(250);
    await p.sendButtons('5565999990000', {
      message: 'Menu',
      buttons: [{ id: idLongo, label: 'Opção' }],
    });

    const body = http.post.mock.calls[0][1] as {
      interactive: { action: { buttons: { reply: { id: string } }[] } };
    };
    expect(body.interactive.action.buttons[0].reply.id.length).toBe(200);
  });
});
