import { type CustomComponentProps, type JsonData } from 'json-edit-react'
import { brokenIssue, issuesAt } from './attachIssues'
import { rowAt, type Classification, type RowKind } from './classify'
import { liftNode, lowerNode, shorthandArguments } from './conversions'
import { type ComponentConfig } from './customNodeDefinitions'
import { type CardLine } from './HoverCard'
import { DisplayBar } from './DisplayBar'
import { fillAndTidy } from './fillAndTidy'
import { fragmentHeader } from './Fragment'
import { NodeToolbar } from './NodeToolbar'
import { takeRow } from './nodeRows'
import { cacheLine, operatorDefaultsLine } from './parameterCard'
import { renameKey, type Path } from './paths'
import { rowMark } from './revealRow'
import { modifierNames, otherSpelling } from './spelling'
import { strings } from './strings'
import { useConversion } from './useConversion'
import { useEvaluation } from './useEvaluation'
import { useNodeEditor } from './useNodeEditor'

type ShorthandKind = Extract<RowKind, { kind: 'operator' | 'fragment' | 'literal' }>

// A shorthand node (design, topic 1, "Shorthand nodes";
// docs-dev/v3-node-anatomy.md, sections 3 to 5 and 7), `$literal` included,
// anchored on the node's own object: the DisplayBar, or the toolbar while it
// is open, then the node's rows. The two editors are a full node's: the
// DisplayBar's pencil opens the toolbar, json-edit-react's ✎ the raw JSON.
//
// The toolbar is a full node's, handed the node lifted to full form, and each
// change it makes is lowered back to shorthand, the node alone, its children
// left in their own forms. A broken node has no full form, so it has no
// toolbar: the quick fixes and the raw JSON repair it.
//
// A named payload's rows show as the node's own, and an argument list keeps
// its brackets. A single plain value or reference sits on the button's line,
// since the point of the form is concision; a single node goes beneath, where
// its own header has room. On a broken node every row goes beneath, since the
// header's line holds the issue's message.
export const Shorthand = (props: CustomComponentProps<ComponentConfig>) => {
  const { componentProps, nodeData, value, children, originalNode, canEdit, editConfirmRef } = props
  const { setValue, keyboardControls } = props
  const { figTree, classification, displayData, issues, nodeIssues, editorTheme } = componentProps!
  const nodeEditor = useNodeEditor(props)
  const { editor, openToolbar } = nodeEditor
  const { path } = nodeData
  const evaluation = useEvaluation(path, nodeData.fullData, componentProps!)
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

  // Each card says whether the node's cache is in force, where it caches
  const cache = () =>
    cacheLine(path, kind, {
      classification,
      operators: figTree.getOperators(),
      fragments: figTree.getFragments(),
    })
  const header = () => {
    if (kind.kind === 'fragment') {
      const fragment = displayData.fragments[kind.name!]
      return {
        display: fragmentHeader(fragment, editorTheme),
        card: [fragment?.description, cache()].filter(
          (line): line is CardLine => line !== undefined
        ),
      }
    }
    const operatorName = kind.kind === 'literal' ? 'literal' : kind.operator
    const display = operatorName === null ? undefined : displayData.operators[operatorName]
    const card = [
      display?.description,
      cache(),
      operator && operatorDefaultsLine(operator, settings(node, key, path, classification)),
    ].filter((line): line is CardLine => line !== undefined)
    return { display, card }
  }
  const { display, card } = header()

  // Each toolbar change, lowered to the arguments the node had when the
  // toolbar opened, so a switch through an operator with no positional form
  // comes back positional. It's filled in first, as the fill-in step would
  // fill it, since an argument list can't hold a gap. A change shorthand
  // can't hold is committed in full form, which closes the toolbar, since
  // the row is no longer this component's.
  const commit = (next: JsonData, options?: { close?: boolean }) => {
    if (!isObject(next)) return nodeEditor.commit(next, options)
    const { expression } = fillAndTidy(next, {
      operators: figTree.getOperators(),
      fragments: figTree.getFragments(),
      displayData,
      issues: figTree.validate(next).issues,
    })
    const filled = expression as Record<string, unknown>
    const lowered = lowerNode(filled, figTree, shorthandArguments(nodeEditor.snapshot(), figTree))
    if (lowered === null) return nodeEditor.commit(filled, { close: true })
    nodeEditor.commit(lowered, options)
  }

  if (editor === 'json')
    return (
      <div className="ft-node" {...rowMark(path)}>
        {originalNode}
      </div>
    )

  const lifted = editor === 'toolbar' ? liftNode(node, figTree) : null
  const payload = node[key]
  const onLine = !broken && lifted === null && (typeof payload !== 'object' || payload === null)
  const { row, rest } = onLine ? takeRow(children, key) : { row: undefined, rest: children }

  return (
    <div className="ft-node" {...rowMark(path)} data-node-run={evaluation.mark?.status}>
      {lifted ? (
        <NodeToolbar
          node={lifted}
          kind={kind}
          path={path}
          broken={broken}
          shared={componentProps!}
          editor={nodeEditor}
          commit={commit}
          editConfirmRef={editConfirmRef}
          lifted={{ written: node, reopen: openToolbar }}
        />
      ) : (
        <DisplayBar
          name={key}
          display={display}
          card={card}
          returns={operator?.returns}
          cardNote={
            respell &&
            strings.FT_CARD_RESPELL(
              modifierNames(keyboardControls.clipboardModifier),
              `$${spelling}`
            )
          }
          broken={broken}
          flagged={issuesAt(nodeIssues, path)}
          editorTheme={editorTheme}
          shorthand
          inline={row}
          onEdit={canEdit && !broken ? () => openToolbar() : undefined}
          onRespell={respell}
          respellModifiers={keyboardControls.clipboardModifier}
          conversion={conversion}
          evaluation={evaluation}
        />
      )}
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
