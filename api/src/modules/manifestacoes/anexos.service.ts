import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MediaStorageService } from '../media/media-storage.service';
import { validarUploadSeguro } from '../../common/upload/upload-seguranca.util';

/** import() REAL (ESM) a partir de CJS — para file-type/sharp (ver MediaService). */
const importDinamico = new Function('m', 'return import(m)') as <T = any>(m: string) => Promise<T>;

interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_BYTES = Number(process.env.ANEXO_MAX_BYTES ?? 15 * 1024 * 1024); // 15MB

// Tipos aceitos para anexos do cidadão/órgão (foto, PDF e documentos comuns).
const PERMITIDOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/**
 * Anexos de manifestação (cidadão e órgão). A mídia é SEMPRE RESTRITA: vai ao
 * object storage por caminho não-público e o acesso passa pelo backend (com
 * verificação de protocolo+chave/dono/staff). Imagens têm EXIF/GPS removidos
 * (privacidade). Sem URL pública.
 */
@Injectable()
export class AnexosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
  ) {}

  private async detectarMime(file: UploadFile): Promise<string> {
    try {
      const { fileTypeFromBuffer } = await importDinamico('file-type');
      const ft = await fileTypeFromBuffer(file.buffer);
      if (ft?.mime) return ft.mime;
    } catch {
      /* cai no mimetype declarado */
    }
    return file.mimetype;
  }

  async upload(manifestacaoId: string, file: UploadFile, origem: 'cidadao' | 'orgao') {
    if (!file) throw new BadRequestException('Arquivo ausente.');
    // Bloqueia extensões perigosas/scripts antes de qualquer processamento.
    validarUploadSeguro(file, { maxBytes: MAX_BYTES });

    const mime = await this.detectarMime(file);
    const ext = PERMITIDOS[mime];
    if (!ext) throw new BadRequestException('Tipo de arquivo não permitido (envie imagem, PDF ou documento).');

    // imagem: remove EXIF/GPS aplicando a orientação
    let buffer = file.buffer;
    if (mime.startsWith('image/')) {
      try {
        const sharp = (await importDinamico('sharp')).default;
        buffer = await sharp(buffer, { failOn: 'none' }).rotate().toBuffer();
      } catch {
        /* mantém o buffer original se o sharp falhar */
      }
    }

    const tenantId = TenantContext.tenantId()!;
    const hash = randomBytes(12).toString('hex');
    const storageKey = `restrito/${tenantId}/manifestacao/${manifestacaoId}/${hash}.${ext}`;
    await this.storage.put(storageKey, buffer, mime);

    const anexo = await this.prisma.db.manifestacaoAnexo.create({
      data: {
        tenantId,
        manifestacaoId,
        origem,
        nomeArquivo: (file.originalname || `arquivo.${ext}`).slice(0, 200),
        storageKey,
        mime,
        tamanhoBytes: buffer.length,
      },
    });
    return { id: anexo.id, nomeArquivo: anexo.nomeArquivo, mime, tamanhoBytes: buffer.length };
  }

  async listar(manifestacaoId: string) {
    const rows = await this.prisma.db.manifestacaoAnexo.findMany({
      where: { manifestacaoId },
      orderBy: { criadoEm: 'asc' },
      select: { id: true, nomeArquivo: true, mime: true, origem: true, tamanhoBytes: true, criadoEm: true },
    });
    return rows.map((a) => ({ ...a, tamanhoBytes: Number(a.tamanhoBytes) }));
  }

  /** Stream do anexo. Se `manifestacaoId` for informado, valida o vínculo. */
  async stream(anexoId: string, manifestacaoId?: string) {
    const a = await this.prisma.db.manifestacaoAnexo.findUnique({ where: { id: anexoId } });
    if (!a || (manifestacaoId && a.manifestacaoId !== manifestacaoId)) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    const obj = await this.storage.getStream(a.storageKey);
    return { anexo: a, ...obj };
  }
}
