import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  JOB_NOTIF_EMAIL_RAW,
  JOB_SLA_ALERTA,
  JOB_SLA_VENCIDO,
  QUEUE_NOTIFICACOES,
  QUEUE_SLA,
} from '../queue/queue.constants';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { createHash, randomInt } from 'crypto';
import { Canal, Evento, SlaJobData, Status, Tipo } from './manifestacao.types';
import { eventosValidos, transicionar } from './state-machine';
import {
  calcularPrazo,
  instanteAlerta,
  prazoAposPausa,
  prazoPadrao,
} from './sla';

// Alfabeto sem caracteres ambíguos (I, O, 0, 1) p/ a chave de acompanhamento.
const ALFA_CHAVE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface RegistrarDto {
  canal: Canal;
  tipo: Tipo;
  assunto: string;
  descricao: string;
  anonima?: boolean;
  solicitanteNome?: string;
  solicitanteEmail?: string;
  cidadaoId?: string;
}

@Injectable()
export class ManifestacoesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_SLA) private readonly slaQueue: Queue<SlaJobData>,
    @InjectQueue(QUEUE_NOTIFICACOES) private readonly notifQueue: Queue,
    private readonly notificacoes: NotificacoesService,
  ) {}

  // --------------------------------------------------------- recuperar protocolos
  /**
   * LGPD: envia a lista de protocolos vinculados ao e-mail para o próprio titular,
   * nunca exibe na resposta HTTP. Resposta SEMPRE genérica (sem revelar existência).
   * Auditado sem PII (apenas qtd).
   *
   * Usa dbPublica() pois o cidadão não tem papel de staff — o GUC público permite
   * a leitura por tenant (isolamento de tenant mantido).
   */
  async recuperarProtocolos(email: string): Promise<{ ok: boolean; mensagem: string }> {
    const MENSAGEM_GENERICA =
      'Se houver manifestações vinculadas a este e-mail, você receberá a lista em instantes.';

    const tenantId = TenantContext.tenantId()!;

    // Busca as últimas 200 manifestações não-anônimas do tenant onde o e-mail coincide.
    // dbPublica(): GUC app.public_ouvidoria='on' — permite SELECT sem papel de staff.
    const manifestacoes = await this.prisma.dbPublica().manifestacao.findMany({
      where: {
        anonima: false,
        solicitanteEmail: { equals: email, mode: 'insensitive' },
      },
      orderBy: { criadoEm: 'desc' },
      take: 200,
      select: {
        protocolo: true,
        assunto: true,
        tipo: true,
        status: true,
        criadoEm: true,
      },
    });

    // Auditoria sem PII: registra apenas a quantidade encontrada.
    await this.prisma.db.auditLog
      .create({
        data: {
          tenantId,
          atorId: null,
          acao: 'RECUPERACAO_PROTOCOLO_SOLICITADA',
          entidade: 'manifestacoes',
          entidadeId: null,
          dados: { qtd: manifestacoes.length },
        },
      })
      .catch(() => undefined); // auditoria best-effort; não bloqueia a resposta

    if (manifestacoes.length === 0) {
      // Resposta genérica mesmo quando não há resultado (evita enumeração).
      return { ok: true, mensagem: MENSAGEM_GENERICA };
    }

    // Obtém o nome do portal para o assunto do e-mail.
    const tenant = await this.prisma
      .platform()
      .tenant.findUnique({ where: { id: tenantId }, select: { nome: true } });
    const portal = tenant?.nome ?? 'Portal do Cidadão';

    // Monta o corpo do e-mail com a lista de protocolos.
    const linhas = manifestacoes.map((m) => {
      const data = m.criadoEm.toLocaleDateString('pt-BR');
      return `• Protocolo: ${m.protocolo} | Assunto: ${m.assunto} | Tipo: ${m.tipo} | Status: ${m.status} | Aberto em: ${data}`;
    });
    const corpo = [
      `Olá,`,
      ``,
      `Você solicitou a recuperação dos protocolos de manifestações vinculados ao seu e-mail.`,
      ``,
      `Encontramos ${manifestacoes.length} manifestação(ões):`,
      ``,
      ...linhas,
      ``,
      `Para acompanhar sua manifestação, acesse a opção "Acompanhar" no portal e informe o número do protocolo.`,
      ``,
      `Esta mensagem foi gerada automaticamente. Não responda.`,
    ].join('\n');

    // Enfileira o e-mail de forma assíncrona (best-effort).
    await this.notifQueue
      .add(
        JOB_NOTIF_EMAIL_RAW,
        {
          tenantId,
          assunto: `Seus protocolos - ${portal}`,
          destinatarios: [email],
          cc: [],
          bcc: [],
          corpo,
          anexos: [],
        },
        {
          jobId: `recuperar-protocolos-${tenantId}-${Buffer.from(email.toLowerCase()).toString('base64url').slice(0, 16)}-${Date.now()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      )
      .catch(() => undefined); // não expõe falha de SMTP ao cidadão

    return { ok: true, mensagem: MENSAGEM_GENERICA };
  }

  // ----------------------------------------------------------------- registro
  async registrar(dto: RegistrarDto) {
    // LAI exige identificação no e-SIC: só cidadão logado (cidadaoId vem do
    // token, nunca do body). Anonimato é permitido apenas na Ouvidoria.
    if (dto.canal === 'esic' && !dto.cidadaoId) {
      throw new BadRequestException(
        'Pedidos de acesso à informação (e-SIC) exigem identificação. Faça login com o gov.br.',
      );
    }
    const anonima = dto.canal === 'esic' ? false : dto.anonima ?? false;

    const agora = new Date();
    const config = prazoPadrao(dto.canal, dto.tipo);
    const prazoEm = calcularPrazo(agora, config); // feriados: injetar do tenant em prod
    const protocolo = await this.gerarProtocolo();

    // Chave de acompanhamento: mostrada uma vez ao cidadão, guardada só como hash.
    const chave = this.gerarChave();
    const chaveHash = createHash('sha256')
      .update(chave.replace(/-/g, ''))
      .digest('hex');

    const tenantId = TenantContext.tenantId()!;
    // ATÔMICO: cria a manifestação e seu evento inicial na mesma transação.
    // txPublicaOuvidoria(): ativa GUC app.public_ouvidoria='on' para que o
    // RETURNING implícito do CREATE e o INSERT do evento não sejam bloqueados
    // pelo RLS de papel (cidadão não tem role de staff). Tenant permanece filtrado.
    const m = await this.prisma.txPublicaOuvidoria(async (tx) => {
      const created = await tx.manifestacao.create({
        data: {
          tenantId,
          protocolo,
          canal: dto.canal,
          tipo: dto.tipo,
          assunto: dto.assunto,
          descricao: dto.descricao,
          anonima,
          solicitanteNome: anonima ? null : dto.solicitanteNome,
          solicitanteEmail: anonima ? null : dto.solicitanteEmail,
          cidadaoId: dto.cidadaoId,
          chaveHash,
          prazoEm,
          status: 'registrada',
        } as any,
      });
      await tx.manifestacaoEvento.create({
        data: {
          tenantId,
          manifestacaoId: created.id,
          paraStatus: 'registrada',
          evento: 'registrar',
        } as any,
      });
      return created;
    });

    await this.agendarSla(m.id, protocolo, prazoEm, agora);

    // Notifica os ouvidores (LGPD-safe: só protocolo + ação + link).
    await this.notificacoes
      .enfileirar({
        tenantId,
        manifestacaoId: m.id,
        protocolo,
        evento: 'nova_manifestacao',
        destino: 'ouvidores',
      })
      .catch(() => undefined);

    // `chave` é devolvida ao cliente apenas neste retorno (nunca mais consultável).
    return { id: m.id, protocolo: m.protocolo, canal: m.canal, chave };
  }

  private gerarChave(): string {
    let s = '';
    for (let i = 0; i < 10; i++) s += ALFA_CHAVE[randomInt(ALFA_CHAVE.length)];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  }

  // -------------------------------------------------------------- transições
  /**
   * Aplica uma transição de estado na FSM.
   *
   * @param opts.publico - quando true, usa txPublicaOuvidoria() em vez de tx()
   *   para fluxos do cidadão que não têm papel de staff (retomada de SLA por
   *   resposta do cidadão, recurso e-SIC). A validação de acesso (protocolo+chave)
   *   deve ter ocorrido ANTES pelo chamador (TramitacaoService).
   */
  async aplicarEvento(
    manifestacaoId: string,
    evento: Evento,
    opts: { atorId?: string; observacao?: string; publico?: boolean } = {},
  ) {
    // Leitura da manifestação atual: usa dbPublica se o contexto é público.
    const dbLeitura = opts.publico ? this.prisma.dbPublica() : this.prisma.db;
    const m = await dbLeitura.manifestacao.findUnique({ where: { id: manifestacaoId } });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    const r = transicionar(m.status as Status, evento, m.canal as Canal);
    if (!r.ok) throw new BadRequestException(r.erro);

    const agora = new Date();
    const patch: Record<string, unknown> = { status: r.para };

    // efeitos colaterais sobre o SLA
    switch (r.efeito) {
      case 'pausa_sla':
        patch.slaPausadoEm = agora;
        await this.cancelarSla(manifestacaoId);
        break;
      case 'retoma_sla': {
        const novoPrazo = prazoAposPausa(m.prazoEm, m.slaPausadoEm ?? agora, agora);
        patch.prazoEm = novoPrazo;
        patch.slaPausadoEm = null;
        await this.agendarSla(manifestacaoId, m.protocolo, novoPrazo, agora);
        break;
      }
      case 'estende_sla': {
        // prorrogação legal: soma o período de prorrogação do canal
        const config = prazoPadrao(m.canal as Canal, m.tipo as Tipo);
        const novoPrazo = calcularPrazo(m.prazoEm, {
          ...config,
          dias: config.prorrogacaoDias || 10,
        });
        patch.prazoEm = novoPrazo;
        patch.prorrogado = true;
        await this.reagendarVencimento(manifestacaoId, m.protocolo, novoPrazo);
        break;
      }
      case 'encerra_sla':
        patch.respondidoEm = agora;
        await this.cancelarSla(manifestacaoId);
        break;
    }

    // ATÔMICO: muda o status e grava o evento na mesma transação.
    // Escolhe o método de transação correto conforme o contexto (staff vs cidadão).
    const tenantId = TenantContext.tenantId()!;
    const txFn = opts.publico
      ? (fn: (tx: any) => Promise<any>) => this.prisma.txPublicaOuvidoria(fn)
      : (fn: (tx: any) => Promise<any>) => this.prisma.tx(fn);

    const atualizada = await txFn(async (tx) => {
      const a = await tx.manifestacao.update({
        where: { id: manifestacaoId },
        data: patch as any,
      });
      await tx.manifestacaoEvento.create({
        data: {
          tenantId,
          manifestacaoId,
          deStatus: m.status as Status,
          paraStatus: r.para!,
          evento,
          atorId: opts.atorId,
          observacao: opts.observacao,
        } as any,
      });
      return a;
    });
    return atualizada;
  }

  /**
   * Eventos que a UI pode oferecer para o estado atual.
   *
   * @param publico - quando true, usa dbPublica() (fluxo do cidadão via
   *   TramitacaoService após validar protocolo+chave).
   */
  async acoesDisponiveis(manifestacaoId: string, publico = false) {
    const db = publico ? this.prisma.dbPublica() : this.prisma.db;
    const m = await db.manifestacao.findUnique({ where: { id: manifestacaoId } });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');
    return eventosValidos(m.status as Status, m.canal as Canal);
  }

  // --------------------------------------------------------------- SLA queue
  private async agendarSla(id: string, protocolo: string, prazoEm: Date, inicio: Date) {
    const data: SlaJobData = {
      tenantId: TenantContext.tenantId()!,
      manifestacaoId: id,
      protocolo,
      prazoEm: prazoEm.toISOString(),
    };
    const alerta = instanteAlerta(inicio, prazoEm);

    // idempotência por jobId — reagendar substitui sem duplicar
    await this.cancelarSla(id);
    await this.slaQueue.add(JOB_SLA_ALERTA, data, {
      delay: Math.max(0, alerta.getTime() - Date.now()),
      jobId: `sla-alerta-${id}`,
    });
    await this.slaQueue.add(JOB_SLA_VENCIDO, data, {
      delay: Math.max(0, prazoEm.getTime() - Date.now()),
      jobId: `sla-vencido-${id}`,
    });
  }

  private async reagendarVencimento(id: string, protocolo: string, prazoEm: Date) {
    await this.slaQueue.remove(`sla-vencido-${id}`).catch(() => undefined);
    await this.slaQueue.add(
      JOB_SLA_VENCIDO,
      {
        tenantId: TenantContext.tenantId()!,
        manifestacaoId: id,
        protocolo,
        prazoEm: prazoEm.toISOString(),
      },
      { delay: Math.max(0, prazoEm.getTime() - Date.now()), jobId: `sla-vencido-${id}` },
    );
  }

  private async cancelarSla(id: string) {
    await Promise.all([
      this.slaQueue.remove(`sla-alerta-${id}`).catch(() => undefined),
      this.slaQueue.remove(`sla-vencido-${id}`).catch(() => undefined),
    ]);
  }

  // ----------------------------------------------------------------- helpers
  private async registrarEvento(
    manifestacaoId: string,
    de: Status | null,
    para: Status,
    evento: string,
    atorId?: string,
    observacao?: string,
  ) {
    await this.prisma.db.manifestacaoEvento.create({
      data: {
        tenantId: TenantContext.tenantId()!,
        manifestacaoId,
        deStatus: de ?? undefined,
        paraStatus: para,
        evento,
        atorId,
        observacao,
      } as any,
    });
  }

  /** Protocolo "AAAA000123" sequencial por tenant/ano — incremento ATÔMICO. */
  private async gerarProtocolo(): Promise<string> {
    const ano = new Date().getFullYear();
    const tenantId = TenantContext.tenantId()!;
    const [r] = await this.prisma.db.$queryRaw<{ valor: bigint }[]>`
      INSERT INTO protocolo_contadores (tenant_id, escopo, ano, valor)
      VALUES (${tenantId}::uuid, 'manifestacao', ${ano}, 1)
      ON CONFLICT (tenant_id, escopo, ano)
      DO UPDATE SET valor = protocolo_contadores.valor + 1
      RETURNING valor`;
    return `${ano}${String(Number(r.valor)).padStart(6, '0')}`;
  }
}
