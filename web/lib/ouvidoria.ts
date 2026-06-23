// Helpers de cliente para Ouvidoria / e-SIC (Client Components).
// Fala só com a API (mesma origem atrás do Nginx); cookie de sessão automático.
import { apiBase } from './auth-shared';

export type Canal = 'ouvidoria' | 'esic';
export type TipoOuvidoria =
  | 'reclamacao'
  | 'denuncia'
  | 'sugestao'
  | 'elogio'
  | 'solicitacao';

export const TIPOS_OUVIDORIA: { value: TipoOuvidoria; label: string; desc: string; emoji: string }[] = [
  { value: 'denuncia', label: 'Denúncia', desc: 'Irregularidade ou ato ilícito (pode ser anônima).', emoji: '🚨' },
  { value: 'reclamacao', label: 'Reclamação', desc: 'Insatisfação com um serviço público.', emoji: '😠' },
  { value: 'sugestao', label: 'Sugestão', desc: 'Ideia para melhorar um serviço.', emoji: '💡' },
  { value: 'elogio', label: 'Elogio', desc: 'Reconhecimento de um bom atendimento.', emoji: '👏' },
  { value: 'solicitacao', label: 'Solicitação', desc: 'Pedido de providência, serviço ou dúvida.', emoji: '📋' },
];

export interface RegistrarInput {
  canal: Canal;
  tipo: string;
  assunto: string;
  descricao: string;
  anonima?: boolean;
  solicitanteNome?: string;
  solicitanteEmail?: string;
}

export interface RegistroResposta {
  id: string;
  protocolo: string;
  canal: Canal;
  chave: string;
}

export interface Mensagem {
  id: string;
  autorTipo: 'cidadao' | 'servidor' | 'sistema';
  autorNome: string;
  conteudo: string;
  criadoEm: string;
}

export interface EventoMarco {
  id: string;
  evento: string;
  paraStatus: string;
  observacao: string | null;
  criadoEm: string;
}

export interface Anexo {
  id: string;
  nomeArquivo: string;
  mime: string;
  origem: 'cidadao' | 'orgao';
  tamanhoBytes: number;
  criadoEm: string;
}

export interface Detalhe {
  id: string;
  protocolo: string;
  canal: Canal;
  tipo: string;
  status: string;
  assunto: string;
  descricao: string;
  anonima: boolean;
  prazoEm: string;
  prorrogado: boolean;
  respondidoEm: string | null;
  resposta: string | null;
  criadoEm: string;
  anexos: Anexo[];
  recursoDisponivel: boolean;
  podeAvaliar: boolean;
  satisfacao: { nota: number } | null;
  eventos: EventoMarco[];
  mensagens: Mensagem[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}/api/manifestacoes${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message);
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const registrar = (input: RegistrarInput) =>
  req<RegistroResposta>('', { method: 'POST', body: JSON.stringify(input) });

export const acompanhar = (protocolo: string, chave?: string) =>
  req<Detalhe>(
    `/acompanhar?protocolo=${encodeURIComponent(protocolo)}${chave ? `&chave=${encodeURIComponent(chave)}` : ''}`,
  );

export const enviarMensagem = (protocolo: string, conteudo: string, chave?: string) =>
  req<Detalhe>('/acompanhar/mensagem', {
    method: 'POST',
    body: JSON.stringify({ protocolo, chave, conteudo }),
  });

export const avaliar = (protocolo: string, nota: number, comentario?: string, chave?: string) =>
  req<{ ok: boolean }>('/acompanhar/avaliar', {
    method: 'POST',
    body: JSON.stringify({ protocolo, chave, nota, comentario }),
  });

export const abrirRecurso = (protocolo: string, justificativa: string, chave?: string) =>
  req<Detalhe>('/acompanhar/recurso', {
    method: 'POST',
    body: JSON.stringify({ protocolo, chave, justificativa }),
  });

/** Upload de anexo (multipart) — não definir Content-Type (boundary automático). */
export async function anexar(protocolo: string, file: File, chave?: string): Promise<Detalhe> {
  const form = new FormData();
  form.append('file', file);
  form.append('protocolo', protocolo);
  if (chave) form.append('chave', chave);
  const res = await fetch(`${apiBase}/api/manifestacoes/acompanhar/anexo`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message);
    } catch {
      /* */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<Detalhe>;
}

/** URL de download de um anexo (autorizada por protocolo + chave). */
export const urlAnexo = (protocolo: string, anexoId: string, chave?: string) =>
  `${apiBase}/api/manifestacoes/acompanhar/anexo/${anexoId}?protocolo=${encodeURIComponent(protocolo)}${chave ? `&chave=${encodeURIComponent(chave)}` : ''}`;

/**
 * Solicita o envio dos protocolos vinculados ao e-mail por e-mail.
 * A API responde SEMPRE { ok: true, mensagem } — nunca retorna lista (LGPD).
 */
export const recuperarProtocolos = (email: string) =>
  req<{ ok: boolean; mensagem: string }>('/recuperar-protocolos', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export interface MinhaManifestacao {
  id: string;
  protocolo: string;
  canal: Canal;
  tipo: string;
  status: string;
  assunto: string;
  prazoEm: string;
  prorrogado: boolean;
  respondidoEm: string | null;
  criadoEm: string;
}

export const minhas = (canal?: Canal) =>
  req<MinhaManifestacao[]>(`/minhas${canal ? `?canal=${canal}` : ''}`);

// Rótulos de status (compartilhados com o admin).
export const STATUS_LABEL: Record<string, string> = {
  registrada: 'Registrada',
  em_analise: 'Em análise',
  em_tratamento: 'Em tratamento',
  aguardando_cidadao: 'Aguardando você',
  prorrogada: 'Prazo prorrogado',
  respondida: 'Respondida',
  indeferida: 'Indeferida',
  parcialmente_atendida: 'Parcialmente atendida',
  recurso_1a_instancia: 'Recurso 1ª instância',
  recurso_2a_instancia: 'Recurso 2ª instância',
  concluida: 'Concluída',
  arquivada: 'Arquivada',
};
