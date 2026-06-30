/**
 * AtalhoIcone — agora delega para o catálogo unificado de ícones (lucide).
 * Mantém a assinatura antiga (nome) e o export ICONES_ATALHO. Nomes antigos
 * ('transparencia', 'saude', …) resolvem via aliases no catálogo.
 */
import { Icone } from '../../lib/icones';

export const ICONES_ATALHO = [
  'transparencia', 'servicos', 'esic', 'ouvidoria', 'diario',
  'dados', 'saude', 'educacao', 'obras', 'dinheiro', 'telefone',
  'mapa', 'documento', 'calendario', 'usuario', 'link',
] as const;

export default function AtalhoIcone({ nome, className, size = 28 }: { nome: string; className?: string; size?: number }) {
  // Fallback para 'link' quando o nome não resolve (mantém comportamento antigo).
  return <Icone nome={nome} size={size} className={className ?? 'h-7 w-7'} />;
}
