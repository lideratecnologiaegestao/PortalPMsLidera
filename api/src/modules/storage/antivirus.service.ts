import { Injectable, Logger } from '@nestjs/common';
import { connect } from 'node:net';

/**
 * Varredura antivírus de uploads via ClamAV (daemon clamd, protocolo INSTREAM).
 * Configurado por CLAMAV_HOST/CLAMAV_PORT. DEGRADAÇÃO: se o clamd não estiver
 * configurado/acessível, libera o arquivo e loga um aviso (não bloqueia o
 * fluxo) — em produção, o clamd deve estar disponível.
 *
 * Uso: `if (!(await antivirus.limpo(buffer))) throw ...`.
 */
@Injectable()
export class AntivirusService {
  private readonly log = new Logger(AntivirusService.name);
  private readonly host = process.env.CLAMAV_HOST;
  private readonly port = Number(process.env.CLAMAV_PORT ?? 3310);

  get configurado(): boolean {
    return !!this.host;
  }

  /** true = limpo (ou AV não configurado); false = vírus detectado. */
  async limpo(buffer: Buffer): Promise<boolean> {
    if (!this.host) {
      this.log.debug('ClamAV não configurado — varredura ignorada.');
      return true;
    }
    try {
      const resultado = await this.scanInstream(buffer);
      const infectado = /FOUND/.test(resultado);
      if (infectado) this.log.warn(`Upload infectado bloqueado: ${resultado.trim()}`);
      return !infectado;
    } catch (e) {
      // falha de conexão ao clamd: por segurança operacional, NÃO bloqueia o
      // fluxo do cidadão, mas registra para alerta (ajuste a política se quiser
      // fail-closed em produção).
      this.log.error(`Falha ao varrer no ClamAV: ${String(e)}`);
      return true;
    }
  }

  private scanInstream(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host as string, port: this.port }, () => {
        socket.write('zINSTREAM\0');
        const tamanho = Buffer.alloc(4);
        tamanho.writeUInt32BE(buffer.length);
        socket.write(tamanho);
        socket.write(buffer);
        socket.write(Buffer.from([0, 0, 0, 0])); // chunk de tamanho 0 = fim
      });
      let resposta = '';
      socket.setTimeout(10_000);
      socket.on('data', (d) => (resposta += d.toString()));
      socket.on('end', () => resolve(resposta));
      socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout clamd')); });
      socket.on('error', reject);
    });
  }
}
