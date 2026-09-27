// Ambient declarations for non-code imports. A stylesheet is imported with
// `?inline` for its text, which the component injects itself: Vite resolves
// the query natively (the demo's `local` mode), and the rollup build through
// the `inlineCss` plugin (scripts/inlineCss.mjs).
declare module '*.css?inline' {
  const css: string
  export default css
}
