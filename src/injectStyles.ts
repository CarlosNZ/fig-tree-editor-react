import css from './styles.css?inline'

// The stylesheet is inlined into the bundle as text (`?inline`, see
// global.d.ts) and injected from here rather than by a module side effect, so
// importing the package does nothing to the document until an editor mounts.
// This is json-edit-react's `injectStyles`, which injects JER's own sheet the
// same way.
//
// The call site is a `useInsertionEffect` in FigTreeEditor, which React runs
// in the commit's mutation phase, before layout effects and before the browser
// can paint, so the rules are in place the first time the editor is on screen.
//
// Deduplication is keyed on the `<style>` element rather than on module state,
// so it survives module re-evaluation: when Vite's HMR reloads this module
// after a stylesheet edit, the text is swapped in place instead of a second
// sheet being appended behind which the stale rules would keep applying.

const MARKER = 'data-fig-tree-editor-styles'

export const injectStyles = () => {
  if (typeof document === 'undefined') return
  const existing = document.head.querySelector(`style[${MARKER}]`)
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css
    return
  }
  const style = document.createElement('style')
  style.setAttribute(MARKER, '')
  style.textContent = css
  document.head.appendChild(style)
}
