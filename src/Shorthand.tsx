import { type CustomComponentProps } from 'json-edit-react'
import { brokenIssue } from './attachIssues'
import { rowAt, type Classification, type RowKind } from './classify'
import { type ComponentConfig } from './customNodeDefinitions'
import { DisplayBar } from './DisplayBar'
import { fragmentHeader } from './Fragment'
import { takeRow } from './nodeRows'
import { operatorDefaultsLine } from './parameterCard'
import { type Path } from './paths'
import { modifierNames, otherSpelling } from './spelling'
import { strings } from './strings'
import { useConversion } from './useConversion'

type ShorthandKind = Extract<RowKind, { kind: 'operator' | 'fragment' | 'literal' }>

// A shorthand node (design, topic 1, "Shorthand nodes";
// docs-dev/v3-node-anatomy.md, sections 3 to 5 and 7), `$literal` included,
// anchored on the node's own object: the DisplayBar, then the node's rows.
// Shorthand is a way of showing a node rather than of editing one, so it has
// no toolbar: json-edit-react's ✎ opens it as raw JSON, and the node is
// switched in full form.
//
// A named payload's rows show as the node's own, and an argument list keeps
// its brackets. A single plain value or reference sits on the button's line,
// since the point of the form is concision; a single node goes beneath, where
// its own header has room. On a broken node every row goes beneath, since the
// header's line holds the issue's message.
export const Shorthand = (props: CustomComponentProps<ComponentConfig>) => {
  const { componentProps, nodeData, value, children, canEdit, setValue, keyboardControls } = props
  const { figTree, classification, displayData, issues, editorTheme } = componentProps!
  const { path } = nodeData
  const kind = rowAt(classification, path)?.kind as ShorthandKind
  const node = value as Record<string, unknown>
  // `literal` is grammar rather than an operator, so its kind names nothing,
  // and its display data is under its own name
  const name = kind.kind === 'literal' ? 'literal' : kind.name
  const key = `$${name}`
  const broken = brokenIssue(issues, classification, path, node)
  const conversion = useConversion(value, componentProps!, !broken && canEdit, setValue)

  const operator =
    kind.kind === 'operator'
      ? figTree.getOperators().find(({ name }) => name === kind.operator)
      : undefined
  const spelling = otherSpelling(operator, name)
  const respell =
    canEdit && !broken && spelling !== undefined
      ? () => setValue(renameKey(node, key, `$${spelling}`))
      : undefined

  const header = () => {
    if (kind.kind === 'fragment') {
      const hints = displayData.fragments[kind.name!]
      return {
        display: fragmentHeader(hints, editorTheme),
        card: hints?.description === undefined ? [] : [hints.description],
      }
    }
    const operatorName = kind.kind === 'literal' ? 'literal' : kind.operator
    const display = operatorName === null ? undefined : displayData.operators[operatorName]
    const card = [
      display?.description,
      operator && operatorDefaultsLine(operator, settings(node, key, path, classification)),
    ].filter((line): line is string => line !== undefined)
    return { display, card }
  }
  const { display, card } = header()

  const payload = node[key]
  const onLine = !broken && (typeof payload !== 'object' || payload === null)
  const { row, rest } = onLine ? takeRow(children, key) : { row: undefined, rest: children }

  return (
    <div className="ft-node">
      <DisplayBar
        name={key}
        display={display}
        card={card}
        cardNote={
          respell &&
          strings.FT_CARD_RESPELL(modifierNames(keyboardControls.clipboardModifier), `$${spelling}`)
        }
        broken={broken}
        editorTheme={editorTheme}
        shorthand
        inline={row}
        onRespell={respell}
        respellModifiers={keyboardControls.clipboardModifier}
        conversion={conversion}
      />
      {rest}
    </div>
  )
}

// What a shorthand node sets, as its full form holds it: its keys other than
// the `$name`, and the parameters its payload binds
const settings = (
  node: Record<string, unknown>,
  key: string,
  path: Path,
  classification: Classification
) => {
  const payload = node[key]
  const payloadPath = [...path, key]
  const parameterAt = (at: Path) => rowAt(classification, at)?.slot?.parameter
  const bound =
    rowAt(classification, payloadPath)?.payload === 'flattened'
      ? Object.keys(payload as object)
      : Array.isArray(payload)
        ? payload.map((_, index) => parameterAt([...payloadPath, index]))
        : [parameterAt(payloadPath)]
  const keys = [...Object.keys(node).filter((other) => other !== key), ...bound]
  return Object.fromEntries(keys.filter((name) => name !== undefined).map((name) => [name, true]))
}

// The node with its `$name` key respelled, in place
const renameKey = (node: Record<string, unknown>, from: string, to: string) =>
  Object.fromEntries(Object.entries(node).map(([key, value]) => [key === from ? to : key, value]))
