/** Estrelas (somente leitura) a partir de uma média 0–5. */
export default function Estrelas({ media, size = 16, mostrarNota = false }: { media: number; size?: number; mostrarNota?: boolean }) {
  const cheias = Math.round(media);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${media.toFixed(1)} de 5 estrelas`} title={`${media.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
          className={i <= cheias ? 'text-warning' : 'text-fg/20'}>
          <path d="M10 1.6l2.47 5 5.53.8-4 3.9.94 5.5L10 14.9l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z" />
        </svg>
      ))}
      {mostrarNota && media > 0 && <span className="ml-1 text-xs font-semibold text-fg/70">{media.toFixed(1)}</span>}
    </span>
  );
}
