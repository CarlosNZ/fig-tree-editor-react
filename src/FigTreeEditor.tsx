import {
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type Ref,
} from 'react'
import {
  JsonEditor,
  type CustomTextDefinitions,
  type DefaultValueFunction,
  type FilterFunction,
  type JsonEditorHandle,
  type JsonEditorProps,
  type NewKeyOptionsFunction,
  type NodeData,
  type OnCollapseFunction,
  type OnEditEventFunction,
  type TypeFilterFunction,
  toPathString,
} from 'json-edit-react'
import { type FigTree } from 'fig-tree-evaluator'
import {
  attachIssues,
  attachToNodes,
  issuesBeneath,
  rollUpIssues,
  type IssueRollUp,
} from './attachIssues'
import { canonicalPath, classify, rowAt, type Classification, type Row } from './classify'
import {
  clearCollapseRecord,
  emptyCollapseRecord,
  pruneCollapseRecord,
  recordToggle,
  recordedState,
  type CollapseRecord,
} from './collapseRecord'
import { type ReferenceNames } from './conversions'
import { commentPart, settleCommentLines } from './comments'
import { customNodeDefinitions, type CreatedNode } from './customNodeDefinitions'
import {
  buildDisplayData,
  type CategoryHintsProp,
  type DisplayData,
  type OperatorHintsProp,
} from './displayData'
import {
  FILLED_IN_FADE_MS,
  FILLED_IN_SHOWN_MS,
  layerTheme,
  mergeEditorTheme,
  type EditorTheme,
} from './editorTheme'
import {
  cancelledEvaluation,
  createEvaluator,
  evaluateSubTree,
  type Evaluation,
  type EvaluatorHandlers,
} from './evaluation'
import { fillAndTidy, withoutHeldBack } from './fillAndTidy'
import {
  confirmFilledIn,
  dismissFilledIn,
  filledInKey,
  NO_FILLED_IN,
  recordFilledIn,
  standingFilledIn,
} from './filledIn'
import { type DefaultOperators } from './getStartingNode'
import { canAdd, canDelete, type GuardContext } from './guards'
import { getStartingElement } from './getStartingValue'
import { addableKeys, getNewKeyValue } from './parameterOptions'
import { injectStyles } from './injectStyles'
import { Messages } from './Messages'
import { countMessages, orderMessages } from './messageLines'
import { getQuickFixes } from './quickFixes'
import { valueAt, type Path } from './paths'
import { revealRow } from './revealRow'
import { markRun, type RunMarks } from './runMarks'
import { buildSubTree } from './subTree'
import {
  sameStatus,
  type EditorMessage,
  type EditorStatus,
  type FigTreeEditorHandle,
} from './status'
import { strings } from './strings'
import { toGetNodeButton } from './ToGetNodeButton'
import { typeOptions } from './typeOptions'
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
  // Until json-edit-react can keep a drop within its own array (J4), dragging
  // is disabled
  | 'allowDrag'
  | 'editorRef'
> {
  figTree: FigTree
  expression: unknown
  setExpression: (expression: unknown, options?: SetExpressionOptions) => void
  operatorHints?: OperatorHintsProp
  categoryHints?: CategoryHintsProp
  editorTheme?: Partial<EditorTheme>
  defaultOperators?: DefaultOperators
  defaultFragment?: string
  referenceNames?: ReferenceNames // $data or $d, wherever the editor writes a reference
  // What `$data` is in `validate()`'s sample-data check, in place of the
  // instance's own `data`, so a host sharing its instance needn't change it
  evaluationData?: Record<string, unknown>
  // The messages area's height before it scrolls; `0` hides it, for a host
  // that shows the editor's messages itself
  messagesMaxHeight?: number | string
  // The editor's state, each time it changes: whether there are errors, the
  // counts, whether an edit is open, and the messages area's lines
  onStatusChange?: (status: EditorStatus) => void
  // What an evaluation does with a failure no `fallback` caught: `report`
  // completes the rest and lists every failure, `throw` fails the row at the
  // first, as a host evaluating in throw mode would see it
  evaluationMode?: 'report' | 'throw'
  onEvaluateStart?: (start: { path: Path }) => void
  // Each evaluation as it ends, done, failed or cancelled: one per start
  onEvaluate?: (evaluation: Evaluation) => void
  editorRef?: Ref<FigTreeEditorHandle> // json-edit-react's handle, with `reveal`
}

export const FigTreeEditor = ({
  figTree,
  expression,
  setExpression,
  defaultOperators,
  defaultFragment,
  referenceNames = 'canonical',
  evaluationData,
  messagesMaxHeight = DEFAULT_MESSAGES_MAX_HEIGHT,
  onStatusChange,
  evaluationMode = 'report',
  onEvaluateStart,
  onEvaluate,
  operatorHints,
  categoryHints,
  editorTheme,
  className,
  theme,
  customText,
  allowDelete,
  allowAdd,
  collapse = DEFAULT_COLLAPSE,
  onCollapse,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidth = DEFAULT_MAX_WIDTH,
  id,
  editorRef,
  onEditEvent,
  customButtons: hostButtons,
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
  const stableDefaultOperators = useStableValue(defaultOperators)
  const created = useRef<CreatedNode | null>(null)

  const validate = (value: unknown) =>
    figTree.validate(value, evaluationData === undefined ? undefined : { data: evaluationData })
      .issues

  // An expression, filled in and tidied (the fill-in step), with the rows it
  // filled. The issues are the ones `fillAndTidy`'s typo guard reads.
  const fillWithRows = (value: unknown, issues = validate(value)) =>
    fillAndTidy(value, { operators, fragments, displayData, issues })
  const fill = (value: unknown) => fillWithRows(value).expression

  // The editor shows the expression as it writes it. One that arrives
  // incomplete or out of order (a load, an undo, the host's own change, or a
  // registry that now declares more) is written back once, marked; one that
  // needs nothing produces no write, so re-rendering never re-emits.
  const arrivalIssues = validate(expression)
  const arrival = fillWithRows(expression, arrivalIssues)
  const changed = arrival.expression !== expression
  const stableFilled = useStableValue(arrival.expression)
  const shown = changed ? stableFilled : expression
  const classification = useStableValue(classify(shown, { operators, fragments }))
  const issues = withoutHeldBack(changed ? validate(shown) : arrivalIssues, classification)

  // The values those writes have added, which the messages area lists
  // (filledIn.ts), and the rows the latest one filled, marked for a few
  // seconds
  const [filledIn, setFilledIn] = useState(NO_FILLED_IN)
  // Until the write's effect records them, its values count from the render
  // that shows them, so the lines and a host's status have them from the
  // first
  const recorded = useRef<unknown>(null)
  const record =
    changed && arrival.filled.length > 0 && recorded.current !== stableFilled
      ? recordFilledIn(filledIn, arrival.filled, stableFilled, classification)
      : filledIn
  const [marker, setMarker] = useState<{ keys: ReadonlySet<string>; fading: boolean } | null>(null)

  // `setExpression` is left out on purpose: a host's inline setter is new on
  // every render, and the write must happen once per change, not per render
  useEffect(() => {
    if (!changed) return
    setExpression(stableFilled, { autoUpdate: true })
    if (arrival.filled.length === 0) return
    recorded.current = stableFilled
    setFilledIn((record) => recordFilledIn(record, arrival.filled, stableFilled, classification))
    const keys = new Set(arrival.filled.map((path) => filledInKey(path, classification)))
    setMarker({ keys, fading: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, stableFilled])

  // The marker shows, then fades, then goes
  useEffect(() => {
    if (marker === null) return
    const timer = setTimeout(
      () => setMarker(marker.fading ? null : { ...marker, fading: true }),
      marker.fading ? FILLED_IN_FADE_MS : FILLED_IN_SHOWN_MS
    )
    return () => clearTimeout(timer)
  }, [marker])

  // Read by the collapse filter, which keeps its identity across edits
  const latestClassification = useRef(classification)
  latestClassification.current = classification
  const issueIndex = useStableValue(attachIssues(issues, classification))
  const nodeIssueIndex = useStableValue(attachToNodes(issues, classification))
  const rollUp = useStableValue(rollUpIssues(issues, classification))
  // Each Evaluate, one at a time (evaluation.ts). The evaluator keeps its
  // identity, reading the latest props as each evaluation starts and ends,
  // and one still running as the editor goes is cancelled, and reported so.
  const evaluationHandlers = useRef<EvaluatorHandlers | null>(null)
  const evaluator = useMemo(() => createEvaluator(() => evaluationHandlers.current!), [])
  useEffect(() => () => evaluator.cancel(), [evaluator])

  // How the rows ran in the latest evaluation, marked on them (design, topic
  // 7, "How it ran, in the tree"), with the expression it evaluated. They
  // show only while that is the expression shown, since their paths may not
  // be the rows' in another, so they go as it changes, even while the
  // evaluation runs, and as an edit starts, or another evaluation does.
  const [run, setRun] = useState<{ marks: RunMarks; expression: unknown } | null>(null)
  const runMarks = run !== null && run.expression === shown ? run.marks : null
  useEffect(() => {
    if (run !== null && run.expression !== shown) setRun(null)
  }, [run, shown])

  const definitions = useMemo(
    () =>
      customNodeDefinitions({
        figTree,
        classification,
        displayData,
        issues: issueIndex,
        nodeIssues: nodeIssueIndex,
        editorTheme: mergedEditorTheme,
        defaultOperators: stableDefaultOperators,
        defaultFragment,
        referenceNames,
        created,
        evaluator,
        run: runMarks,
      }),
    [
      figTree,
      classification,
      displayData,
      issueIndex,
      nodeIssueIndex,
      mergedEditorTheme,
      stableDefaultOperators,
      defaultFragment,
      referenceNames,
      evaluator,
      runMarks,
    ]
  )

  // The editor's buttons come first, after json-edit-react's own tools, and
  // then the host's
  const customButtons = useMemo(
    () => [
      toGetNodeButton({ classification, editorTheme: mergedEditorTheme, referenceNames }),
      ...(hostButtons ?? []),
    ],
    [classification, mergedEditorTheme, referenceNames, hostButtons]
  )

  // Memoised on what the definitions are: json-edit-react passes both to every
  // collection row, so a new function re-renders every row
  const defaultValue = useMemo(
    () => newValue(figTree, classification, displayData),
    [figTree, classification, displayData]
  )
  const newKeyOptions = useMemo(() => newKeys(figTree, classification), [figTree, classification])
  const allowTypeSelection = useMemo(
    () => typesFor(figTree, classification),
    [figTree, classification]
  )
  const guards = useMemo(() => {
    const context: GuardContext = {
      classification,
      operators: figTree.getOperators(),
      fragments: figTree.getFragments(),
    }
    return {
      allowDelete: combineFilter(allowDelete, (nodeData) => canDelete(nodeData, context)),
      allowAdd: combineFilter(allowAdd, (nodeData) => canAdd(nodeData, context)),
    }
  }, [figTree, classification, allowDelete, allowAdd])

  // A quick fix clicked while an edit was open, waiting for that edit's
  // commit, and applied to what it produces, in the same write (plan, 10.2c)
  const pendingFix = useRef<((expression: unknown) => unknown) | null>(null)

  // A node the type dropdown created is marked for this commit only: where
  // the commit doesn't carry it, the host's `onUpdate` rejected it. A comment
  // a write leaves a line short of two is settled in the same write.
  const commit = (data: unknown) => {
    const fix = pendingFix.current
    pendingFix.current = null
    const next = fix ? fix(data) : data
    const mark = created.current
    if (mark && valueAt(next, mark.path) !== mark.node) created.current = null
    setExpression(fill(settleCommentLines(latest.current, next, latestClassification.current)))
  }

  // Whether json-edit-react has an edit open, followed through its events,
  // and whether the one a quick fix confirmed was submitted. An edit's commit
  // writes before its `commit*` event, so a waiting fix has gone into that
  // write by then, unless the edit changed nothing, when it applies on the
  // event. A cancelled or rejected edit takes the waiting fix with it.
  const editOpen = useRef(false)
  const submitted = useRef(false)
  const latest = useRef(shown)
  latest.current = shown

  // A row's evaluation, from the expression and props as they are when it
  // starts, which its marks are drawn against as it ends
  const evaluating = useRef<{
    expression: unknown
    classification: Classification
    row: Path
  } | null>(null)
  evaluationHandlers.current = {
    prepare: (path) => {
      const context = { classification: latestClassification.current, operators }
      const subTree = buildSubTree(latest.current, path, context)
      if (subTree === null) return null
      evaluating.current = {
        expression: latest.current,
        classification: context.classification,
        row: subTree.row,
      }
      const options = { mode: evaluationMode, data: evaluationData }
      return {
        start: (signal) => evaluateSubTree(figTree, path, subTree, { ...options, signal }),
        cancelled: () => cancelledEvaluation(path, subTree, evaluationMode),
      }
    },
    onStart: (path) => {
      setRun(null)
      onEvaluateStart?.({ path })
    },
    onEvaluate: (evaluation) => {
      const started = evaluating.current
      const marks = started && markRun(evaluation, started.classification, started.row)
      if (marks) setRun({ marks, expression: started.expression })
      onEvaluate?.(evaluation)
    },
  }
  const followEdits: OnEditEventFunction = (editEvent) => {
    const { event } = editEvent
    if (event.startsWith('start')) {
      editOpen.current = true
      if (run !== null) setRun(null)
    }
    if (event.startsWith('submit')) submitted.current = true
    if (event === 'commitEdit' && filledIn.size > 0) {
      const path = canonicalPath(latestClassification.current, editEvent.path)
      setFilledIn((record) => confirmFilledIn(record, path))
    }
    if (event.startsWith('commit')) {
      editOpen.current = false
      const fix = pendingFix.current
      pendingFix.current = null
      if (fix) commit(fix(latest.current))
    }
    if (event.startsWith('cancel') || event === 'updateError') {
      editOpen.current = false
      pendingFix.current = null
    }
    // Once the event's handler has finished, so the toolbar's commit and
    // reopen, made in one, never reports the session closed
    if (statusListener.current) queueMicrotask(report)
    onEditEvent?.(editEvent)
  }

  // A quick fix, applied to the expression as it stands. An open edit is
  // committed first, keeping its changes, as json-edit-react commits an edit
  // another displaces, and the fix applies to what it produces, never to the
  // expression from before it, which would undo an edit elsewhere. An edit
  // whose commit is refused, such as raw JSON that doesn't parse, stays open
  // with its error, and the fix isn't applied.
  const applyFix = (fix: (expression: unknown) => unknown) => {
    if (!editOpen.current) return commit(fix(latest.current))
    pendingFix.current = fix
    submitted.current = false
    handle.current?.confirm()
    if (!submitted.current) pendingFix.current = null
  }
  // A host holds the fixes of the last status it was given, which may be
  // several renders old, so each applies through this render's code
  const latestApplyFix = useRef(applyFix)
  latestApplyFix.current = applyFix

  // The author's collapse toggles, recorded by canonical path, so rows keep
  // their state through a conversion (plan, 8.4)
  const collapseRecord = useRef(emptyCollapseRecord())
  const recordCollapse: OnCollapseFunction = (nodeData) => {
    const { path, collapsed, includeChildren } = nodeData
    const at = canonicalPath(latestClassification.current, path)
    recordToggle(collapseRecord.current, at, collapsed, includeChildren)
    onCollapse?.(nodeData)
  }
  // json-edit-react resets every row to its collapse filter when the filter
  // changes, so it changes only with the host's `collapse`, and the record
  // goes with it, as the reset replaces every toggle. It goes during the
  // render, since the rows reset in their own effects, before this
  // component's would run.
  const collapseFilter = useMemo(() => {
    clearCollapseRecord(collapseRecord.current)
    return combineCollapse(collapse, latestClassification, collapseRecord)
  }, [collapse])
  // The toggles of rows no longer in the tree go
  useEffect(() => {
    pruneCollapseRecord(collapseRecord.current, shown, classification)
  }, [shown, classification])

  // The filled-in lines that stand, and the rows among them the marker is on
  const filledInLines = record.size === 0 ? [] : standingFilledIn(record, shown, classification)
  const markedRows = useStableValue(
    marker && {
      rows: filledInLines
        .filter(({ key }) => marker.keys.has(key))
        .map(({ row }) => toPathString(row)),
      fading: marker.fading,
    }
  )

  const indent = props.indent ?? editorDefaults.indent
  const layeredTheme = useMemo(
    () =>
      layerTheme(theme, {
        classification,
        issues: issueIndex,
        rollUp,
        editorTheme: mergedEditorTheme,
        indent,
        filledIn: markedRows,
        run: runMarks,
      }),
    [theme, classification, issueIndex, rollUp, mergedEditorTheme, indent, markedRows, runMarks]
  )
  // json-edit-react's handle, which the editor uses too, to open the rows
  // above one it reveals. The host's is one object for the editor's
  // lifetime, passing each call to json-edit-react's current handle, which
  // json-edit-react makes anew as its props change.
  const handle = useRef<JsonEditorHandle | null>(null)
  const outer = useRef<HTMLDivElement>(null)
  const hostHandle = useMemo<FigTreeEditorHandle>(
    () => ({
      collapse: (state) => handle.current?.collapse(state),
      startEdit: (options) => handle.current?.startEdit(options) ?? 'PATH_NOT_FOUND',
      confirm: () => handle.current?.confirm(),
      cancel: () => handle.current?.cancel(),
      reveal: ({ path }) => {
        if (valueAt(latest.current, path) === undefined) return 'PATH_NOT_FOUND'
        if (outer.current && handle.current) revealRow(outer.current, path, handle.current.collapse)
        return true
      },
    }),
    []
  )
  useLayoutEffect(() => {
    setRef(editorRef, hostHandle)
    return () => setRef(editorRef, null)
  }, [editorRef, hostHandle])

  const dismiss = (key: string) => setFilledIn((record) => dismissFilledIn(record, key))

  // The messages area's lines, which a host listening for the status receives
  // too, worked out only for one or the other
  const messages: EditorMessage[] =
    messagesMaxHeight === 0 && !onStatusChange
      ? []
      : orderMessages(issues, filledInLines, shown, classification).map((line) =>
          line.kind === 'issue'
            ? {
                kind: 'issue',
                issue: line.issue,
                row: line.row,
                message: line.issue.message,
                fixes: getQuickFixes(line.issue, shown, {
                  classification,
                  operators,
                  fragments,
                }).map(({ label, fix }) => ({ label, apply: () => latestApplyFix.current(fix) })),
              }
            : {
                kind: 'filledIn',
                row: line.row,
                message: line.message,
                fixes: [{ label: strings.FT_DISMISS, apply: () => dismiss(line.key) }],
              }
        )

  // The status goes to a listening host whenever its content changes: after
  // a render, and after an edit opens or closes, which needn't re-render
  const statusListener = useRef(onStatusChange)
  statusListener.current = onStatusChange
  const latestMessages = useRef(messages)
  latestMessages.current = messages
  const reported = useRef<EditorStatus | null>(null)
  const report = () => {
    if (!statusListener.current) return
    const counts = countMessages(latestMessages.current)
    const status: EditorStatus = {
      valid: counts.errors === 0,
      counts,
      editing: editOpen.current,
      messages: latestMessages.current,
    }
    if (reported.current && sameStatus(reported.current, status)) return
    reported.current = status
    statusListener.current(status)
  }
  useEffect(report)

  const combinedText = useMemo(
    () => combineText(editorText(classification, rollUp, customText), customText),
    [classification, rollUp, customText]
  )

  // The tree and its messages share an outer container, which takes the
  // width the host gives the editor, and in which the tree sets the width:
  // the messages area takes the tree's, and never widens it (design, topic 7).
  // The host's `id` is the editor's, so it goes on that container, where a
  // host can reach either part of one instance from it.
  return (
    <div
      ref={outer}
      id={id}
      className="ft-outer-container"
      style={{ minWidth, maxWidth, fontSize: props.baseFontSize ?? DEFAULT_FONT_SIZE }}
    >
      <JsonEditor
        {...editorDefaults}
        {...props}
        minWidth={0}
        maxWidth="100%"
        editorRef={handle}
        onEditEvent={followEdits}
        className={className ? `ft-editor ${className}` : 'ft-editor'}
        theme={layeredTheme}
        customText={combinedText}
        collapse={collapseFilter}
        onCollapse={recordCollapse}
        customNodeDefinitions={definitions}
        customButtons={customButtons}
        defaultValue={defaultValue}
        newKeyOptions={newKeyOptions}
        allowTypeSelection={allowTypeSelection}
        {...guards}
        allowDrag={false}
        data={shown}
        setData={commit}
      />
      {messagesMaxHeight !== 0 && (
        <Messages
          messages={messages}
          maxHeight={messagesMaxHeight}
          editorTheme={mergedEditorTheme}
          onReveal={(path) => hostHandle.reveal({ path })}
          onDismissAll={() => setFilledIn(NO_FILLED_IN)}
        />
      )}
    </div>
  )
}

// json-edit-react props the editor sets, which a host can override. They
// change how the tree looks and where a click collapses it.
const editorDefaults = {
  showArrayIndexes: false,
  indent: 3,
  stringTruncateLength: 100,
  // A collection's left edge doesn't collapse it, so a node's toolbar, which
  // can wrap onto that edge, gets every click
  collapseClickZones: ['header'],
} satisfies Partial<JsonEditorProps>

const DEFAULT_COLLAPSE = 2
const DEFAULT_MESSAGES_MAX_HEIGHT = '15em'

// json-edit-react's own defaults for its container (250px and 600px), which
// the outer container takes in its place, in ems of the default font size, so
// the editor's size is unchanged by it and scales with `baseFontSize`
const DEFAULT_MIN_WIDTH = '15.625em'
const DEFAULT_MAX_WIDTH = 'min(37.5em, 90vw)'
const DEFAULT_FONT_SIZE = '16px'

// A comment never starts collapsed, since a multi-line comment is a level
// deeper than its node's parameters, and would otherwise open as a count
// (design, topic 5, "Comments"). A row the author has toggled mounts as they
// left it; any other takes the host's `collapse`. A numeric `collapse` counts
// levels as drawn (design,
// topic 1, "Flattened payloads and unlabelled rows"): a flattened payload's
// rows show as its node's own, so its row isn't a level, and a fragment
// call's arguments collapse where an operator's parameters do.
// json-edit-react never collapses the flattened row itself, which has no
// collection wrapper. A boolean or a host's filter applies as it is.
const combineCollapse = (
  host: boolean | number | FilterFunction,
  classification: { current: Classification },
  record: { current: CollapseRecord }
): FilterFunction => {
  const hostCollapses = hostFilter(host, classification)
  return (nodeData) =>
    commentPart(classification.current, nodeData) !== 'lines' &&
    (recordedState(record.current, canonicalPath(classification.current, nodeData.path)) ??
      hostCollapses(nodeData))
}

const hostFilter = (
  host: boolean | number | FilterFunction,
  classification: { current: Classification }
): FilterFunction => {
  if (typeof host === 'function') return host
  if (typeof host === 'boolean') return () => host
  const flattened = (path: Path) => rowAt(classification.current, path)?.payload === 'flattened'
  return ({ path, level }) => {
    const hidden = path.filter((_, index) => flattened(path.slice(0, index)))
    return level - hidden.length >= host
  }
}

// What json-edit-react's ＋ adds. A comment's new line is a placeholder note,
// and any other array's new element starts by the element rule. A key added
// to a node starts as the toolbar's "Add parameter" would start it; elsewhere
// outside quoted content, `//` is a comment, as on a node, and `vars` on a
// plain object a block (design, topic 5); and any other key starts as
// anything.
const newValue =
  (figTree: FigTree, classification: Classification, displayData: DisplayData) =>
  (nodeData: Parameters<DefaultValueFunction>[0], newKey = '') => {
    const { path, value } = nodeData
    const operators = figTree.getOperators()
    if (commentPart(classification, nodeData) === 'lines') return strings.FT_NEW_COMMENT
    if (Array.isArray(value))
      return getStartingElement(path, value, { classification, operators, displayData })
    const row = rowAt(classification, path)
    if (newKey === '//' && row !== undefined) return strings.FT_NEW_COMMENT
    if (newKey === 'vars' && isPlainObjectRow(row)) return {}
    return getNewKeyValue(newKey, row?.kind, { operators, displayData })
  }

// A plain object whose values are evaluated: the walk gives it a slot, as it
// does every evaluated value, and finds no node there. Quoted content has no
// row, and a flattened payload's keys are its node's parameters.
const isPlainObjectRow = (row: Row | undefined) =>
  row?.slot !== undefined &&
  row.payload !== 'flattened' &&
  (row.kind === undefined || row.kind.kind === 'container')

// The keys json-edit-react's ＋ offers: on a node, the same list as "Add
// parameter", by name, less the entries that don't add a key to the node
// itself; elsewhere, a free-typed key (`null`). json-edit-react leaves out
// those already present.
const newKeys =
  (figTree: FigTree, classification: Classification) =>
  ({ path, value }: Parameters<NewKeyOptionsFunction>[0]) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const keys = addableKeys(
      value as Record<string, unknown>,
      path,
      rowAt(classification, path)?.kind,
      { classification, operators: figTree.getOperators(), fragments: figTree.getFragments() }
    )
    return (
      keys &&
      [...keys.parameters, ...keys.modifiers]
        .filter(({ key, argument, label }) => !argument && label === undefined && !(key in value))
        .map(({ key }) => key)
    )
  }

// The host's filter, and the editor's: the editor only adds restrictions
const combineFilter = (
  host: boolean | FilterFunction | undefined,
  editor: FilterFunction
): FilterFunction => {
  if (host === false) return () => false
  if (typeof host === 'function') return (nodeData) => host(nodeData) && editor(nodeData)
  return editor
}

// Each value row's type dropdown, from its slot and the fragments registered
// when it opens. A comment has none, since it is always a string (plan, 9.4).
const typesFor =
  (figTree: FigTree, classification: Classification) =>
  ({ path, value, parentData, fullData }: Parameters<TypeFilterFunction>[0]) => {
    const part = commentPart(classification, { path, value, parentData })
    if (part === 'note' || part === 'line') return false
    return typeOptions(rowAt(classification, path), value, fullData, figTree.getFragments())
  }

// A collapsed node's summary, in place of json-edit-react's item count
// (design, topic 3, "Collapsed nodes"), and a vars block's count of vars,
// leaving out a `//` among them. A collapsed row with more than one issue on
// or beneath it, a plain collection included, counts them after its summary
// (topic 7, "Where issues attach"). The item count of a plain collection
// that does is the editor's wording, or the host's `customText`. A ＋ that
// takes a typed key prompts for what the key names, where the editor knows.
const editorText = (
  classification: Classification,
  rollUp: IssueRollUp,
  host: CustomTextDefinitions = {}
): CustomTextDefinitions => {
  const withIssues =
    (key: 'ITEM_SINGLE' | 'ITEMS_MULTIPLE') =>
    (nodeData: NodeData): string | null => {
      const text = summary(nodeData)
      const { errors, warnings } = issuesBeneath(rollUp, nodeData.path)
      if (!nodeData.collapsed || errors + warnings < 2) return text
      const base = text ?? host[key]?.(nodeData) ?? strings.FT_ITEMS(nodeData.size ?? 0)
      return strings.FT_SUMMARY_ISSUES(base, strings.FT_ISSUE_COUNTS(errors, warnings))
    }
  const summary = ({ path, value }: NodeData) => {
    const kind = rowAt(classification, path)?.kind
    if (kind?.kind === 'vars')
      return strings.FT_SUMMARY_VARS(
        Object.keys(value as object).filter((key) => key !== '//').length
      )
    if (kind?.kind === 'literal')
      return kind.form === 'shorthand'
        ? strings.FT_SUMMARY_SHORTHAND('$literal')
        : strings.FT_SUMMARY_LITERAL
    if (kind?.kind !== 'operator' && kind?.kind !== 'fragment') return null
    if (kind.form === 'shorthand') return strings.FT_SUMMARY_SHORTHAND(`$${kind.name}`)
    const text =
      kind.kind === 'operator' ? strings.FT_SUMMARY_OPERATOR : strings.FT_SUMMARY_FRAGMENT
    return text(kind.name ?? strings.FT_INVALID_NODE)
  }
  return {
    ITEM_SINGLE: withIssues('ITEM_SINGLE'),
    ITEMS_MULTIPLE: withIssues('ITEMS_MULTIPLE'),
    KEY_NEW: ({ path }) => newKeyPrompt(classification, path),
  }
}

// What a typed key names in a vars block, or in an object given to one of
// these core parameters
const NEW_KEY_PROMPTS: Record<string, Record<string, string>> = {
  match: { branches: strings.FT_KEY_NEW_BRANCH },
  buildString: { substitutions: strings.FT_KEY_NEW_TOKEN },
  http: { query: strings.FT_KEY_NEW_QUERY, headers: strings.FT_KEY_NEW_HEADER },
  graphQL: { headers: strings.FT_KEY_NEW_HEADER, variables: strings.FT_KEY_NEW_GRAPHQL_VARIABLE },
}

const newKeyPrompt = (classification: Classification, path: Path): string | null => {
  const row = rowAt(classification, path)
  if (row?.kind?.kind === 'vars') return strings.FT_KEY_NEW_VAR
  const slot = row?.slot
  if (slot?.role !== 'parameter' || slot.ownerPath === null || slot.parameter === undefined)
    return null
  const owner = rowAt(classification, slot.ownerPath)?.kind
  if (owner?.kind !== 'operator' || owner.operator === null) return null
  return NEW_KEY_PROMPTS[owner.operator]?.[slot.parameter] ?? null
}

// A host's ref, an object or a function, set as React sets one
const setRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value)
  // An object ref's `current` is typed read-only, but React sets it so too
  else if (ref) (ref as MutableRefObject<T | null>).current = value
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
