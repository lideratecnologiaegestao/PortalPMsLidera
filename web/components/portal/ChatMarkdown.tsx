'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renderiza Markdown das respostas do assistente (negrito, listas, tabelas GFM,
 * títulos, blockquote e LINKS clicáveis). Seguro por padrão (react-markdown não
 * interpreta HTML cru). Links abrem em nova aba. Estilo compacto para caber numa
 * bolha de chat, 100% token-driven (herda a cor do texto da bolha).
 *
 * Use SOMENTE para mensagens do bot/atendente — a mensagem do visitante é texto
 * puro (não deve interpretar Markdown que o cidadão por acaso digite).
 */
export default function ChatMarkdown({ children }: { children: string }) {
  return (
    <div
      className={[
        'text-sm leading-relaxed space-y-2 break-words',
        '[&_p]:m-0',
        '[&_a]:underline [&_a]:font-medium [&_a]:break-all',
        '[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-1 [&_h1]:mb-0',
        '[&_h2]:text-sm [&_h2]:font-bold',
        '[&_h3]:text-sm [&_h3]:font-semibold',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-0.5',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-0.5',
        '[&_li]:m-0',
        '[&_strong]:font-semibold',
        '[&_hr]:my-2 [&_hr]:border-fg/15',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-fg/25 [&_blockquote]:pl-2 [&_blockquote]:opacity-90',
        '[&_code]:rounded [&_code]:bg-fg/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
        '[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-fg/10 [&_pre]:p-2',
        '[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-xs [&_table]:border-collapse',
        '[&_th]:border [&_th]:border-fg/20 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
        '[&_td]:border [&_td]:border-fg/20 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
      ].join(' ')}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
