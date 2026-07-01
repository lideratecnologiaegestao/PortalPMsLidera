import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as forge from 'node-forge';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { cifrar, decifrar } from '../../common/crypto/secret-box.util';

/** Credencial (chave privada + certificado) para assinar/verificar. */
export interface CredencialCertificado {
  key: forge.pki.rsa.PrivateKey;
  cert: forge.pki.Certificate;
  titular: string | null;
}

interface MetaCert {
  titular: string | null;
  emissor: string | null;
  numeroSerie: string | null;
  tipo: string | null;
  validoDe: Date | null;
  validoAte: Date | null;
}

/**
 * Cofre do certificado digital ICP-Brasil A1 POR TENANT.
 *
 * O `.pfx` (base64) e a SENHA são cifrados em repouso (AES-256-GCM via
 * secret-box — chave derivada do AUTH_JWT_SECRET, só no ambiente). A API nunca
 * retorna o binário nem a senha; só metadados (titular, validade). Fornece a
 * credencial decifrada para o SignatureService assinar Diário e certificados.
 *
 * Modelo "por tenant + fallback global": se o tenant não tiver certificado, o
 * assinador cai para o `ICP_CERT_PATH` global do ambiente (se houver).
 */
@Injectable()
export class CertificadoDigitalService {
  private readonly log = new Logger(CertificadoDigitalService.name);
  /** Cache de credencial decifrada por tenant (assinatura é infrequente). */
  private cache = new Map<string, { val: CredencialCertificado | null; exp: number }>();
  private readonly TTL_MS = 300_000;

  constructor(private readonly prisma: PrismaService) {}

  private tenantId(): string {
    const id = TenantContext.tenantId();
    if (!id) throw new BadRequestException('Tenant não resolvido.');
    return id;
  }

  // ─────────────────────────── parse / metadados ──────────────────────────
  /** Abre o .pfx (valida a senha) e devolve chave+cert. Lança 400 se inválido. */
  private parse(pfxBuffer: Buffer, senha: string): {
    key: forge.pki.rsa.PrivateKey;
    cert: forge.pki.Certificate;
    meta: MetaCert;
  } {
    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      const asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
      p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha);
    } catch {
      throw new BadRequestException(
        'Não foi possível abrir o certificado — senha incorreta ou arquivo .pfx inválido.',
      );
    }
    const keyBag =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
      p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
    if (!keyBag?.key || !certBag?.cert) {
      throw new BadRequestException('Certificado sem chave privada ou sem cadeia — verifique o arquivo .pfx.');
    }
    return {
      key: keyBag.key as forge.pki.rsa.PrivateKey,
      cert: certBag.cert,
      meta: this.extrairMeta(certBag.cert),
    };
  }

  private extrairMeta(cert: forge.pki.Certificate): MetaCert {
    const cn = (attrs: any[]): string | null =>
      (attrs.find((a) => a.shortName === 'CN')?.value as string) ?? null;
    const titular = cn(cert.subject.attributes as any[]);
    const emissor = cn(cert.issuer.attributes as any[]);
    const ou = (cert.subject.attributes as any[])
      .filter((a) => a.shortName === 'OU')
      .map((a) => String(a.value).toUpperCase())
      .join(' ');
    const cnUp = (titular ?? '').toUpperCase();
    let tipo = 'ICP-Brasil A1';
    if (/E-?CNPJ/.test(ou) || /:\d{14}\b/.test(cnUp)) tipo = 'e-CNPJ A1';
    else if (/E-?CPF/.test(ou) || /:\d{11}\b/.test(cnUp)) tipo = 'e-CPF A1';
    return {
      titular,
      emissor,
      numeroSerie: cert.serialNumber ?? null,
      tipo,
      validoDe: cert.validity?.notBefore ?? null,
      validoAte: cert.validity?.notAfter ?? null,
    };
  }

  // ─────────────────────────────── CRUD (admin) ───────────────────────────
  /** Importa/atualiza o certificado do tenant. Valida a senha ANTES de gravar. */
  async salvar(pfxBuffer: Buffer, senha: string): Promise<void> {
    if (!pfxBuffer?.length) throw new BadRequestException('Envie o arquivo .pfx no campo "file".');
    if (!senha) throw new BadRequestException('Informe a senha do certificado.');
    const { meta } = this.parse(pfxBuffer, senha); // valida senha + extrai metadados
    const tenantId = this.tenantId();
    const data = {
      pfxCifrado: cifrar(pfxBuffer.toString('base64')),
      senhaCifrada: cifrar(senha),
      titular: meta.titular,
      emissor: meta.emissor,
      numeroSerie: meta.numeroSerie,
      tipo: meta.tipo,
      validoDe: meta.validoDe,
      validoAte: meta.validoAte,
      ativo: true,
    };
    await TenantContext.run({ tenantId }, async () => {
      const atual = await this.prisma.db.tenantCertificadoConfig.findFirst();
      if (atual) {
        await this.prisma.db.tenantCertificadoConfig.update({ where: { tenantId }, data });
      } else {
        await this.prisma.db.tenantCertificadoConfig.create({ data: { tenantId, ...data } });
      }
    });
    this.cache.delete(tenantId);
  }

  /** Status mascarado (nunca revela .pfx/senha). Escopo explícito por tenant. */
  async status() {
    const envGlobalDisponivel = !!process.env.ICP_CERT_PATH;
    // Escopo explícito: em modo plataforma (super_admin no host da plataforma) não
    // há tenant → não devolver a linha "primeira" de um tenant qualquer.
    const tenantId = TenantContext.tenantId();
    if (!tenantId) return { definido: false, envGlobalDisponivel };
    const row = await this.prisma.db.tenantCertificadoConfig.findUnique({ where: { tenantId } });
    if (!row) return { definido: false, envGlobalDisponivel };
    // Health: certificado presente mas ILEGÍVEL (chave de cifra trocada / corrompido).
    let legivel = true;
    try {
      decifrar(row.pfxCifrado);
      decifrar(row.senhaCifrada);
    } catch {
      legivel = false;
    }
    const agora = Date.now();
    const venc = row.validoAte ? row.validoAte.getTime() : null;
    return {
      definido: true,
      ativo: row.ativo,
      legivel,
      titular: row.titular,
      emissor: row.emissor,
      numeroSerie: row.numeroSerie,
      tipo: row.tipo,
      validoDe: row.validoDe,
      validoAte: row.validoAte,
      diasParaVencer: venc != null ? Math.floor((venc - agora) / 86_400_000) : null,
      vencido: venc != null && venc < agora,
      atualizadoEm: row.atualizadoEm,
      envGlobalDisponivel,
    };
  }

  async remover(): Promise<void> {
    const tenantId = this.tenantId();
    await TenantContext.run({ tenantId }, async () => {
      await this.prisma.db.tenantCertificadoConfig.deleteMany({ where: { tenantId } });
    });
    this.cache.delete(tenantId);
  }

  // ───────────────────────── credencial p/ assinatura ─────────────────────
  /** Credencial do tenant CORRENTE (via RLS). null se não houver certificado. */
  credencial(): Promise<CredencialCertificado | null> {
    const id = TenantContext.tenantId();
    if (!id) return Promise.resolve(null);
    return this.credencialDe(id);
  }

  /** Credencial de um tenant específico (cross-tenant, via platform) — validação pública. */
  async credencialDe(tenantId: string): Promise<CredencialCertificado | null> {
    const hit = this.cache.get(tenantId);
    if (hit && hit.exp > Date.now()) return hit.val;

    const row = await this.prisma.platform().tenantCertificadoConfig.findUnique({ where: { tenantId } });
    // Ausência genuína (sem linha / inativo) → cacheia null normalmente.
    if (!row || !row.ativo) {
      this.cache.set(tenantId, { val: null, exp: Date.now() + this.TTL_MS });
      return null;
    }
    // Fail-closed: as colunas do cofre DEVEM estar cifradas (prefixo enc:v1:).
    if (!row.pfxCifrado.startsWith('enc:v1:') || !row.senhaCifrada.startsWith('enc:v1:')) {
      this.log.error(`Certificado do tenant ${tenantId} com colunas não cifradas — ignorado.`);
      return null; // estado anômalo — não cacheia
    }
    try {
      const pfx = Buffer.from(decifrar(row.pfxCifrado), 'base64');
      const { key, cert } = this.parse(pfx, decifrar(row.senhaCifrada));
      const val: CredencialCertificado = { key, cert, titular: row.titular };
      this.cache.set(tenantId, { val, exp: Date.now() + this.TTL_MS });
      return val;
    } catch (e) {
      // Decifragem/parse falhou (chave de cifra trocada / blob corrompido). NÃO
      // cacheia null — assim que a chave for corrigida, a próxima chamada funciona.
      this.log.error(`Certificado do tenant ${tenantId} presente mas ILEGÍVEL: ${(e as Error).message}`);
      return null;
    }
  }
}
