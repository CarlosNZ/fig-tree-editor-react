import { type CustomKeyProps } from 'json-edit-react'
import { rowAt } from './classify'
import { type Shared } from './customNodeDefinitions'
import { CardLines, HoverCard } from './HoverCard'
import { parameterCard } from './parameterCard'

// A row's key label with its parameter's hover card (design, topic 4,
// "Parameter metadata"). The label is json-edit-react's own, with its styles,
// its click (Cmd-click copies the path) and its double-click rename, so only
// the card is added. Every definition that can sit at a keyed row carries it,
// since a row takes only its first matching definition's key component.
//
// The root in fragment mode is labelled "Fragment: name", the fragment's
// name in bold, and has no colon after it, since it names the fragment
// rather than introducing a value.
export const ParameterKey = ({
  name,
  nodeData,
  startEditingKey,
  handleClick,
  styles,
  componentProps,
}: CustomKeyProps<Shared>) => {
  const { classification, figTree, displayData, fragmentMode, fragmentName } = componentProps!
  if (fragmentMode && nodeData.path.length === 0)
    return (
      <span className="jer-key-text" style={styles} onClick={handleClick}>
        {name}
        {fragmentName !== undefined && (
          <>
            : <strong>{fragmentName}</strong>
          </>
        )}
      </span>
    )
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
  const card = parameterCard(
    row,
    operator,
    operator !== undefined
      ? displayData.operators[operator.name]
      : owner?.kind === 'fragment'
        ? displayData.fragments[owner.name ?? '']
        : undefined
  )

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
    </span>
  )
}
