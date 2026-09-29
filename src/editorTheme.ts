import { type Theme, type ThemeInput } from 'json-edit-react'

// The editor's own colours, which json-edit-react's theme has no element for.
// The editor's components apply them as inline styles, as json-edit-react
// applies its theme, so a host sets them through a prop. Operator and category
// colours are display data (displayData.ts), not these.
export interface EditorTheme {
  refData: string // `$data` references
  refVars: string // `$vars` references, and the vars key
  refParams: string // `$params` references
  refBinding: string // `$element`, `$index` and `as` names
  varsBlock: string // the vars block's tint and rule
  modifierKey: string // the `//`, fallback and useCache keys
  comment: string // comment notes
  error: string // row tint and flag
  warning: string // warning flag
  filledIn: string // the filled-in-on-load marker
  failed: string // the failed-row marker
  shorthandBorder: string // a shorthand node's dashed border
  fragmentBackground: string // a fragment with no colours of its own
  fragmentText: string
}

export const defaultEditorTheme: EditorTheme = {
  refData: '#7b3fc4',
  refVars: '#0f7c7a',
  refParams: '#b0307f',
  refBinding: '#8a5a00',
  varsBlock: '#0f7c7a',
  modifierKey: '#6b7280',
  comment: '#6b7280',
  error: '#c0392b',
  warning: '#d68910',
  filledIn: '#e0a400',
  failed: '#c0392b',
  shorthandBorder: '#9ca3af',
  fragmentBackground: '#477799',
  fragmentText: '#ebdf5a',
}

export const mergeEditorTheme = (theme: Partial<EditorTheme> = {}): EditorTheme => ({
  ...defaultEditorTheme,
  ...theme,
})

// The editor's layer of json-edit-react's theme, beneath the host's.
// json-edit-react stacks `theme` over its own default, later layers winning
// wherever they overlap, so the host's styles apply over the editor's. TO-DO:
// the styles that depend on a row's kind, as style functions (plan, 4.4).
const editorThemeLayer: Theme = { styles: {} }

export const layerTheme = (hostTheme: ThemeInput | undefined): ThemeInput =>
  hostTheme === undefined
    ? editorThemeLayer
    : [editorThemeLayer, ...(Array.isArray(hostTheme) ? hostTheme : [hostTheme])]
