// Ambient declarations for non-code imports. CSS is imported for its side
// effects (bundled by rollup-plugin-styles at build time); TypeScript needs a
// type for the module so `import './styles.css'` resolves.
declare module '*.css'
