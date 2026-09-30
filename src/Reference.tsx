import { useLayoutEffect, useMemo, useRef } from 'react'
import { StringDisplay, toPathString, type CustomComponentProps } from 'json-edit-react'
import { recognizeReference } from 'fig-tree-evaluator/format'
import { bindings, rowAt, type Row, type RowKind } from './classify'
import { getNodeFor } from './conversions'
import { type ComponentConfig } from './customNodeDefinitions'
import { type EditorTheme } from './editorTheme'
import { Icons } from './Icons'
import { strings } from './strings'
import { ToGetNodeButton } from './upstream'

type ReferenceKind = Extract<RowKind, { kind: 'reference' }>

// A reference (design, topic 3, "Kinds"; topic 5, "Editing references"): the
// string in its namespace's colour, without the quotes a plain string has,
// then the ▶ that evaluates it, and "To get node", on hover, where the
// reference has a `get` form. It is shown by json-edit-react's own string
// display, so double-click and Cmd-click open it for editing, and a long one
// is cut short, as any string is.
//
// While editing, json-edit-react's own input, which opens with the path
// selected: what follows the namespace and its dot, so typing replaces the
// path and keeps the namespace. That includes a session the type dropdown's
// reference entries open (`editOnTypeSwitch`), whose `$data.` leaves the
// caret at the end. Choosing another entry while the input is open replaces
// its text but keeps the input, which json-edit-react doesn't focus again, so
// the component does, and selects the new path.
//
// TO-DO: evaluating (plan, Phase 10).
export const Reference = (props: CustomComponentProps<ComponentConfig>) => {
  const { componentProps, nodeData, value, isEditing, originalNode, canEdit, getStyles } = props
  const { classification, editorTheme, entry, referenceNames } = componentProps!
  const row = rowAt(classification, nodeData.path)
  const input = useRef<HTMLDivElement>(null)
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
      <div ref={input} className="ft-reference-input">
        {originalNode}
      </div>
    )

  const colour = namespaceColour(row?.kind as ReferenceKind, editorTheme)
  return (
    <span className="ft-reference">
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
        className="ft-reference-evaluate"
        aria-label={strings.FT_EVALUATE}
        style={{ color: colour }}
      >
        {Icons.evaluate}
      </button>
      {getNode && <ToGetNodeButton onClick={() => props.handleEdit(getNode)} colour={colour} />}
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
