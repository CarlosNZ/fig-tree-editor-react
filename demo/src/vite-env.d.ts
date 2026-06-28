/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which copy of fig-tree-editor-react the demo runs against (see vite.config.ts). */
  readonly VITE_FIG_SOURCE?: 'npm' | 'local' | 'build' | 'pack'
}
