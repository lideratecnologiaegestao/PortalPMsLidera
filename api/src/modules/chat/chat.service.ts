import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MediaStorageService } from '../media/media-storage.service';
import { ChatGateway } from './chat.gateway';

const importDinamico = new Function('m', 'return import(m)') as <T = any>(m: string) => Promise<T>;
const MAX_BYTES = 15 * 1024 * 1024;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

interface UploadFile { originalname: string; mimetype: string; size: number; buffer: Buffer }
interface AnexoRec { key: string; nome: string; mime: string; tamanho: number }

/**
 * Chat interno (funcionários). RLS isola por tenant; a visibilidade é restrita
 * aos PARTICIPANTES da conversa. Anexos/avatares vão ao storage como restritos
 * e são servidos pelo backend. A entrega em tempo real usa o ChatGateway.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
    private readonly gateway: ChatGateway,
  ) {}

  private me(): string {
    const id = TenantContext.get().userId;
    if (!id) throw new ForbiddenException('Autenticação necessária.');
    return id;
  }
  private tenant(): string {
    return TenantContext.tenantId()!;
  }

  /** Garante que o usuário atual participa da conversa. */
  private async exigirParticipante(conversaId: string): Promise<void> {
    const p = await this.prisma.db.chatParticipante.findFirst({
      where: { conversaId, userId: this.me() },
      select: { id: true },
    });
    if (!p) throw new ForbiddenException('Você não participa desta conversa.');
  }

  private avatarUrl(u: { id: string; avatarStorageKey: string | null }): string | null {
    return u.avatarStorageKey ? `/api/chat/avatar/${u.id}` : null;
  }

  // ----------------------------------------------------------- usuários
  async usuariosInternos(q?: string) {
    const rows = await this.prisma.db.user.findMany({
      where: {
        ativo: true,
        role: { not: 'cidadao' as any },
        ...(q ? { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      select: { id: true, nome: true, role: true, avatarStorageKey: true },
      orderBy: { nome: 'asc' },
      take: 50,
    });
    const online = this.gateway.online();
    return rows.map((u) => ({
      id: u.id, nome: u.nome, role: u.role,
      avatar: this.avatarUrl(u), online: online.has(u.id),
    }));
  }

  // ---------------------------------------------------------- conversas
  async listarConversas() {
    const me = this.me();
    const parts = await this.prisma.db.chatParticipante.findMany({
      where: { userId: me },
      select: { conversaId: true, ultimoLidoEm: true },
    });
    const ids = parts.map((p) => p.conversaId);
    if (!ids.length) return [];
    const lidoMap = new Map(parts.map((p) => [p.conversaId, p.ultimoLidoEm]));

    const conversas = await this.prisma.db.chatConversa.findMany({
      where: { id: { in: ids } },
      orderBy: { atualizadoEm: 'desc' },
      include: { participantes: true },
    });

    // últimas mensagens + nomes/avatars dos participantes
    const userIds = [...new Set(conversas.flatMap((c) => c.participantes.map((p) => p.userId)))];
    const users = await this.prisma.db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nome: true, avatarStorageKey: true },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));
    const online = this.gateway.online();

    const out: any[] = [];
    for (const c of conversas) {
      const lido = lidoMap.get(c.id);
      const [ultima, naoLidas] = await Promise.all([
        this.prisma.db.chatMensagem.findFirst({
          where: { conversaId: c.id }, orderBy: { criadoEm: 'desc' },
          select: { conteudo: true, criadoEm: true, autorId: true, anexos: true, excluidoEm: true },
        }),
        this.prisma.db.chatMensagem.count({
          where: { conversaId: c.id, autorId: { not: me }, ...(lido ? { criadoEm: { gt: lido } } : {}) },
        }),
      ]);
      const outros = c.participantes.filter((p) => p.userId !== me).map((p) => uMap.get(p.userId)).filter(Boolean) as any[];
      let titulo = c.titulo;
      if (c.tipo === 'dm') titulo = outros[0]?.nome ?? 'Conversa';
      out.push({
        id: c.id, tipo: c.tipo, titulo, manifestacaoId: c.manifestacaoId,
        avatar: c.tipo === 'dm' && outros[0] ? this.avatarUrl(outros[0]) : null,
        online: c.tipo === 'dm' && outros[0] ? online.has(outros[0].id) : false,
        ultimaMensagem: ultima
          ? { texto: ultima.excluidoEm ? 'mensagem removida' : (ultima.conteudo || ((ultima.anexos as any[])?.length ? '📎 anexo' : '')), em: ultima.criadoEm }
          : null,
        naoLidas, atualizadoEm: c.atualizadoEm,
      });
    }
    return out;
  }

  async criarConversa(dto: { tipo: 'dm' | 'grupo'; titulo?: string; participantes: string[] }) {
    const me = this.me();
    const tenantId = this.tenant();
    const outros = (dto.participantes ?? []).filter((id) => id !== me);
    if (!outros.length) throw new BadRequestException('Selecione ao menos um participante.');

    if (dto.tipo === 'dm') {
      const outro = outros[0];
      // dedupe: já existe uma DM entre os dois?
      const existentes = await this.prisma.db.chatParticipante.findMany({
        where: { userId: me, conversa: { tipo: 'dm' } }, select: { conversaId: true },
      });
      for (const e of existentes) {
        const tem = await this.prisma.db.chatParticipante.findFirst({ where: { conversaId: e.conversaId, userId: outro }, select: { id: true } });
        if (tem) return { id: e.conversaId };
      }
      const conv = await this.prisma.db.chatConversa.create({
        data: { tenantId, tipo: 'dm', criadoPor: me,
          participantes: { create: [{ tenantId, userId: me, papel: 'membro' }, { tenantId, userId: outro, papel: 'membro' }] } },
      });
      return { id: conv.id };
    }

    const membros = [...new Set([me, ...outros])];
    const conv = await this.prisma.db.chatConversa.create({
      data: {
        tenantId, tipo: 'grupo', titulo: dto.titulo?.trim() || 'Grupo', criadoPor: me,
        participantes: { create: membros.map((u) => ({ tenantId, userId: u, papel: u === me ? 'admin' : 'membro' })) },
      },
    });
    return { id: conv.id };
  }

  /** Cria/abre a conversa interna vinculada a um protocolo (e-SIC/ouvidoria). */
  async conversaDeProtocolo(manifestacaoId: string) {
    const me = this.me();
    const tenantId = this.tenant();
    const m = await this.prisma.db.manifestacao.findUnique({
      where: { id: manifestacaoId }, select: { protocolo: true, responsavelId: true },
    });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    let conv = await this.prisma.db.chatConversa.findFirst({ where: { manifestacaoId, tipo: 'protocolo' } });
    if (!conv) {
      const membros = [...new Set([me, ...(m.responsavelId ? [m.responsavelId] : [])])];
      conv = await this.prisma.db.chatConversa.create({
        data: {
          tenantId, tipo: 'protocolo', titulo: `Protocolo ${m.protocolo}`, manifestacaoId, criadoPor: me,
          participantes: { create: membros.map((u) => ({ tenantId, userId: u, papel: u === me ? 'admin' : 'membro' })) },
        },
      });
    } else {
      await this.exigirParticipante(conv.id);
    }
    return { id: conv.id, titulo: conv.titulo };
  }

  // ----------------------------------------------------------- mensagens
  async historico(conversaId: string, before?: string, limit = 30) {
    await this.exigirParticipante(conversaId);
    const msgs = await this.prisma.db.chatMensagem.findMany({
      where: { conversaId, ...(before ? { criadoEm: { lt: new Date(before) } } : {}) },
      orderBy: { criadoEm: 'desc' },
      take: Math.min(50, limit),
    });
    const autorIds = [...new Set(msgs.map((m) => m.autorId).filter(Boolean) as string[])];
    const autores = await this.prisma.db.user.findMany({
      where: { id: { in: autorIds } }, select: { id: true, nome: true, avatarStorageKey: true },
    });
    const aMap = new Map(autores.map((a) => [a.id, a]));
    return msgs.reverse().map((m) => this.toDto(m, aMap));
  }

  private toDto(m: any, aMap: Map<string, any>) {
    const autor = m.autorId ? aMap.get(m.autorId) : null;
    return {
      id: m.id, conversaId: m.conversaId, autorId: m.autorId,
      autorNome: autor?.nome ?? 'Usuário', autorAvatar: autor ? this.avatarUrl(autor) : null,
      conteudo: m.excluidoEm ? null : m.conteudo,
      excluido: !!m.excluidoEm, editado: !!m.editadoEm,
      respondendoA: m.respondendoA,
      anexos: m.excluidoEm ? [] : (m.anexos as unknown as AnexoRec[]).map((a, idx) => ({ nome: a.nome, mime: a.mime, idx })),
      criadoEm: m.criadoEm,
    };
  }

  async enviar(conversaId: string, dto: { conteudo?: string; respondendoA?: string }) {
    await this.exigirParticipante(conversaId);
    const conteudo = (dto.conteudo ?? '').trim();
    if (!conteudo) throw new BadRequestException('Mensagem vazia.');
    return this.persistir(conversaId, conteudo, [], dto.respondendoA);
  }

  async enviarComAnexo(conversaId: string, file: UploadFile, conteudo?: string) {
    await this.exigirParticipante(conversaId);
    if (!file) throw new BadRequestException('Arquivo ausente.');
    if (file.size > MAX_BYTES) throw new BadRequestException('Arquivo excede 15 MB.');
    let mime = file.mimetype;
    try {
      const { fileTypeFromBuffer } = await importDinamico('file-type');
      const ft = await fileTypeFromBuffer(file.buffer);
      if (ft?.mime) mime = ft.mime;
    } catch { /* usa o declarado */ }
    const ext = EXT[mime];
    if (!ext) throw new BadRequestException('Tipo não permitido (imagem, PDF ou documento).');

    let buffer = file.buffer;
    if (mime.startsWith('image/')) {
      try { const sharp = (await importDinamico('sharp')).default; buffer = await sharp(buffer, { failOn: 'none' }).rotate().toBuffer(); } catch { /* */ }
    }
    const key = `restrito/${this.tenant()}/chat/${conversaId}/${randomBytes(10).toString('hex')}.${ext}`;
    await this.storage.put(key, buffer, mime);
    const anexo: AnexoRec = { key, nome: (file.originalname || `arquivo.${ext}`).slice(0, 200), mime, tamanho: buffer.length };
    return this.persistir(conversaId, (conteudo ?? '').trim(), [anexo]);
  }

  private async persistir(conversaId: string, conteudo: string, anexos: AnexoRec[], respondendoA?: string) {
    const me = this.me();
    const msg = await this.prisma.db.chatMensagem.create({
      data: { tenantId: this.tenant(), conversaId, autorId: me, conteudo: conteudo || null, anexos: anexos as any, respondendoA: respondendoA ?? null },
    });
    await this.prisma.db.chatConversa.update({ where: { id: conversaId }, data: { atualizadoEm: new Date() } });
    // marca como lido para o autor
    await this.prisma.db.chatParticipante.updateMany({ where: { conversaId, userId: me }, data: { ultimoLidoEm: new Date() } });

    const autor = await this.prisma.db.user.findUnique({ where: { id: me }, select: { id: true, nome: true, avatarStorageKey: true } });
    const dto = this.toDto(msg, new Map([[me, autor]]));
    this.gateway.emitirConversa(conversaId, 'mensagem', dto);
    return dto;
  }

  async baixarAnexo(mensagemId: string, idx: number) {
    const m = await this.prisma.db.chatMensagem.findUnique({ where: { id: mensagemId } });
    if (!m) throw new NotFoundException();
    await this.exigirParticipante(m.conversaId);
    const anexo = (m.anexos as unknown as AnexoRec[])[idx];
    if (!anexo) throw new NotFoundException();
    const obj = await this.storage.getStream(anexo.key);
    return { anexo, ...obj };
  }

  async marcarLido(conversaId: string) {
    await this.exigirParticipante(conversaId);
    const em = new Date();
    await this.prisma.db.chatParticipante.updateMany({ where: { conversaId, userId: this.me() }, data: { ultimoLidoEm: em } });
    this.gateway.emitirConversa(conversaId, 'lido', { conversaId, userId: this.me(), em });
    return { ok: true };
  }

  async editar(mensagemId: string, conteudo: string) {
    const m = await this.prisma.db.chatMensagem.findUnique({ where: { id: mensagemId } });
    if (!m || m.autorId !== this.me()) throw new ForbiddenException();
    const upd = await this.prisma.db.chatMensagem.update({ where: { id: mensagemId }, data: { conteudo: conteudo.trim(), editadoEm: new Date() } });
    const autor = await this.prisma.db.user.findUnique({ where: { id: this.me() }, select: { id: true, nome: true, avatarStorageKey: true } });
    const dto = this.toDto(upd, new Map([[this.me(), autor]]));
    this.gateway.emitirConversa(m.conversaId, 'editada', dto);
    return dto;
  }

  async excluir(mensagemId: string) {
    const m = await this.prisma.db.chatMensagem.findUnique({ where: { id: mensagemId } });
    if (!m || m.autorId !== this.me()) throw new ForbiddenException();
    await this.prisma.db.chatMensagem.update({ where: { id: mensagemId }, data: { excluidoEm: new Date(), conteudo: null, anexos: [] } });
    this.gateway.emitirConversa(m.conversaId, 'excluida', { id: mensagemId, conversaId: m.conversaId });
    return { ok: true };
  }

  // ----------------------------------------------------------- avatar
  async definirAvatar(file: UploadFile) {
    if (!file) throw new BadRequestException('Arquivo ausente.');
    let mime = file.mimetype;
    try { const { fileTypeFromBuffer } = await importDinamico('file-type'); const ft = await fileTypeFromBuffer(file.buffer); if (ft?.mime) mime = ft.mime; } catch { /* */ }
    if (!mime.startsWith('image/')) throw new BadRequestException('Envie uma imagem.');
    const sharp = (await importDinamico('sharp')).default;
    const buffer = await sharp(file.buffer, { failOn: 'none' }).rotate().resize(256, 256, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
    const key = `restrito/${this.tenant()}/avatar/${this.me()}.jpg`;
    await this.storage.put(key, buffer, 'image/jpeg');
    await this.prisma.db.user.update({ where: { id: this.me() }, data: { avatarStorageKey: key, avatarMime: 'image/jpeg' } });
    return { ok: true, avatar: `/api/chat/avatar/${this.me()}` };
  }

  async avatarStream(userId: string) {
    const u = await this.prisma.db.user.findUnique({ where: { id: userId }, select: { avatarStorageKey: true, avatarMime: true } });
    if (!u?.avatarStorageKey) throw new NotFoundException();
    const obj = await this.storage.getStream(u.avatarStorageKey);
    return { mime: u.avatarMime ?? 'image/jpeg', ...obj };
  }
}
