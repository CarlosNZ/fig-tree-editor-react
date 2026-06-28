/**
 * Small fixed-corner badge showing which copy of `fig-tree-editor-react` the
 * demo is running against (set via VITE_FIG_SOURCE — see vite.config.ts).
 * Renders nothing in the default `npm` mode (the deployed demo).
 */
const COLORS: Record<string, string> = {
  local: '#d83a3a', // red
  build: '#b13ab1', // magenta
  pack: '#e08000', // orange
}

export const SourceIndicator = () => {
  const source = import.meta.env.VITE_FIG_SOURCE
  const color = source ? COLORS[source] : undefined
  if (!source || !color) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 60,
        right: 8,
        zIndex: 9999,
        background: color,
        color: 'white',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontFamily: 'monospace',
        fontWeight: 700,
        letterSpacing: 0.5,
        pointerEvents: 'none',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {source.toUpperCase()}
    </div>
  )
}
