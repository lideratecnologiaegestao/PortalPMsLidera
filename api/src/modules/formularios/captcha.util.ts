/**
 * Desafio CAPTCHA stateless, auto-hospedado.
 *
 * Formato do token: base64url(JSON{r, exp}) + '.' + hmacSHA256(payload, SECRET)
 * SECRET = process.env.CAPTCHA_SECRET ?? process.env.AUTH_JWT_SECRET
 * Expiração: 10 minutos.
 * As perguntas são somas simples aleatórias geradas com crypto.randomInt.
 */
import { createHmac } from 'node:crypto';
import { randomInt } from 'node:crypto';

const SECRET = () => process.env.CAPTCHA_SECRET ?? process.env.AUTH_JWT_SECRET ?? 'dev-secret';
const TTL_MS = 10 * 60 * 1000; // 10 min

interface Payload {
  r: number;   // resposta correta
  exp: number; // epoch ms de expiração
}

function toBase64Url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

function hmac(data: string): string {
  return createHmac('sha256', SECRET()).update(data).digest('hex');
}

/** Gera um novo desafio de soma simples. */
export function gerarDesafio(): { token: string; pergunta: string } {
  const a = randomInt(1, 20);
  const b = randomInt(1, 20);
  const r = a + b;
  const exp = Date.now() + TTL_MS;
  const payload = toBase64Url(JSON.stringify({ r, exp } satisfies Payload));
  const sig = hmac(payload);
  return {
    token: `${payload}.${sig}`,
    pergunta: `Quanto é ${a} + ${b}?`,
  };
}

/**
 * Valida token + resposta do usuário.
 * Retorna false se assinatura inválida, expirado ou resposta errada.
 */
export function validarCaptcha(token: string, resposta: string | number): boolean {
  try {
    const dot = token.lastIndexOf('.');
    if (dot < 1) return false;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    // verificar assinatura
    const expectedSig = hmac(payload);
    if (sig !== expectedSig) return false;

    const data: Payload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    // verificar expiração
    if (Date.now() > data.exp) return false;

    // verificar resposta
    const respostaNum = typeof resposta === 'number' ? resposta : parseInt(String(resposta).trim(), 10);
    if (isNaN(respostaNum)) return false;
    return respostaNum === data.r;
  } catch {
    return false;
  }
}
