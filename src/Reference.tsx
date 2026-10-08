import { useLayoutEffect, useRef } from 'react'
import { StringDisplay, toPathString, type CustomComponentProps } from 'json-edit-react'
import { resolvePath } from 'fig-tree-evaluator'
import { recognizeReference } from 'fig-tree-evaluator/format'
import { flaggedIssues } from './attachIssues'
import { bindings, rowAt, type Row, type RowKind } from './classify'
import { compactJson } from './compactJson'
import { type ComponentConfig } from './customNodeDefinitions'
import { type EditorTheme } from './editorTheme'
import { CardLines, HoverCard } from './HoverCard'
import { EvaluateIcon } from './Icons'
import { IssueCard } from './IssueFlag'
import { RunCard, VALUE_LIMIT } from './RunCard'
import { rowMark } from './revealRow'
import { type RowRun } from './runMarks'
import { strings } from './strings'
import { useEvaluation } from './useEvaluation'

type ReferenceKind = Extract<RowKind, { kind: 'reference' }>

// A reference (design, topic 3, "Kinds"; topic 5, "Editing references"): the
// string in its namespace's colour, without the quotes a plain string has.
// "To get node" is among its edit tools (`./ToGetNodeButton`). Its issues
// float beneath it while its row is hovered (topic 7, "Where issues attach").
// It is shown by json-edit-react's own string display, so double-click and
// Cmd-click open it for editing, and a long one is cut short, as any string
// is.
//
// While editing, json-edit-react's own input, which opens with the path
// selected: what follows the namespace and its dot, so typing replaces the
// path and keeps the namespace. That includes a session the type dropdown's
// reference entries open (`editOnTypeSwitch`), whose `$data.` leaves the
// caret at the end. Choosing another entry while the input is open replaces
// its text but keeps the input, which json-edit-react doesn't focus again, so
// the component does, and selects the new path.
//
// A `$data` reference's card shows the value it reads from the evaluation
// data, compact JSON, null where the path finds nothing, larger where it is
// short. It shows as soon as an issue's card does, and not at all where the
// reference has issues of its own, so that their card shows. A reference in
// another namespace has no value until an evaluation, so it is followed by a
// ▶ that evaluates it, as a node's button does (topic 7, "Evaluating"): a
// spinner while it runs, a second click cancelling it, and where it can't be
// evaluated, dimmed, with the reason in its card. One the grammar rejects,
// such as a bare `$vars`, reads nothing on its own, so it has no ▶: as
// `get`'s `from` it is valid, the path naming the var. Nor has `$error`,
// which has a value only when its node fails, so is never evaluated alone:
// its card says so, where it has no issues of its own, and the ▶'s place is
// kept, empty, for the ✓ or ✕ an evaluation leaves. After an evaluation the
// ▶ shows how the reference ran, as a ✓ or ✕, the reference having no border to
// colour. After an evaluation that reached it, either kind's card says how it
// ran, with the value it resolved to ("How it ran, in the tree"). The card
// hangs on the text and any ▶ together, so hovering either shows it.
export const Reference = (props: CustomComponentProps<ComponentConfig>) => {
  const { componentProps, nodeData, isEditing, originalNode, canEdit, getStyles } = props
  const { classification, issues, editorTheme, entry, evaluationData } = componentProps!
  const row = rowAt(classification, nodeData.path)
  const kind = row?.kind as ReferenceKind
  const input = useRef<HTMLDivElement>(null)
  const { running, mark, blocked, disabled, onEvaluate } = useEvaluation(
    nodeData.path,
    nodeData.fullData,
    componentProps!
  )

  // As the input opens, or takes another entry's text, after json-edit-react's
  // own focus handler, which selects the whole text
  useLayoutEffect(() => {
    const textarea = input.current?.querySelector('textarea')
    if (!isEditing || !textarea) return
    textarea.focus()
    textarea.setSelectionRange(...pathRange(textarea.value, row))
    // Not on every keystroke: the row is read as it was then
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, entry])

  if (isEditing)
    return (
      <div ref={input} className="ft-reference-input" {...rowMark(nodeData.path)}>
        {originalNode}
      </div>
    )

  const colour = namespaceColour(kind, editorTheme)
  const data = kind?.namespace === 'data'
  const caught = kind?.namespace === 'error'
  const evaluable = !data && !caught && !kind?.invalid
  const flagged = flaggedIssues(issues, nodeData.path)
  const sample =
    data && flagged.length === 0 ? sampleValue(nodeData.value, row, evaluationData) : undefined
  const reason =
    evaluable && disabled
      ? blocked
      : caught && flagged.length === 0
        ? strings.FT_EVALUATE_READS_ERROR
        : undefined
  return (
    <span className="ft-reference" {...rowMark(nodeData.path)} data-node-run={mark?.status}>
      <HoverCard
        hideOnClick={!data}
        showAgainOn={mark}
        urgent={!mark && (data || reason !== undefined)}
        card={
          mark ? (
            <RunCard mark={mark} editorTheme={editorTheme} />
          ) : data ? (
            sample
          ) : reason !== undefined ? (
            <CardLines lines={[]} alert={{ text: reason, colour: editorTheme.error }} />
          ) : undefined
        }
      >
        <span className="ft-reference-body">
          <StringDisplay
            nodeData={nodeData}
            styles={{ ...getStyles('string', nodeData), color: colour }}
            pathString={toPathString(nodeData.path)}
            showStringQuotes={false}
            stringTruncateLength={props.stringTruncateLength}
            canEdit={canEdit}
            setIsEditing={props.setIsEditing}
            translate={props.translate}
            showIconTooltips={props.showIconTooltips}
          />
          {evaluable && (
            <button
              type="button"
              className={
                disabled ? 'ft-reference-evaluate ft-evaluate-blocked' : 'ft-reference-evaluate'
              }
              aria-label={running ? strings.FT_CANCEL_EVALUATION : strings.FT_EVALUATE}
              aria-disabled={disabled || undefined}
              aria-busy={running || undefined}
              onClick={() => {
                if (!disabled) onEvaluate()
              }}
              style={{ color: colour }}
            >
              <EvaluateIcon running={running} mark={mark} editorTheme={editorTheme} />
            </button>
          )}
          {caught && (
            <span
              className="ft-reference-evaluate ft-reference-mark"
              aria-hidden
              style={{ color: colour, visibility: ranIcon(mark) ? undefined : 'hidden' }}
            >
              <EvaluateIcon running={false} mark={mark} editorTheme={editorTheme} />
            </span>
          )}
        </span>
      </HoverCard>
      <IssueCard issues={flagged} editorTheme={editorTheme} />
    </span>
  )
}

// The bindings a node makes share one colour: an iterator's element and
// index, and the failure a fallback caught
export const namespaceColour = ({ namespace }: ReferenceKind, editorTheme: EditorTheme) =>
  ({
    data: editorTheme.refData,
    vars: editorTheme.refVars,
    params: editorTheme.refParams,
    element: editorTheme.refBinding,
    index: editorTheme.refBinding,
    error: editorTheme.refBinding,
  })[namespace]

// Whether `EvaluateIcon` shows how the row ran, a ✓ or ✕, rather than a ▶
const ranIcon = (mark: RowRun | undefined) =>
  mark?.status === 'value' || mark?.status === 'failed' || mark?.status === 'fallback'

// The value a `$data` reference reads from the evaluation data, as a card
// line, or nothing where there's no data
const sampleValue = (text: unknown, row: Row | undefined, data: unknown) => {
  if (data === undefined || typeof text !== 'string') return undefined
  const recognition = recognizeReference(text, { bindings: bindings(row?.scope ?? []) })
  if (recognition.kind !== 'reference') return undefined
  const { found, value } = resolvePath(data, recognition.drill)
  const json = compactJson(found ? value : null, VALUE_LIMIT)
  return (
    <span
      className="ft-hover-card-line ft-run-value"
      data-short={json.length <= SHORT_VALUE || undefined}
    >
      {json}
    </span>
  )
}

// The most characters of a value shown larger
const SHORT_VALUE = 30

// Where a reference's path starts and ends in its text: everything after the
// namespace and its dot. Where nothing follows the namespace, or the text
// isn't a reference, both are the end, which puts the caret there.
export const pathRange = (text: string, row: Row | undefined): [number, number] => {
  const recognition = recognizeReference(text, { bindings: bindings(row?.scope ?? []) })
  if (recognition.kind !== 'reference') return [text.length, text.length]
  const { drill } = recognition
  return [text.length - drill.length + (drill.startsWith('.') ? 1 : 0), text.length]
}
