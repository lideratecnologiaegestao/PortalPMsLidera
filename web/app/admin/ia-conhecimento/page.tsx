import { redirect } from 'next/navigation';

/**
 * /admin/ia-conhecimento redireciona para a aba padrão (Perguntas e Respostas).
 * O layout.tsx envolve todas as subpáginas com as abas de navegação.
 */
export default function IaConhecimentoRedirect() {
  redirect('/admin/ia-conhecimento/perguntas');
}
