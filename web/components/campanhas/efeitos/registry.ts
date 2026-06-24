/**
 * Registro plugável de efeitos de campanha.
 *
 * Adicionar novo efeito:
 *   1. Criar o componente em `efeitos/MeuEfeito.tsx` (client component).
 *   2. Importar e registrar abaixo com a chave `nome` que o backend envia.
 *
 * O CampanhaRenderer monta o componente dinamicamente a partir do `nome`
 * recebido no contexto da campanha, evitando lógica condicional crescente.
 */

import type { ComponentType } from 'react';
import type { CampanhaEfeito } from '../../../lib/campanhas';
import AedesOverlay from './AedesOverlay';
import CopaOverlay from './CopaOverlay';

export interface EfeitoProps {
  efeito: CampanhaEfeito;
  /** Host do tenant (para escopar dispensa em localStorage). */
  tenantHost: string;
}

/** Mapa nome-do-efeito → componente React. */
export const EFEITOS_REGISTRY: Record<string, ComponentType<EfeitoProps>> = {
  'aedes-overlay': AedesOverlay,
  'copa-overlay': CopaOverlay,
};
