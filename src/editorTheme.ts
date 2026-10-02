import { type CSSProperties } from 'react'
import { toPathString, type NodeData, type Theme, type ThemeInput } from 'json-edit-react'
import { type TraceStatus } from 'fig-tree-evaluator'
import {
  brokenIssue,
  flaggedIssues,
  issuesBeneath,
  type IssueIndex,
  type IssueRollUp,
} from './attachIssues'
import { rowAt, type Classification } from './classify'
import { commentPart } from './comments'
import { type RunMarks } from './runMarks'

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
  modifierKey: string // the `//`, fallback and noCache keys
  comment: string // comment notes
  error: string // row tint, flag and card
  warning: string // the same for a warning, and a collapsed summary holding only warnings
  hint: string // a hint's label in the messages area
  filledIn: string // the marker on a value the editor filled in, and its label
  // How a node ran, after an evaluation: its border and its button's icon,
  // its card's text, and a collapsed node's summary
  runValue: string
  runFailed: string
  runFallback: string // failed, and its fallback caught the failure
  runCancelled: string
  runSkipped: string // never ran: no border or icon, since the node is dimmed
  nodeBorder: string // the border around a node's rows
  shorthandBorder: string // a shorthand node's dotted border
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
  runValue: '#2f9e44',
  runFailed: '#c0392b',
  runFallback: '#e67700',
  runCancelled: '#262626',
  runSkipped: '#a3a3a3',
  nodeBorder: '#dbdbdb',
  shorthandBorder: '#BCBFC5', //#9ca3af
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
  filledIn: FilledInMarker | null // the rows a write has just filled in
  run: RunMarks | null // how the rows ran in the latest evaluation
}

// The rows the editor's latest write filled in, highlighted as it is made,
// then fading (design, topic 7, "The filled-in marker fades"). Keyed as the
// classification is.
export interface FilledInMarker {
  rows: readonly string[]
  fading: boolean
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
  filledIn,
  run,
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
  // attach"), with a stripe of its colour: an error in red, a warning in
  // amber and fainter. A value row's tint is its line, and a collection's its
  // whole block, its header line included. A node isn't tinted, since its
  // header carries a flag.
  const tint = (nodeData: NodeData) => {
    if (nodeForm(nodeData) !== undefined) return null
    const severity = flaggedIssues(issues, nodeData.path)[0]?.severity
    if (severity === undefined || severity === 'hint') return null
    return severity === 'error'
      ? { colour: editorTheme.error, strength: ERROR_TINT }
      : { colour: editorTheme.warning, strength: WARNING_TINT }
  }

  // A row the editor has just filled in is highlighted over its own style,
  // then fades back to it. A node isn't, as it isn't tinted.
  const marked = filledIn && new Set(filledIn.rows)
  const highlight = (nodeData: NodeData, own: CSSProperties | null, shape: CSSProperties) =>
    marked?.has(toPathString(nodeData.path)) && nodeForm(nodeData) === undefined
      ? highlighted(own, shape, editorTheme.filledIn, filledIn!.fading)
      : own

  return {
    styles: {
      // The vars key takes the `$vars` colour, and a modifier's key is muted
      // and italic (topic 3, "States"): `fallback`, `noCache`, and a `//`
      // whose key shows, since it holds something other than a note
      property: ({ path }) => {
        const row = rowAt(classification, path)
        if (row?.kind?.kind === 'vars') return { color: editorTheme.refVars }
        if (row?.slot?.role === 'modifier' || row?.kind?.kind === 'comment')
          return { color: editorTheme.modifierKey, fontStyle: 'italic' }
        return null
      },
      // A flattened payload's rows line up as the node's own, so its row adds
      // no indent: its margin cancels the pull on its rows (design, topic 1,
      // finding 7). A vars block has a rule down
      // its left edge and a tint, set a little apart from the rows above
      // (topic 5, "The vars block").
      collection: (nodeData) => {
        const row = rowAt(classification, nodeData.path)
        if (row?.payload === 'flattened') return { marginLeft: `${ROWS_PULL}em` }
        if (row?.kind?.kind === 'vars')
          return varsBlock(editorTheme.varsBlock, indent, nodeData.collapsed)
        if (comment(nodeData) === 'lines') return noteBlock(editorTheme.comment)
        const blockTint = tint(nodeData)
        const rowIndent = nodeData.path.length === 0 ? 0 : indent
        const own = blockTint && issueBlock(blockTint, rowIndent, nodeData.collapsed)
        return filledIn ? highlight(nodeData, own, blockShape(rowIndent)) : own
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
        const own = rowTint && issueRow(rowTint)
        return filledIn ? highlight(nodeData, own, ROW_SHAPE) : own
      },
      headerRow: (nodeData) =>
        openLines(nodeData) ? { float: 'right', minHeight: 0, zIndex: 1 } : null,
      // A collapsed row's summary takes the colour of the most severe issue
      // on or beneath it, so a collapsed row hides none (topic 7), and a
      // collapsed node's, after an evaluation, the colour of how it ran
      itemCount: (nodeData) => {
        if (!nodeData.collapsed) return null
        const ran = run?.get(toPathString(nodeData.path))?.status
        if (ran !== undefined && nodeForm(nodeData) !== undefined)
          return { color: runColour(ran, editorTheme), fontWeight: 600 }
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
      // node's border is dotted, and a broken node's is in the error colour,
      // whatever its form (topic 3). After an evaluation, a node that
      // took part has its border in the colour of how it ran (topic 7, "How
      // it ran, in the tree"), but one that never ran keeps its own, since
      // the stylesheet dims it. No broken node takes part, since its errors
      // block the evaluation. Any other collection's rows are pulled back as
      // a node's box is.
      collectionInner: (nodeData) => {
        if (comment(nodeData) === 'lines') return { marginLeft: `-${indent / 2}em` }
        const form = nodeForm(nodeData)
        if (form === undefined || nodeData.collapsed) return { marginLeft: `-${ROWS_PULL}em` }
        const broken =
          brokenIssue(issues, classification, nodeData.path, nodeData.value) !== undefined
        const ran = run?.get(toPathString(nodeData.path))?.status
        const shorthand = form === 'shorthand'
        return {
          ...NODE_BORDER,
          borderStyle: shorthand ? 'dotted' : 'solid',
          borderColor: broken
            ? editorTheme.error
            : shorthand
              ? editorTheme.shorthandBorder
              : editorTheme.nodeBorder,
          ...(ran !== undefined &&
            ran !== 'skipped' && { borderColor: runColour(ran, editorTheme) }),
        }
      },
    },
  }
}

// The tint is the rule's colour, faint, so a host sets both with one value.
// The rule sits left of the block's chevron, which json-edit-react hangs
// left of the key, and the padding puts the key back in line with its
// siblings' (json-edit-react's margin is half the indent). Open, the closing
// bracket ends the block as far above its bottom as the key starts below its
// top; collapsed, the header row is the whole block, already as far.
const varsBlock = (colour: string, indent: number, collapsed?: boolean) => ({
  borderLeft: `${RULE_WIDTH} solid ${colour}`,
  background: `color-mix(in srgb, ${colour} 7%, transparent)`,
  marginTop: '0.4em',
  marginLeft: `calc(${indent / 2}em - ${RULE_GAP} - ${RULE_WIDTH})`,
  paddingLeft: RULE_GAP,
  paddingBottom: collapsed ? 0 : BRACKET_PAD,
  borderRadius: BLOCK_RADIUS,
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

// An issue's tint, with a stripe of its colour down its left edge. A value
// row's starts a little left of the row, and a collection's left of its
// chevron, as a vars block's rule does, each padded so its text stays in line
// with its siblings'.
interface Tint {
  colour: string
  strength: string
}

const ERROR_TINT = '9%'
const WARNING_TINT = '10%'
// As wide as a vars block's rule. An inset shadow, not a border, so it takes
// no room, and a row's text stays put as its tint comes and goes.
const STRIPE_WIDTH = '2px'
const TINT_GAP = '0.4em'

const tintStyle = ({ colour, strength }: Tint) => ({
  background: `color-mix(in srgb, ${colour} ${strength}, transparent)`,
  boxShadow: `inset ${STRIPE_WIDTH} 0 0 ${colour}`,
})

// A tinted block's corners: square on the left, where a rule or a stripe runs
// down it, and rounded on the right
const BLOCK_RADIUS = '0 0.5em 0.5em 0'

const ROW_SHAPE = { marginLeft: `-${TINT_GAP}`, paddingLeft: TINT_GAP, borderRadius: BLOCK_RADIUS }

const issueRow = (tint: Tint) => ({ ...tintStyle(tint), ...ROW_SHAPE })

// `indent` is json-edit-react's, whose margin for the row is half of it
const blockShape = (indent: number) => ({
  marginLeft: `calc(${indent / 2}em - ${RULE_GAP})`,
  paddingLeft: RULE_GAP,
  borderRadius: BLOCK_RADIUS,
})

// Padded below its closing bracket as a vars block is, open, and not at all
// collapsed, where the header row is the whole block
const issueBlock = (tint: Tint, indent: number, collapsed?: boolean) => ({
  ...tintStyle(tint),
  ...blockShape(indent),
  paddingBottom: collapsed ? 0 : BRACKET_PAD,
})

// The filled-in highlight, in the tint's shape, so the row's text stays where
// it is as the highlight comes and goes: much stronger than a tint, then,
// fading, the row's own style, to which its background moves
const highlighted = (
  own: CSSProperties | null,
  shape: CSSProperties,
  colour: string,
  fading: boolean
): CSSProperties => ({
  ...shape,
  ...own,
  ...(fading
    ? { transition: `background-color ${FILLED_IN_FADE_MS}ms ease-out` }
    : { background: `color-mix(in srgb, ${colour} ${FILLED_IN_STRENGTH}, transparent)` }),
})

const FILLED_IN_STRENGTH = '40%'

// How long the highlight shows, then how long it takes to fade
export const FILLED_IN_SHOWN_MS = 3000
export const FILLED_IN_FADE_MS = 1000

// A warning's text: its colour, darkened to read on a light background
export const warningText = (warning: string) => `color-mix(in srgb, ${warning}, black 35%)`

// Text on the filled-in colour, which is too light for white: the colour,
// darkened almost to black
export const filledInText = (filledIn: string) => `color-mix(in srgb, ${filledIn}, black 80%)`

const RULE_WIDTH = '2px'
const RULE_GAP = '1.35em' // from the rule to the key
// The space above a row's text: json-edit-react's rows are at least 1.7em,
// with a 1em line centred in them. A closing bracket's line is only the 1em,
// so a block ending in one is padded by this below it.
const BRACKET_PAD = '0.35em'

// How far a collection's rows are pulled back left of json-edit-react's
// indent, in em: a node's box, so it sits under its key's chevron, and any
// other collection's rows, so they sit closer. One value for every
// collection, so a row that changes kind at the same path, as a conversion
// makes it, keeps its rows' margin and changes only its own, which
// json-edit-react 2.0.2's collapse transition doesn't animate.
const ROWS_PULL = 1

const NODE_BORDER = {
  borderWidth: '2px',
  borderRadius: '0.75em',
  padding: '0.5em',
  marginBottom: '0.5em',
  marginLeft: `-${ROWS_PULL}em`,
}

// The colour of how a row ran
export const runColour = (status: TraceStatus, editorTheme: EditorTheme) =>
  ({
    value: editorTheme.runValue,
    failed: editorTheme.runFailed,
    fallback: editorTheme.runFallback,
    cancelled: editorTheme.runCancelled,
    skipped: editorTheme.runSkipped,
  })[status]

// Text in the colour of how a row ran, the light ones darkened to read on a
// card's white, as a warning's text is
export const runText = (status: TraceStatus, editorTheme: EditorTheme) => {
  const colour = runColour(status, editorTheme)
  return status === 'fallback' || status === 'skipped'
    ? `color-mix(in srgb, ${colour}, black 30%)`
    : colour
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
