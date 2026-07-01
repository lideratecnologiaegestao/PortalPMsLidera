/**
 * MenuIcon — agora delega para o catálogo unificado de ícones (lucide).
 * Mantém a assinatura antiga (name/size) e o export ICON_NAMES para não quebrar
 * importadores. Nomes antigos ('home', 'file', …) resolvem via aliases no
 * catálogo. O seletor visual passou a ser o IconeEmojiPicker.
 */
import { Icone } from '../../lib/icones';

export const ICON_NAMES = [
  'home', 'building', 'file', 'news', 'scale', 'phone',
  'search', 'info', 'doc', 'users', 'megaphone', 'map', 'link',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

interface Props {
  name: string | null | undefined;
  size?: number;
  className?: string;
}

export default function MenuIcon({ name, size = 16, className }: Props) {
  return <Icone nome={name} size={size} className={className} />;
}
