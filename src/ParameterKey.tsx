import { type CustomKeyProps } from 'json-edit-react'
import { rowAt } from './classify'
import { type Shared } from './customNodeDefinitions'
import { CardLines, HoverCard } from './HoverCard'
import { RanTick } from './Icons'
import { parameterCard } from './parameterCard'
import { plainMark, showsTick } from './runMarks'

// A row's key label with its parameter's hover card (design, topic 4,
// "Parameter metadata"). The label is json-edit-react's own, with its styles,
// its click (Cmd-click copies the path) and its double-click rename, so only
// the card is added, and on a plain collection that ran, its ✓, since a
// collection's value is its rows. Every definition that can sit at a keyed
// row carries it, since a row takes only its first matching definition's key
// component.
export const ParameterKey = ({
  name,
  nodeData,
  startEditingKey,
  handleClick,
  styles,
  componentProps,
}: CustomKeyProps<Shared>) => {
  const { classification, figTree, run, editorTheme } = componentProps!
  const row = rowAt(classification, nodeData.path)
  // A shorthand's `$name` row, whose name the node's header already shows.
  // Its definition leaves the key out too, but a type switch takes its
  // definition by name, which may be the labelled one.
  if (row?.payload === 'unlabelled') return null
  const owner = row?.slot?.ownerPath ? rowAt(classification, row.slot.ownerPath)?.kind : undefined
  const operator =
    owner?.kind === 'operator'
      ? figTree.getOperators().find(({ name }) => name === owner.operator)
      : undefined
  const card = parameterCard(row, operator)
  const mark = typeof nodeData.value === 'object' ? plainMark(run, nodeData.path) : undefined

  // The card sits inside the key span, which stays the row's flex item with
  // json-edit-react's own sizing, so a long value beside it can't squeeze it
  return (
    <span
      className="jer-key-text"
      style={styles}
      onDoubleClick={startEditingKey}
      onClick={handleClick}
    >
      {card ? <HoverCard card={<CardLines lines={card} titled />}>{name}</HoverCard> : name}
      <span className="jer-key-colon">:</span>
      {mark && showsTick(mark, row) && <RanTick editorTheme={editorTheme} />}
    </span>
  )
}
