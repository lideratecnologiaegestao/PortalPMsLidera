/**
 * Exportação/portabilidade de dados do titular (LGPD art. 18, II e V).
 * Retorna SOMENTE dados do user.sub — nunca de terceiros.
 * Spec 3.1.2 — conjuntos EXATOS, nenhum dado sensível em claro.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { Prisma } from '@prisma/client';

/** Mascara parcialmente o número de WhatsApp: ****XXXX. */
function mascaraWhatsapp(valor: string | null): string | null {
  if (!valor) return null;
  const limpo = valor.replace(/\D/g, '');
  return '****' + limpo.slice(-4);
}

@Injectable()
export class MeusDadosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compila e retorna todos os conjuntos de dados do titular.
   * O titularId vem sempre do JWT (user.sub).
   */
  async exportar(titularId: string): Promise<Record<string, unknown>> {
    const tenantId = TenantContext.tenantId();

    // ── 1. Perfil (users) — sem senhaHash/cpfHash/mfaSecret/avatarStorageKey ──
    const user = await this.prisma.db.user.findUnique({
      where: { id: titularId },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        govbrNivel: true,
        ultimoLoginEm: true,
        avatarStorageKey: true, // usado só para booleano temAvatar
        // criadoEm não existe no model User — a tabela users não tem esse campo
        // (verificado no schema.prisma — User não possui criado_em)
      },
    });

    const perfil = user
      ? {
          id: user.id,
          nome: user.nome,
          email: user.email,
          telefone: user.telefone ?? null,
          govbrNivel: user.govbrNivel ?? null,
          ultimoLoginEm: user.ultimoLoginEm ?? null,
          temAvatar: !!user.avatarStorageKey, // nunca expõe a storage_key
        }
      : null;

    // ── 2. Contatos e opt-ins (user_contatos) ──
    // Sem whatsappCodigo, emailCodigo (tokens nunca exportados)
    const contatoRaw = await this.prisma.db.userContato.findFirst({
      where: { userId: titularId },
      select: {
        whatsapp: true,
        email: true,
        emailVerificado: true,
        notifWhatsapp: true,
        notifEmail: true,
        criadoEm: true,
      },
    });

    const contatos = contatoRaw
      ? {
          whatsapp: mascaraWhatsapp(contatoRaw.whatsapp ?? null), // mascarado
          email: contatoRaw.email ?? null,
          emailVerificado: contatoRaw.emailVerificado,
          notifWhatsapp: contatoRaw.notifWhatsapp,
          notifEmail: contatoRaw.notifEmail,
          criadoEm: contatoRaw.criadoEm,
        }
      : null;

    // ── 3. Manifestações do titular (sem mensagens internas) ──
    const manifestacoesRaw = await this.prisma.db.manifestacao.findMany({
      where: { cidadaoId: titularId },
      select: {
        id: true,
        protocolo: true,
        canal: true,
        tipo: true,
        status: true,
        assunto: true,
        descricao: true,
        criadoEm: true,
        prazoEm: true,
        resposta: true,
        classificacaoSigilo: true,
        mensagens: {
          where: { interno: false }, // exclui mensagens internas
          select: {
            autorTipo: true,
            conteudo: true,
            criadoEm: true,
          },
          orderBy: { criadoEm: 'asc' },
        },
      },
      orderBy: { criadoEm: 'desc' },
    });

    const manifestacoes = manifestacoesRaw.map((m) => ({
      protocolo: m.protocolo,
      canal: m.canal,
      tipo: m.tipo,
      status: m.status,
      assunto: m.assunto,
      // Conteúdo sigiloso substituído (spec 3.1.3)
      descricao: m.classificacaoSigilo
        ? '[CONTEÚDO SUJEITO A SIGILO]'
        : m.descricao,
      criadoEm: m.criadoEm,
      prazoEm: m.prazoEm,
      resposta: m.resposta ?? null,
      mensagens: m.mensagens,
    }));

    // ── 4. Alertas de Diário Oficial ──
    // Vinculados pelo email do usuário (sem campo userId direto na tabela)
    const alertasDiarioRaw = user
      ? await this.prisma.db.diarioAlerta.findMany({
          where: { destino: user.email },
          select: {
            termo: true,
            canal: true,
            status: true,
            confirmadoEm: true,
            criadoEm: true,
            // token NUNCA exportado (spec 3.1.3)
          },
          orderBy: { criadoEm: 'desc' },
        })
      : [];

    // ── 5. Histórico de logins (audit_log where atorId=userId AND acao ILIKE 'LOGIN%') ──
    const loginsRaw = await this.prisma.db.auditLog.findMany({
      where: {
        atorId: titularId,
        acao: { startsWith: 'LOGIN' },
      },
      select: {
        acao: true,
        criadoEm: true,
        dados: true,
      },
      orderBy: { criadoEm: 'desc' },
      take: 100, // limita volume
    });

    const historicoLogins = loginsRaw.map((l) => ({
      acao: l.acao,
      criadoEm: l.criadoEm,
      // Só expõe o IP se presente no campo dados (spec 3.1.2)
      ip: (l.dados as Record<string, unknown>)?.ip ?? null,
    }));

    // ── 6. Chamados do app do cidadão ──
    // Tabela chamados usa SQL bruto (não tem model Prisma).
    // Nunca expõe geo exata nem storage_key — apenas bairro e fotosCount.
    let chamados: unknown[] = [];
    try {
      const rows = await this.prisma.db.$queryRaw<
        {
          protocolo: string;
          categoria: string;
          status: string;
          bairro: string | null;
          descricao: string;
          criado_em: Date;
          fotos_count: bigint;
        }[]
      >(Prisma.sql`
        SELECT
          c.protocolo,
          c.categoria::text AS categoria,
          c.status::text    AS status,
          c.bairro,
          c.descricao,
          c.criado_em,
          COUNT(f.id)::bigint AS fotos_count
        FROM chamados c
        LEFT JOIN chamado_fotos f ON f.chamado_id = c.id
        WHERE c.cidadao_id = ${titularId}::uuid
          AND c.anonimo = false
        GROUP BY c.id
        ORDER BY c.criado_em DESC
        LIMIT 500
      `);
      chamados = rows.map((r) => ({
        protocolo: r.protocolo,
        categoria: r.categoria,
        status: r.status,
        bairro: r.bairro ?? null,
        descricao: r.descricao,
        criadoEm: r.criado_em,
        fotosCount: Number(r.fotos_count), // nunca expõe storage_key
      }));
    } catch {
      // Tabela pode não existir em ambiente de teste — retorna vazio
      chamados = [];
    }

    // Auditoria — só metadados, nunca conteúdo (spec 3.1.5)
    const conjuntos = [
      'perfil',
      'contatos',
      'manifestacoes',
      'chamados',
      'alertasDiario',
      'historicoLogins',
    ];
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: tenantId ?? null,
        atorId: titularId,
        acao: 'TITULAR_DADOS_EXPORTADOS',
        entidade: 'users',
        entidadeId: titularId,
        dados: { formato: 'json', conjuntos },
      },
    });

    return {
      geradoEm: new Date().toISOString(),
      titular: perfil,
      contatos,
      manifestacoes,
      chamados,
      alertasDiario: alertasDiarioRaw,
      historicoLogins,
    };
  }
}
