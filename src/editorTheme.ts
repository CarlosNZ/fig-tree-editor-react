import { type NodeData, type Theme, type ThemeInput } from 'json-edit-react'
import { brokenIssue, type IssueIndex } from './attachIssues'
import { rowAt, type Classification } from './classify'

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
  nodeBorder: string // the border around a node's rows
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
  nodeBorder: '#dbdbdb',
  shorthandBorder: '#9ca3af',
  fragmentBackground: '#477799',
  fragmentText: '#ebdf5a',
}

export const mergeEditorTheme = (theme: Partial<EditorTheme> = {}): EditorTheme => ({
  ...defaultEditorTheme,
  ...theme,
})

// What the editor's layer reads to style a row by its kind and its issues
export interface ThemeContext {
  classification: Classification
  issues: IssueIndex
  editorTheme: EditorTheme
}

// The editor's layer of json-edit-react's theme, beneath the host's.
// json-edit-react stacks `theme` over its own default, later layers winning
// wherever they overlap, so the host's styles apply over the editor's. The
// styles that depend on a row's kind are style functions, which
// json-edit-react applies after every static style, so a host's static styles
// recolour json-edit-react's elements without undoing the editor's structure.
//
// TO-DO: the other kinds' styles, each with the component that needs it
// (plan, Phases 8 to 10).
const editorThemeLayer = ({ classification, issues, editorTheme }: ThemeContext): Theme => {
  // The form of an operator node or fragment call; undefined on any other
  // row
  const nodeForm = ({ path }: NodeData) => {
    const kind = rowAt(classification, path)?.kind
    return kind?.kind === 'operator' || kind?.kind === 'fragment' ? kind.form : undefined
  }

  return {
    styles: {
      // A flattened payload's rows line up as the node's own, so its row adds
      // no indent (design, topic 1, finding 7)
      collection: ({ path }) =>
        rowAt(classification, path)?.payload === 'flattened' ? { marginLeft: 0 } : null,
      // A node's header stands in for its brackets, which show again only
      // around a collapsed node's summary
      bracket: (nodeData) =>
        nodeForm(nodeData) !== undefined && !nodeData.collapsed ? { display: 'none' } : null,
      // A collapsed node is its summary alone, with no border. A shorthand
      // node's border is dashed, and a broken node has an error border and
      // stripe, whatever its form (topic 3).
      collectionInner: (nodeData) => {
        const form = nodeForm(nodeData)
        if (form === undefined || nodeData.collapsed) return null
        const broken =
          brokenIssue(issues, classification, nodeData.path, nodeData.value) !== undefined
        const shorthand = form === 'shorthand'
        return {
          ...NODE_BORDER,
          borderStyle: shorthand ? 'dashed' : 'solid',
          borderColor: broken
            ? editorTheme.error
            : shorthand
              ? editorTheme.shorthandBorder
              : editorTheme.nodeBorder,
          ...(broken && { borderLeftWidth: '0.3em' }),
        }
      },
    },
  }
}

const NODE_BORDER = {
  borderWidth: '1px',
  borderRadius: '0.75em',
  padding: '0.5em',
  marginBottom: '0.5em',
  marginLeft: '-1em',
}

export const layerTheme = (
  hostTheme: ThemeInput | undefined,
  context: ThemeContext
): ThemeInput => {
  const editorLayer = editorThemeLayer(context)
  return hostTheme === undefined
    ? editorLayer
    : [editorLayer, ...(Array.isArray(hostTheme) ? hostTheme : [hostTheme])]
}
