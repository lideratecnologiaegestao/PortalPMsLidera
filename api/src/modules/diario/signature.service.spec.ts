import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as forge from 'node-forge';
import { SignatureService } from './signature.service';

// gera um .pfx self-signed (1024 bits só para velocidade do teste)
function gerarPfx(senha: string): string {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2030, 0, 1);
  const attrs = [{ name: 'commonName', value: 'Prefeitura Teste' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, { algorithm: '3des' });
  const der = forge.asn1.toDer(p12).getBytes();
  const path = join(mkdtempSync(join(tmpdir(), 'icp-')), 'cert.pfx');
  writeFileSync(path, Buffer.from(der, 'binary'));
  return path;
}

describe('SignatureService', () => {
  afterEach(() => {
    delete process.env.ICP_CERT_PATH;
    delete process.env.ICP_CERT_PASSWORD;
  });

  it('ICP-Brasil: assina com RSA e verifica com o certificado', () => {
    const senha = 'senha123';
    process.env.ICP_CERT_PATH = gerarPfx(senha);
    process.env.ICP_CERT_PASSWORD = senha;
    const svc = new SignatureService();
    const hash = 'hash-canonico-da-edicao';
    const { assinatura, algoritmo } = svc.assinar(hash);
    expect(algoritmo).toContain('ICP-Brasil');
    expect(svc.conferir(hash, assinatura)).toBe(true);
    expect(svc.conferir('hash-adulterado', assinatura)).toBe(false);
  });

  it('stub HMAC quando não há certificado (dev) — verifica e detecta adulteração', () => {
    process.env.DIARIO_SIGNING_KEY = 'dev-key-com-16-chars-ok';
    const svc = new SignatureService();
    const { assinatura, algoritmo } = svc.assinar('h');
    expect(algoritmo).toContain('DEV');
    expect(svc.conferir('h', assinatura)).toBe(true);
    expect(svc.conferir('x', assinatura)).toBe(false);
  });
});
