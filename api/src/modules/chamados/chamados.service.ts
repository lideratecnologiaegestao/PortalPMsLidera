import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { StorageService } from '../storage/storage.service';
import { AntivirusService } from '../storage/antivirus.service';
import { stripExif } from './exif.util';
import { signFoto } from './foto-token';

const CATEGORIAS = new Set([
  'buraco_via',
  'terreno_abandonado',
  'animal_abandonado',
  'iluminacao_publica',
  'coleta_lixo',
  'arvore_risco',
  'sinalizacao',
  'outro',
]);
const RAIO_DUP_PADRAO = 30; // metros
const MIME_OK = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface NovoChamado {
  categoria: string;
  descricao: string;
  lat: number;
  lng: number;
  endereco?: string;
  bairro?: string;
  cidadaoId?: string | null;
  anonimo?: boolean;
}

export interface Foto {
  buffer: Buffer;
  mimetype: string;
}

/**
 * Chamados georreferenciados do App do Cidadão (PostGIS). Toda escrita roda no
 * TenantContext (RLS). A georreferência usa geography(Point,4326) — operações
 * geo via SQL bruto (`$queryRaw`), que também passa pelo RLS do PrismaService.
 */
@Injectable()
export class ChamadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly antivirus: AntivirusService,
  ) {}

  async criar(dto: NovoChamado, fotos: Foto[]) {
    if (!CATEGORIAS.has(dto.categoria)) {
      throw new BadRequestException('Categoria inválida.');
    }
    if (!this.coordValida(dto.lat, dto.lng)) {
      throw new BadRequestException('Coordenadas inválidas.');
    }
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não resolvido.');

    // detecta possíveis duplicados (mesma categoria, abertos, no raio)
    const possiveisDuplicados = await this.duplicados(
      dto.categoria,
      dto.lat,
      dto.lng,
      RAIO_DUP_PADRAO,
    );

    const protocolo = `CHM-${new Date().getFullYear()}-${randomUUID().slice(0, 8)}`;

    // DPIA (docs/07-dpia.md): denúncia anônima NÃO vincula identidade, mesmo
    // com login presente. `anonimo: true` força cidadao_id NULL.
    const anonimo = dto.anonimo === true;
    const cidadaoId = anonimo ? null : (dto.cidadaoId ?? null);

    // 1) processa as fotos (EXIF strip + storage) ANTES da transação — I/O de
    //    arquivo não deve manter a transação do banco aberta.
    //    DPIA: remove EXIF (GPS) antes de gravar — a foto não pode vazar a rotina.
    const keys: string[] = [];
    for (const f of fotos) {
      if (!MIME_OK.has(f.mimetype)) continue; // ignora tipo não permitido
      if (!(await this.antivirus.limpo(f.buffer))) {
        throw new BadRequestException('Arquivo reprovado na varredura antivírus.');
      }
      keys.push(await this.storage.put(`chamados/${tenantId}`, stripExif(f.buffer), f.mimetype));
    }

    // 2) ATÔMICO: insere o chamado e as referências de foto na mesma transação.
    const row = await this.prisma.tx(async (tx) => {
      const [r] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO chamados
          (tenant_id, protocolo, cidadao_id, categoria, descricao, geo, endereco, bairro, anonimo)
        VALUES
          (${tenantId}::uuid, ${protocolo}, ${cidadaoId}::uuid,
           ${dto.categoria}::chamado_categoria, ${dto.descricao},
           ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
           ${dto.endereco ?? null}, ${dto.bairro ?? null}, ${anonimo})
        RETURNING id`;
      for (const key of keys) {
        await tx.$executeRaw`
          INSERT INTO chamado_fotos (tenant_id, chamado_id, storage_key, origem)
          VALUES (${tenantId}::uuid, ${r.id}::uuid, ${key}, 'cidadao')`;
      }
      return r;
    });

    return {
      id: row.id,
      protocolo,
      status: 'aberto',
      possiveisDuplicados,
    };
  }

  /**
   * Chamados próximos (visão pública). DPIA (docs/07-dpia.md): NÃO expõe
   * coordenadas exatas, identidade nem descrição completa — só categoria,
   * status, bairro e protocolo. O ponto serve apenas para filtrar o raio.
   */
  async proximos(lat: number, lng: number, raio = 500) {
    if (!this.coordValida(lat, lng)) {
      throw new BadRequestException('Coordenadas inválidas.');
    }
    return this.prisma.db.$queryRaw`
      SELECT protocolo, categoria, status, bairro
      FROM chamados
      WHERE ST_DWithin(geo, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${raio})
        AND status NOT IN ('cancelado', 'duplicado')
      ORDER BY ST_Distance(geo, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) ASC
      LIMIT 200`;
  }

  /**
   * Acompanhamento por protocolo (público). DPIA: NÃO expõe coordenadas exatas
   * nem endereço — só bairro. O protocolo é uma credencial fraca (poderia
   * vazar), então a localização precisa fica fora da resposta pública.
   */
  async porProtocolo(protocolo: string) {
    const [chamado] = await this.prisma.db.$queryRaw<any[]>`
      SELECT id, protocolo, categoria, status, descricao, bairro,
             prioridade, criado_em, resolvido_em
      FROM chamados WHERE protocolo = ${protocolo}`;
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    const atualizacoes = await this.prisma.db.$queryRaw`
      SELECT status, comentario, criado_em
      FROM chamado_atualizacoes WHERE chamado_id = ${chamado.id}::uuid
      ORDER BY criado_em ASC`;

    // fotos por URL ASSINADA (TTL) — nunca expõe a storage_key (DPIA)
    const fotosRows = await this.prisma.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM chamado_fotos WHERE chamado_id = ${chamado.id}::uuid ORDER BY criado_em`;
    const fotos = await Promise.all(
      fotosRows.map(async (f) => ({
        id: f.id,
        url: `/api/chamados/foto/${f.id}?t=${await signFoto(f.id)}`,
      })),
    );

    return { ...chamado, atualizacoes, fotos };
  }

  /**
   * Listagem para o painel da equipe (RLS já limita ao tenant). Diferente da
   * visão pública: a equipe vê endereço/coordenadas e a 1ª foto (miniatura).
   */
  async listarAdmin(p: {
    status?: string;
    categoria?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, p.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, p.pageSize ?? 20));
    const offset = (page - 1) * pageSize;
    const status = p.status && p.status.length ? p.status : null;
    const categoria = p.categoria && p.categoria.length ? p.categoria : null;
    const q = p.q && p.q.trim().length ? `%${p.q.trim()}%` : null;

    const [{ total }] = await this.prisma.db.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total FROM chamados
      WHERE (${status}::text IS NULL OR status::text = ${status})
        AND (${categoria}::text IS NULL OR categoria::text = ${categoria})
        AND (${q}::text IS NULL OR protocolo ILIKE ${q} OR descricao ILIKE ${q} OR bairro ILIKE ${q})`;

    const rows = await this.prisma.db.$queryRaw<any[]>`
      SELECT c.id, c.protocolo, c.categoria::text AS categoria, c.status::text AS status,
             c.descricao, c.bairro, c.endereco, c.prioridade, c.anonimo,
             c.criado_em, c.resolvido_em,
             ST_Y(c.geo::geometry) AS lat, ST_X(c.geo::geometry) AS lng,
             (SELECT count(*)::int FROM chamado_fotos f WHERE f.chamado_id = c.id) AS num_fotos,
             (SELECT f.id FROM chamado_fotos f WHERE f.chamado_id = c.id ORDER BY f.criado_em LIMIT 1) AS foto_id
      FROM chamados c
      WHERE (${status}::text IS NULL OR c.status::text = ${status})
        AND (${categoria}::text IS NULL OR c.categoria::text = ${categoria})
        AND (${q}::text IS NULL OR c.protocolo ILIKE ${q} OR c.descricao ILIKE ${q} OR c.bairro ILIKE ${q})
      ORDER BY c.criado_em DESC
      LIMIT ${pageSize} OFFSET ${offset}`;

    const items = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        fotoUrl: r.foto_id ? `/api/chamados/foto/${r.foto_id}?t=${await signFoto(r.foto_id)}` : null,
      })),
    );
    return { items, total: Number(total), page, pageSize };
  }

  /** Detalhe para a equipe: tudo (endereço, coordenadas, fotos, histórico). */
  async detalheAdmin(id: string) {
    const [chamado] = await this.prisma.db.$queryRaw<any[]>`
      SELECT id, protocolo, categoria::text AS categoria, status::text AS status,
             descricao, bairro, endereco, prioridade, anonimo, criado_em, resolvido_em,
             ST_Y(geo::geometry) AS lat, ST_X(geo::geometry) AS lng
      FROM chamados WHERE id = ${id}::uuid`;
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    const atualizacoes = await this.prisma.db.$queryRaw`
      SELECT status::text AS status, comentario, criado_em
      FROM chamado_atualizacoes WHERE chamado_id = ${id}::uuid
      ORDER BY criado_em ASC`;

    const fotosRows = await this.prisma.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM chamado_fotos WHERE chamado_id = ${id}::uuid ORDER BY criado_em`;
    const fotos = await Promise.all(
      fotosRows.map(async (f) => ({
        id: f.id,
        url: `/api/chamados/foto/${f.id}?t=${await signFoto(f.id)}`,
      })),
    );

    return { ...chamado, atualizacoes, fotos };
  }

  /** Bytes de uma foto (uso do endpoint de serving, validado por token). */
  async serveFoto(fotoId: string): Promise<{ buffer: Buffer; mime: string }> {
    const [foto] = await this.prisma.db.$queryRaw<{ storage_key: string }[]>`
      SELECT storage_key FROM chamado_fotos WHERE id = ${fotoId}::uuid`;
    if (!foto) throw new NotFoundException('Foto não encontrada.');
    return this.storage.get(foto.storage_key);
  }

  /** Equipe atualiza o status do chamado (role interna). */
  async atualizar(id: string, status: string, comentario: string | undefined) {
    const atorId = TenantContext.get().userId ?? null;
    const tenantId = TenantContext.tenantId();

    const updated = await this.prisma.db.$executeRaw`
      UPDATE chamados
        SET status = ${status}::chamado_status,
            resolvido_em = CASE WHEN ${status} = 'resolvido' THEN now() ELSE resolvido_em END
      WHERE id = ${id}::uuid`;
    if (updated === 0) throw new NotFoundException('Chamado não encontrado.');

    await this.prisma.db.$executeRaw`
      INSERT INTO chamado_atualizacoes (tenant_id, chamado_id, status, comentario, ator_id)
      VALUES (${tenantId}::uuid, ${id}::uuid, ${status}::chamado_status, ${comentario ?? null}, ${atorId}::uuid)`;

    return { id, status };
  }

  /**
   * Expurgo/anonimização por retenção (DPIA docs/07-dpia.md). Idempotente.
   * Roda em modo plataforma (cross-tenant) — é manutenção, não fluxo de tenant.
   *   - 90 dias após resolução: desvincula identidade e reduz precisão do geo.
   *   - 180 dias após resolução: remove referências de fotos (storage à parte).
   */
  async expurgar() {
    // 90d: identidade + geo (snap para grade ~1km, remove precisão de rotina)
    const geoIdent = await this.prisma.db.$executeRaw`
      UPDATE chamados
        SET cidadao_id = NULL,
            geo = ST_SnapToGrid(geo::geometry, 0.01)::geography,
            geo_anonimizada = true,
            identidade_desvinculada_em = now()
      WHERE status = 'resolvido'
        AND resolvido_em < now() - interval '90 days'
        AND geo_anonimizada = false`;

    // 180d: remove vínculo das fotos (limpeza do storage é tarefa do storage)
    const fotos = await this.prisma.db.$executeRaw`
      DELETE FROM chamado_fotos
      WHERE chamado_id IN (
        SELECT id FROM chamados
        WHERE status = 'resolvido' AND resolvido_em < now() - interval '180 days'
      )`;

    // marca o flag de conformidade (evita reprocessar e comprova o expurgo)
    await this.prisma.db.$executeRaw`
      UPDATE chamados SET fotos_expurgadas = true
      WHERE status = 'resolvido' AND resolvido_em < now() - interval '180 days'
        AND fotos_expurgadas = false`;

    return { identidadesDesvinculadas: geoIdent, fotosRemovidas: fotos };
  }

  private async duplicados(categoria: string, lat: number, lng: number, raio: number) {
    return this.prisma.db.$queryRaw<{ protocolo: string; distancia_m: number }[]>`
      SELECT protocolo,
             round(ST_Distance(geo, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)::numeric, 1) AS distancia_m
      FROM chamados
      WHERE categoria = ${categoria}::chamado_categoria
        AND status NOT IN ('resolvido', 'cancelado', 'duplicado')
        AND ST_DWithin(geo, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${raio})
      ORDER BY distancia_m ASC LIMIT 5`;
  }

  private coordValida(lat: number, lng: number): boolean {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }
}
