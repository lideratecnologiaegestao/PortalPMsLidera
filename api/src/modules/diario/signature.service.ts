import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as forge from 'node-forge';

export interface Assinatura {
  assinatura: string;
  algoritmo: string;
  carimboTempo: Date;
}

/**
 * Assinatura digital + carimbo de tempo do Diário Oficial.
 *
 * - Se `ICP_CERT_PATH` (um .pfx/.p12 ICP-Brasil A1) estiver configurado, assina
 *   o hash com a chave privada do certificado (RSA-SHA256) — assinatura real.
 *   O certificado e o carimbo de tempo de uma ACT credenciada são o que dá
 *   validade jurídica plena (obtenção do certificado é externa, junto a uma AC).
 * - Caso contrário, usa um stub HMAC SEM validade jurídica (apenas dev) — e em
 *   produção o `assinar()` é bloqueado.
 */
@Injectable()
export class SignatureService {
  private icpCache: { key: forge.pki.rsa.PrivateKey; cert: forge.pki.Certificate } | null = null;

  private get icpConfigurado(): boolean {
    return !!process.env.ICP_CERT_PATH;
  }

  private carregarIcp() {
    if (this.icpCache) return this.icpCache;
    const der = readFileSync(process.env.ICP_CERT_PATH as string, 'binary');
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(der),
      process.env.ICP_CERT_PASSWORD ?? '',
    );
    const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ]?.[0];
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ]?.[0];
    if (!keyBag?.key || !certBag?.cert) {
      throw new ServiceUnavailableException('Certificado ICP-Brasil inválido.');
    }
    this.icpCache = {
      key: keyBag.key as forge.pki.rsa.PrivateKey,
      cert: certBag.cert,
    };
    return this.icpCache;
  }

  assinar(hash: string): Assinatura {
    if (this.icpConfigurado) {
      const { key } = this.carregarIcp();
      const md = forge.md.sha256.create();
      md.update(hash, 'utf8');
      return {
        assinatura: forge.util.encode64(key.sign(md)),
        algoritmo: 'SHA256withRSA (ICP-Brasil A1)',
        carimboTempo: new Date(),
      };
    }
    // STUB de desenvolvimento — sem validade jurídica.
    const assinatura = createHmac('sha256', this.chaveDev()).update(hash).digest('hex');
    return {
      assinatura,
      algoritmo: 'HMAC-SHA256 (DEV — sem validade jurídica)',
      carimboTempo: new Date(),
    };
  }

  /** Confere a assinatura (RSA com ICP, ou HMAC timing-safe no stub). */
  conferir(hash: string, assinatura: string): boolean {
    try {
      if (this.icpConfigurado) {
        const { cert } = this.carregarIcp();
        const md = forge.md.sha256.create();
        md.update(hash, 'utf8');
        return (cert.publicKey as forge.pki.rsa.PublicKey).verify(
          md.digest().bytes(),
          forge.util.decode64(assinatura ?? ''),
        );
      }
      const esperada = createHmac('sha256', this.chaveDev()).update(hash).digest('hex');
      const a = Buffer.from(esperada, 'hex');
      const b = Buffer.from(assinatura ?? '', 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private chaveDev(): string {
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'Assinatura do Diário não configurada (ICP_CERT_PATH ausente). Não é possível publicar.',
      );
    }
    const k = process.env.DIARIO_SIGNING_KEY;
    if (!k || k.length < 16) {
      throw new ServiceUnavailableException('DIARIO_SIGNING_KEY ausente/fraca.');
    }
    return k;
  }
}
