import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const INLINE = '?inline'

// A stylesheet's text as the package ships it: minified with esbuild, both
// where the component injects it and as the standalone `./style.css`
export const minifyCss = (file) =>
  transformSync(readFileSync(file, 'utf8'), { loader: 'css', minify: true }).code.trim()

// Turn `import css from './styles.css?inline'` into a module whose default
// export is the minified stylesheet text. The same plugin as json-edit-react's
// scripts/rollup-inline-css.mjs.
//
// `?inline` is Vite's convention for importing a stylesheet's text instead of
// injecting it, which is what lets the demo's `local` mode consume `src/`
// directly. Rollup has no query convention, so this plugin resolves the
// specifier itself: the plain `.css` path is located through the normal
// resolver, the `?inline` marker is kept on the module id so the `load` hook
// handles exactly these imports and nothing else, then the file is read and
// minified with esbuild.
//
// The result is `export default '<css>'` with no injector call, so the
// stylesheet is an ordinary string constant that only its consumer
// references, and the module has no side effect at import. The component
// injects it when it mounts.
export const inlineCss = () => ({
  name: 'inline-css',
  async resolveId(source, importer) {
    if (!source.endsWith(`.css${INLINE}`)) return null
    const resolved = await this.resolve(source.slice(0, -INLINE.length), importer, {
      skipSelf: true,
    })
    return resolved && `${resolved.id}${INLINE}`
  },
  load(id) {
    if (!id.endsWith(`.css${INLINE}`)) return null
    const file = id.slice(0, -INLINE.length)
    this.addWatchFile(file)
    return { code: `export default ${JSON.stringify(minifyCss(file))}`, map: { mappings: '' } }
  },
})

// Emit a stylesheet into the build as a file of its own: the same text the
// component injects, for a host to add to a shadow root, where the injected
// sheet in the document's <head> does not reach
export const emitCss = ({ source, fileName }) => ({
  name: 'emit-css',
  buildStart() {
    this.addWatchFile(source)
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName, source: minifyCss(source) })
  },
})
