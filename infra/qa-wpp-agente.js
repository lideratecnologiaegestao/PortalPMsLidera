// QA: simula o ouvidor enviando comandos pelo WhatsApp (webhook Evolution),
// assinando o HMAC do MESMO jeito que o controller (Buffer.from(JSON.stringify(body))).
const crypto = require('crypto');
const http = require('http');
const secret = process.env.EVOLUTION_WEBHOOK_SECRET || process.env.AUTH_JWT_SECRET;
const NUM = process.env.QA_NUM || '5565999990000';

function post(txt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      event: 'messages.upsert',
      data: { key: { remoteJid: NUM + '@s.whatsapp.net' }, message: { conversation: txt } },
    });
    const sig = crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 3001,
        path: '/api/webhook/evolution/exemplo-test',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: 'exemplolandia.lidera.app.br',
          'x-forwarded-host': 'exemplolandia.lidera.app.br',
          'x-evolution-signature': sig,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => resolve(r.statusCode + ' ' + d));
      },
    );
    req.on('error', (e) => resolve('ERR ' + e.message));
    req.write(body);
    req.end();
  });
}

(async () => {
  for (const t of process.argv.slice(2)) {
    console.log('>> ' + t + '  =>  ' + (await post(t)));
    await new Promise((r) => setTimeout(r, 1500));
  }
})();
