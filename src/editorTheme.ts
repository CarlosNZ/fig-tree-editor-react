import { type NodeData, type Theme, type ThemeInput } from 'json-edit-react'
import {
  brokenIssue,
  flaggedIssues,
  issuesBeneath,
  type IssueIndex,
  type IssueRollUp,
} from './attachIssues'
import { rowAt, type Classification } from './classify'
import { commentPart } from './comments'

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
  error: string // row tint, flag and card
  warning: string // the same for a warning, and a collapsed summary holding only warnings
  hint: string // a hint's label in the messages area
  filledIn: string // the marker on a value the editor filled in, and its label
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
  hint: '#6b7a90',
  filledIn: '#f2c200',
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
  rollUp: IssueRollUp // the issues on and beneath each row
  editorTheme: EditorTheme
  indent: number // json-edit-react's, which sets each row's left margin
}

// The editor's layer of json-edit-react's theme, beneath the host's.
// json-edit-react stacks `theme` over its own default, later layers winning
// wherever they overlap, so the host's styles apply over the editor's. The
// styles that depend on a row's kind are style functions, which
// json-edit-react applies after every static style, so a host's static styles
// recolour json-edit-react's elements without undoing the editor's structure.
//
// TO-DO: the other kinds' styles, each with the component that needs it
// (plan, Phases 9 and 10).
const editorThemeLayer = ({
  classification,
  issues,
  rollUp,
  editorTheme,
  indent,
}: ThemeContext): Theme => {
  const comment = (nodeData: NodeData) => commentPart(classification, nodeData)
  const openLines = (nodeData: NodeData) => comment(nodeData) === 'lines' && !nodeData.collapsed

  // The form of an operator node, `literal` included, or a fragment call;
  // undefined on any other row
  const nodeForm = ({ path }: NodeData) => {
    const kind = rowAt(classification, path)?.kind
    return kind?.kind === 'operator' || kind?.kind === 'fragment' || kind?.kind === 'literal'
      ? kind.form
      : undefined
  }

  // A row is tinted by its most severe issue (topic 7, "Where issues
  // attach"): an error with a stripe, a warning fainter and without one. A
  // value row's tint is its line, and a collection's its whole block, its
  // header line included. A node isn't tinted, since its header carries a
  // flag.
  const tint = (nodeData: NodeData) => {
    if (nodeForm(nodeData) !== undefined) return null
    const severity = flaggedIssues(issues, nodeData.path)[0]?.severity
    if (severity === undefined || severity === 'hint') return null
    return severity === 'error'
      ? { colour: editorTheme.error, strength: ERROR_TINT, stripe: true }
      : { colour: editorTheme.warning, strength: WARNING_TINT, stripe: false }
  }

  return {
    styles: {
      // The vars key takes the `$vars` colour, and a modifier's key is muted
      // and italic (topic 3, "States"): `fallback`, `useCache`, and a `//`
      // whose key shows, since it holds something other than a note
      property: ({ path }) => {
        const row = rowAt(classification, path)
        if (row?.kind?.kind === 'vars') return { color: editorTheme.refVars }
        if (row?.slot?.role === 'modifier' || row?.kind?.kind === 'comment')
          return { color: editorTheme.modifierKey, fontStyle: 'italic' }
        return null
      },
      // A flattened payload's rows line up as the node's own, so its row adds
      // no indent (design, topic 1, finding 7). A vars block has a rule down
      // its left edge and a tint, set a little apart from the rows above
      // (topic 5, "The vars block").
      collection: (nodeData) => {
        const row = rowAt(classification, nodeData.path)
        if (row?.payload === 'flattened') return { marginLeft: 0 }
        if (row?.kind?.kind === 'vars') return varsBlock(editorTheme.varsBlock, indent)
        if (comment(nodeData) === 'lines') return noteBlock(editorTheme.comment)
        const blockTint = tint(nodeData)
        return blockTint && issueBlock(blockTint, nodeData.path.length === 0 ? 0 : indent)
      },
      // A comment is a note (topic 5, "Comments"): a string comment's row is
      // the block, and so is a multi-line comment's array, whose inner block
      // takes back the indent its lines would add. The array's header row
      // holds only its edit tools, so it floats at the block's top right,
      // above the first line's row, which sits beside it rather than beneath.
      //
      // A comment never starts collapsed, but a collapse-all on an ancestor
      // reaches it, so a collapsed one shows its chevron and brackets, to be
      // opened again.
      //
      // TO-DO: drop the collapsed case once json-edit-react can keep a row
      // from collapsing (plan, 9.2).
      valueRow: (nodeData) => {
        if (comment(nodeData) === 'note') return noteBlock(editorTheme.comment)
        const rowTint = tint(nodeData)
        return rowTint && issueRow(rowTint)
      },
      headerRow: (nodeData) =>
        openLines(nodeData) ? { float: 'right', minHeight: 0, zIndex: 1 } : null,
      // A collapsed row's summary takes the colour of the most severe issue
      // on or beneath it, so a collapsed row hides none (topic 7)
      itemCount: (nodeData) => {
        if (!nodeData.collapsed) return null
        const { errors, warnings } = issuesBeneath(rollUp, nodeData.path)
        if (errors > 0) return { color: editorTheme.error, fontWeight: 600 }
        if (warnings > 0) return { color: warningText(editorTheme.warning), fontWeight: 600 }
        return null
      },
      iconCollection: (nodeData) => (openLines(nodeData) ? { display: 'none' } : null),
      // A node's header stands in for its brackets, which show again only
      // around a collapsed node's summary
      bracket: (nodeData) =>
        (nodeForm(nodeData) !== undefined && !nodeData.collapsed) || openLines(nodeData)
          ? { display: 'none' }
          : null,
      // A collapsed node is its summary alone, with no border. A shorthand
      // node's border is dashed, and a broken node has an error border and
      // stripe, whatever its form (topic 3).
      collectionInner: (nodeData) => {
        if (comment(nodeData) === 'lines') return { marginLeft: `-${indent / 2}em` }
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

// The tint is the rule's colour, faint, so a host sets both with one value.
// The rule sits left of the block's chevron, which json-edit-react hangs
// left of the key, and the padding puts the key back in line with its
// siblings' (json-edit-react's margin is half the indent).
const varsBlock = (colour: string, indent: number) => ({
  borderLeft: `${RULE_WIDTH} solid ${colour}`,
  background: `color-mix(in srgb, ${colour} 7%, transparent)`,
  marginTop: '0.4em',
  marginLeft: `calc(${indent / 2}em - ${RULE_GAP} - ${RULE_WIDTH})`,
  paddingLeft: RULE_GAP,
})

// A comment's note: a rule and a tint from the comment colour, fainter than
// its text
const noteBlock = (colour: string) => ({
  borderLeft: `${RULE_WIDTH} solid color-mix(in srgb, ${colour} 45%, transparent)`,
  background: `color-mix(in srgb, ${colour} 6%, transparent)`,
  borderRadius: '0 0.25em 0.25em 0',
  marginTop: '0.1em',
  marginBottom: '0.3em',
  padding: '0.15em 0.4em 0.15em 0',
})

// An issue's tint, with a stripe down its left edge for an error. A value
// row's starts a little left of the row, and a collection's left of its
// chevron, as a vars block's rule does, each padded so its text stays in line
// with its siblings'.
interface Tint {
  colour: string
  strength: string
  stripe: boolean
}

const tintStyle = ({ colour, strength, stripe }: Tint) => ({
  background: `color-mix(in srgb, ${colour} ${strength}, transparent)`,
  ...(stripe && { boxShadow: `inset ${STRIPE_WIDTH} 0 0 ${colour}` }),
  borderRadius: '0.25em',
})

const issueRow = (tint: Tint) => ({
  ...tintStyle(tint),
  marginLeft: `-${TINT_GAP}`,
  paddingLeft: TINT_GAP,
})

// `indent` is json-edit-react's, whose margin for the row is half of it. The
// closing bracket's line is shorter than a row, so the block is padded below
// it.
const issueBlock = (tint: Tint, indent: number) => ({
  ...tintStyle(tint),
  marginLeft: `calc(${indent / 2}em - ${RULE_GAP})`,
  paddingLeft: RULE_GAP,
  paddingBottom: '0.5em',
})

const ERROR_TINT = '9%'
const WARNING_TINT = '10%'
const STRIPE_WIDTH = '3px'
const TINT_GAP = '0.4em'

// A warning's text: its colour, darkened to read on a light background
export const warningText = (warning: string) => `color-mix(in srgb, ${warning}, black 35%)`

// Text on the filled-in colour, which is too light for white: the colour,
// darkened almost to black
export const filledInText = (filledIn: string) => `color-mix(in srgb, ${filledIn}, black 80%)`

const RULE_WIDTH = '2px'
const RULE_GAP = '1.35em' // from the rule to the key

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
