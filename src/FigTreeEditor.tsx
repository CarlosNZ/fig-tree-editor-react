import { useEffect, useInsertionEffect, useMemo } from 'react'
import {
  JsonEditor,
  type CustomTextDefinitions,
  type DefaultValueFunction,
  type JsonEditorProps,
  type NewKeyOptionsFunction,
} from 'json-edit-react'
import { type FigTree, type Issue } from 'fig-tree-evaluator'
import { attachIssues } from './attachIssues'
import { classify, rowAt, type Classification } from './classify'
import { customNodeDefinitions } from './customNodeDefinitions'
import {
  buildDisplayData,
  type CategoryHintsProp,
  type DisplayData,
  type OperatorHintsProp,
} from './displayData'
import { layerTheme, mergeEditorTheme, type EditorTheme } from './editorTheme'
import { fillAndTidy } from './fillAndTidy'
import { getStartingElement } from './getStartingValue'
import { addableKeys, getNewKeyValue } from './parameterOptions'
import { injectStyles } from './injectStyles'
import { displayPath } from './paths'
import { strings } from './strings'
import { useStableValue } from './useStableValue'

// Expressions are typed `unknown`, as fig-tree's own methods take them: any
// JSON value is an expression, and `validate()` is what says whether it's a
// good one. The rest are json-edit-react's props, less those the editor
// replaces with its own: passing one of those is a type error.
//
// Every change reaches `setExpression`, complete. A write the author didn't
// make, filling in an expression that arrived from outside, is marked
// `autoUpdate`, so a host keeping history can record it in place (`useUndo`'s
// `replace`) rather than as a step.
export interface SetExpressionOptions {
  autoUpdate?: boolean
}

export interface FigTreeEditorProps extends Omit<
  JsonEditorProps,
  | 'data'
  | 'setData'
  | 'allowTypeSelection'
  | 'newKeyOptions'
  | 'defaultValue'
  | 'customNodeDefinitions'
> {
  figTree: FigTree
  expression: unknown
  setExpression: (expression: unknown, options?: SetExpressionOptions) => void
  operatorHints?: OperatorHintsProp
  categoryHints?: CategoryHintsProp
  editorTheme?: Partial<EditorTheme>
}

export const FigTreeEditor = ({
  figTree,
  expression,
  setExpression,
  operatorHints,
  categoryHints,
  editorTheme,
  className,
  theme,
  customText,
  ...props
}: FigTreeEditorProps) => {
  useInsertionEffect(() => {
    injectStyles()
  }, [])

  // Everything below is worked out on every render rather than memoised on
  // the expression: it also depends on the instance's registry, which
  // `updateOptions()` changes without changing the instance's identity. What
  // components receive keeps its identity while its content is unchanged, so
  // the definitions change only when a row's kind, slot or scope does, which
  // has to re-render every row (design, topic 1, finding 6).
  const operators = figTree.getOperators()
  const fragments = figTree.getFragments()
  const displayData = useStableValue(
    buildDisplayData({ operators, fragments, operatorHints, categoryHints })
  )
  const mergedEditorTheme = useStableValue(mergeEditorTheme(editorTheme))

  // An expression, filled in and tidied (the fill-in step). The issues are
  // the ones `fillAndTidy`'s typo guard reads.
  const fill = (value: unknown, issues = figTree.validate(value).issues) =>
    fillAndTidy(value, { operators, fragments, displayData, issues }).expression

  // The editor shows the expression as it writes it. One that arrives
  // incomplete or out of order (a load, an undo, the host's own change, or a
  // registry that now declares more) is written back once, marked; one that
  // needs nothing produces no write, so re-rendering never re-emits.
  const arrivalIssues = figTree.validate(expression).issues
  const filled = fill(expression, arrivalIssues)
  const changed = filled !== expression
  const stableFilled = useStableValue(filled)
  const shown = changed ? stableFilled : expression
  const issues = changed ? figTree.validate(shown).issues : arrivalIssues

  // `setExpression` is left out on purpose: a host's inline setter is new on
  // every render, and the write must happen once per change, not per render
  useEffect(() => {
    if (changed) setExpression(stableFilled, { autoUpdate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, stableFilled])

  const classification = useStableValue(classify(shown, { operators, fragments }))
  const issueIndex = useStableValue(attachIssues(issues, classification))
  const definitions = useMemo(
    () =>
      customNodeDefinitions({
        figTree,
        classification,
        displayData,
        issues: issueIndex,
        editorTheme: mergedEditorTheme,
      }),
    [figTree, classification, displayData, issueIndex, mergedEditorTheme]
  )

  // Memoised on what the definitions are: json-edit-react passes both to every
  // collection row, so a new function re-renders every row
  const defaultValue = useMemo(
    () => newValue(figTree, classification, displayData),
    [figTree, classification, displayData]
  )
  const newKeyOptions = useMemo(() => newKeys(figTree, classification), [figTree, classification])

  const layeredTheme = useMemo(
    () =>
      layerTheme(theme, {
        classification,
        issues: issueIndex,
        editorTheme: mergedEditorTheme,
      }),
    [theme, classification, issueIndex, mergedEditorTheme]
  )
  const combinedText = useMemo(
    () => combineText(editorText(classification), customText),
    [classification, customText]
  )

  return (
    <>
      <JsonEditor
        {...editorDefaults}
        {...props}
        className={className ? `ft-editor ${className}` : 'ft-editor'}
        theme={layeredTheme}
        customText={combinedText}
        customNodeDefinitions={definitions}
        defaultValue={defaultValue}
        newKeyOptions={newKeyOptions}
        data={shown}
        setData={(data) => setExpression(fill(data))}
      />
      {issues.length > 0 && <IssueList issues={issues} />}
    </>
  )
}

// json-edit-react props the editor sets, which a host can override. They
// change only how the tree looks.
const editorDefaults = {
  showArrayIndexes: false,
  indent: 2,
  collapse: 2,
  stringTruncateLength: 100,
} satisfies Partial<JsonEditorProps>

// What json-edit-react's ＋ adds. An array's new element starts by the
// element rule; a key added to a node starts as the toolbar's "Add parameter"
// would start it, and any other key as anything.
const newValue =
  (figTree: FigTree, classification: Classification, displayData: DisplayData) =>
  ({ path, value }: Parameters<DefaultValueFunction>[0], newKey = '') => {
    const operators = figTree.getOperators()
    if (Array.isArray(value))
      return getStartingElement(path, value, { classification, operators, displayData })
    return getNewKeyValue(newKey, rowAt(classification, path)?.kind, {
      operators,
      displayData,
      useCache: figTree.getOptions().useCache,
    })
  }

// The keys json-edit-react's ＋ offers: on a node, the same list as "Add
// parameter", by name; elsewhere, a free-typed key (`null`). json-edit-react
// leaves out those already present.
const newKeys =
  (figTree: FigTree, classification: Classification) =>
  ({ path, value }: Parameters<NewKeyOptionsFunction>[0]) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const keys = addableKeys(value as Record<string, unknown>, rowAt(classification, path)?.kind, {
      operators: figTree.getOperators(),
    })
    return keys && [...keys.parameters, ...keys.modifiers].map(({ key }) => key)
  }

// A collapsed node's summary, in place of json-edit-react's item count
// (design, topic 3, "Collapsed nodes")
const editorText = (classification: Classification): CustomTextDefinitions => {
  const summary = ({ path }: { path: (string | number)[] }) => {
    const kind = rowAt(classification, path)?.kind
    if (kind?.kind !== 'operator' || kind.form !== 'full') return null
    return strings.FT_SUMMARY_OPERATOR(kind.name ?? strings.FT_INVALID_NODE)
  }
  return { ITEM_SINGLE: summary, ITEMS_MULTIPLE: summary }
}

// The host's entry applies wherever the editor's gives nothing
const combineText = (
  editor: CustomTextDefinitions,
  host: CustomTextDefinitions = {}
): CustomTextDefinitions => {
  const keys = new Set([...Object.keys(editor), ...Object.keys(host)]) as Set<
    keyof CustomTextDefinitions
  >
  return Object.fromEntries(
    [...keys].map((key) => [
      key,
      (nodeData: Parameters<NonNullable<CustomTextDefinitions[typeof key]>>[0]) =>
        editor[key]?.(nodeData) ?? host[key]?.(nodeData) ?? null,
    ])
  )
}

const severityLabel = {
  error: strings.FT_SEVERITY_ERROR,
  warning: strings.FT_SEVERITY_WARNING,
  hint: strings.FT_SEVERITY_HINT,
}

// TO-DO: replace with the diagnostics UI from the design phase (plan, Phase 10)
const IssueList = ({ issues }: { issues: Issue[] }) => (
  <ul className="ft-issues">
    {issues.map((issue, index) => (
      <li key={index} className={`ft-issue ft-issue-${issue.severity}`}>
        <span className="ft-issue-severity">{severityLabel[issue.severity]}</span>
        <code className="ft-issue-path">{displayPath(issue.path) || strings.FT_ROOT_PATH}</code>
        <span className="ft-issue-message">{issue.message}</span>
      </li>
    ))}
  </ul>
)
