/** Tipos do Construtor de Formulários. */

export type CampoTipo =
  | 'texto'
  | 'textarea'
  | 'email'
  | 'telefone'
  | 'cpf'
  | 'numero'
  | 'data'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'upload'
  | 'secao'
  | 'paragrafo';

export const CAMPO_TIPOS: CampoTipo[] = [
  'texto', 'textarea', 'email', 'telefone', 'cpf', 'numero', 'data',
  'select', 'checkbox', 'radio', 'upload', 'secao', 'paragrafo',
];

export interface CampoOpcao {
  label: string;
  valor: string;
}

export interface CampoValidacao {
  minLength?: number;
  maxLength?: number;
  formato?: 'email' | 'telefone' | 'cpf' | 'numero';
  regex?: string;
  mensagem?: string;
}

export interface CampoSchema {
  id: string;
  tipo: CampoTipo;
  label: string;
  nome: string;
  placeholder?: string;
  ajuda?: string;
  obrigatorio: boolean;
  largura: 'full' | 'half';
  opcoes?: CampoOpcao[];
  validacao?: CampoValidacao;
  multiplos?: boolean;  // checkbox
  accept?: string;      // upload mime accept
  maxTamanhoMb?: number;
}

export interface AnexoEnvio {
  campo: string;
  nome: string;
  mime: string;
  storageKey: string;
  tamanho: number;
}

export type FormularioStatus = 'rascunho' | 'publicado' | 'encerrado';
