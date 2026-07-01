'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renderiza conteúdo rico institucional em dois formatos:
 *  - 'md'   → Markdown (react-markdown + GFM; não interpreta HTML cru → seguro).
 *  - 'html' → HTML do admin (confiança no autor, igual ao resto do portal).
 *
 * Estilizado com `prose-portal` (mesma classe das demais páginas). Usado tanto
 * na página pública quanto na pré-visualização do editor admin.
 */
export default function ConteudoRico({
  formato,
  conteudo,
  className = 'prose-portal max-w-none text-fg/85',
}: {
  formato: string;
  conteudo: string;
  className?: string;
}) {
  if (formato === 'md') {
    return (
      <div className={className}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
        >
          {conteudo}
        </ReactMarkdown>
      </div>
    );
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: conteudo }} />;
}
