#!/bin/bash
# Semeia a config de e-mail (Hostinger) do tenant exemplolandia, cifrando a senha
# com a MESMA chave do app (AUTH_JWT_SECRET, lido de dentro do container da API).
set -e
PW='L1d3r@t3cn0l0g1@'
BLOB=$(docker exec -e PW="$PW" portal-api node -e 'const c=require("crypto");const k=c.createHash("sha256").update(process.env.AUTH_JWT_SECRET).digest();const iv=c.randomBytes(12);const ci=c.createCipheriv("aes-256-gcm",k,iv);const e=Buffer.concat([ci.update(process.env.PW,"utf8"),ci.final()]);console.log("enc:v1:"+iv.toString("base64")+"."+ci.getAuthTag().toString("base64")+"."+e.toString("base64"))')
docker exec -i portal-postgres psql -U postgres -d portal -v ON_ERROR_STOP=1 <<SQL
INSERT INTO tenant_email_config (tenant_id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, imap_host, imap_port, ativo)
VALUES ((SELECT id FROM tenants WHERE slug='exemplolandia'),
        'smtp.hostinger.com', 465, true, 'prefeitura@lidera.srv.br', '${BLOB}',
        'prefeitura@lidera.srv.br', 'imap.hostinger.com', 993, true)
ON CONFLICT (tenant_id) DO UPDATE SET
  smtp_host=EXCLUDED.smtp_host, smtp_port=EXCLUDED.smtp_port, smtp_secure=EXCLUDED.smtp_secure,
  smtp_user=EXCLUDED.smtp_user, smtp_pass=EXCLUDED.smtp_pass, smtp_from=EXCLUDED.smtp_from,
  imap_host=EXCLUDED.imap_host, imap_port=EXCLUDED.imap_port, ativo=true, atualizado_em=now();
SQL
echo "CONFIG OK"
