import { type AddableKey, type AddableKeys } from './parameterOptions'
import { Select } from './Select'
import { strings } from './strings'

// The toolbar's "Add parameter" (design, topic 4, "Adding parameters and
// starting values"): the node's parameters, then its modifiers, each labelled
// with its key as it will appear in the tree, or with what it does where it
// replaces a value. It always shows its placeholder, and is left out when
// nothing is left to add.

interface AddParameterProps {
  keys: AddableKeys
  onAdd: (entry: AddableKey) => void
}

export const AddParameter = ({ keys, onAdd }: AddParameterProps) => {
  const groups = [
    { label: strings.FT_ADD_GROUP_PARAMETERS, options: keys.parameters.map(option) },
    { label: strings.FT_ADD_GROUP_MODIFIERS, options: keys.modifiers.map(option) },
  ].filter(({ options }) => options.length > 0)
  if (groups.length === 0) return null

  return (
    <Select
      className="ft-add-parameter"
      optionGroups={groups}
      selected={null}
      border="group"
      placeholder={strings.FT_ADD_PARAMETER}
      setSelected={({ value }) => onAdd(value)}
    />
  )
}

// An argument and a modifier can share a key, so each option's value is its
// entry
const option = (entry: AddableKey) => ({
  label: entry.label ?? entry.key,
  hint: entry.required ? strings.FT_ADD_REQUIRED : undefined,
  description: entry.description,
  value: entry,
})
