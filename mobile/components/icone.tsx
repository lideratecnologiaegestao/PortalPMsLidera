import { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/** Nome de glyph do conjunto MaterialCommunityIcons (já incluso no Expo). */
export type NomeIcone = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Ícone vetorial temado — único conjunto, traço consistente, tinta na cor da
 * marca do tenant. Substitui emoji (que renderiza diferente em cada aparelho).
 */
export function Icone({ nome, tamanho = 24, cor }: { nome: NomeIcone; tamanho?: number; cor: string }) {
  return <MaterialCommunityIcons name={nome} size={tamanho} color={cor} />;
}
