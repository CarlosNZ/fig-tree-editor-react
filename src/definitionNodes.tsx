import {
  Chips,
  chipsDefinition,
  colorPickerDefinition,
  type ChipsCustomProps,
} from '@json-edit-react/components'
import {
  type CustomComponentProps,
  type CustomNodeDefinition,
  type JsonData,
} from 'json-edit-react'
import { UNION_TYPES, isColourField, isLiteralUnion, isTypeField } from './definitionShape'
import { strings } from './strings'

// The fragment definition editor's own components (fragment-editor-design.md,
// "The definition editor"), from @json-edit-react/components: a colour
// picker for the two colours, and chips for a declaration's `type` where it
// is a union or a literal union. A single type is an enum, which
// json-edit-react draws itself (definitionShape.ts, `SINGLE_TYPE`).

const colourDefinition = colorPickerDefinition({ condition: isColourField })

// Switching from a single type keeps it as the union's one member, where it
// can be one. Switching away keeps the first member.
//
// TO-DO: a switch to "Single" keeps the first member, once json-edit-react's
// switch to an enum reads the value `toStandardType` gives
const unionDefinition = chipsDefinition({
  name: strings.FT_TYPE_MULTIPLE,
  condition: isTypeField,
  componentProps: { options: UNION_TYPES },
  fromStandardType: (value) => {
    if (Array.isArray(value)) return value.map(String)
    return UNION_TYPES.includes(String(value)) ? [String(value)] : []
  },
  toStandardType: (value) => (Array.isArray(value) ? String(value[0] ?? 'any') : String(value)),
})

// Chips over a literal union's members: `{ literal: [...] }` is shown as its
// array, and each change is written back inside it. A saved value that isn't
// a literal union yet (a type switch, before its first commit) reaches Chips
// as no chips at all, which is how Chips knows to commit the switch, even
// from a union, whose array it would otherwise take as its own.
const LiteralChips = (props: CustomComponentProps<ChipsCustomProps>) => {
  const members = (value: JsonData) => (isLiteralUnion(value) ? value.literal : value)
  const saved = props.nodeData.value
  return (
    <Chips
      {...props}
      value={members(props.value)}
      nodeData={{ ...props.nodeData, value: isLiteralUnion(saved) ? saved.literal : null }}
      handleEdit={(next) =>
        next === undefined ? props.handleEdit() : props.handleEdit({ literal: next })
      }
    />
  )
}

const literalDefinition: CustomNodeDefinition<ChipsCustomProps> = {
  condition: (nodeData) => isTypeField(nodeData) && isLiteralUnion(nodeData.value),
  component: LiteralChips,
  name: strings.FT_TYPE_LITERAL,
  showInTypeSelector: true,
  editOnTypeSwitch: true,
  showOnEdit: true,
  renderCollectionAsValue: true,
  defaultValue: { literal: [] },
  // Literal members are strings, so switching away gives `string`
  toStandardType: () => 'string',
  fromStandardType: (value) => (isLiteralUnion(value) ? value : { literal: [] }),
}

export const definitionNodes = [
  colourDefinition,
  unionDefinition,
  literalDefinition,
] as unknown as CustomNodeDefinition[]
