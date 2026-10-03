import { useLayoutEffect, useMemo, useRef } from 'react'
import { StringDisplay, toPathString, type CustomComponentProps } from 'json-edit-react'
import { recognizeReference } from 'fig-tree-evaluator/format'
import { flaggedIssues } from './attachIssues'
import { bindings, rowAt, type Row, type RowKind } from './classify'
import { getNodeFor } from './conversions'
import { type ComponentConfig } from './customNodeDefinitions'
import { type EditorTheme } from './editorTheme'
import { CardLines, HoverCard } from './HoverCard'
import { EvaluateIcon } from './Icons'
import { IssueCard } from './IssueFlag'
import { RunCard } from './RunCard'
import { rowMark } from './revealRow'
import { strings } from './strings'
import { ToGetNodeButton } from './upstream'
import { useEvaluation } from './useEvaluation'

type ReferenceKind = Extract<RowKind, { kind: 'reference' }>

// A reference (design, topic 3, "Kinds"; topic 5, "Editing references"): the
// string in its namespace's colour, without the quotes a plain string has,
// then the ▶ that evaluates it, and "To get node", on hover, where the
// reference has a `get` form. Its issues float beneath it while its row is
// hovered (topic 7, "Where issues attach"). It is shown by json-edit-react's
// own string display, so double-click and Cmd-click open it for editing, and a
// long one is cut short, as any string is.
//
// While editing, json-edit-react's own input, which opens with the path
// selected: what follows the namespace and its dot, so typing replaces the
// path and keeps the namespace. That includes a session the type dropdown's
// reference entries open (`editOnTypeSwitch`), whose `$data.` leaves the
// caret at the end. Choosing another entry while the input is open replaces
// its text but keeps the input, which json-edit-react doesn't focus again, so
// the component does, and selects the new path.
//
// The ▶ evaluates the reference, as a node's button does (topic 7,
// "Evaluating"): a spinner while it runs, a second click cancelling it, and
// where it can't be evaluated, dimmed, with the reason in a card on hover.
// After an evaluation it shows how the reference ran, as a ✓ or ✕, the
// reference having no border to colour, and its card says how, with the
// value it resolved to ("How it ran, in the tree"). The card hangs on the
// text and the ▶ together, so hovering either shows it.
export const Reference = (props: CustomComponentProps<ComponentConfig>) => {
  const { componentProps, nodeData, value, isEditing, originalNode, canEdit, getStyles } = props
  const { classification, issues, editorTheme, entry, referenceNames } = componentProps!
  const row = rowAt(classification, nodeData.path)
  const input = useRef<HTMLDivElement>(null)
  const { running, mark, blocked, disabled, onEvaluate } = useEvaluation(
    nodeData.path,
    nodeData.fullData,
    componentProps!
  )
  const getNode = useMemo(
    () => (canEdit ? getNodeFor(value as string, referenceNames) : null),
    [value, canEdit, referenceNames]
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

  const colour = namespaceColour(row?.kind as ReferenceKind, editorTheme)
  return (
    <span className="ft-reference" {...rowMark(nodeData.path)} data-node-run={mark?.status}>
      <HoverCard
        hideOnClick
        showAgainOn={mark}
        urgent={!mark && disabled}
        card={
          mark ? (
            <RunCard mark={mark} editorTheme={editorTheme} />
          ) : disabled ? (
            <CardLines lines={[]} alert={{ text: blocked!, colour: editorTheme.error }} />
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
        </span>
      </HoverCard>
      {getNode && <ToGetNodeButton onClick={() => props.handleEdit(getNode)} colour={colour} />}
      <IssueCard issues={flaggedIssues(issues, nodeData.path)} editorTheme={editorTheme} />
    </span>
  )
}

// The bindings share one colour, the element and the index alike
const namespaceColour = ({ namespace }: ReferenceKind, editorTheme: EditorTheme) =>
  ({
    data: editorTheme.refData,
    vars: editorTheme.refVars,
    params: editorTheme.refParams,
    element: editorTheme.refBinding,
    index: editorTheme.refBinding,
  })[namespace]

// Where a reference's path starts and ends in its text: everything after the
// namespace and its dot. Where nothing follows the namespace, or the text
// isn't a reference, both are the end, which puts the caret there.
export const pathRange = (text: string, row: Row | undefined): [number, number] => {
  const recognition = recognizeReference(text, { bindings: bindings(row?.scope ?? []) })
  if (recognition.kind !== 'reference') return [text.length, text.length]
  const { drill } = recognition
  return [text.length - drill.length + (drill.startsWith('.') ? 1 : 0), text.length]
}
