import { type AddableKey, type AddableKeys } from './parameterOptions'
import { Select } from './Select'
import { strings } from './strings'

// The toolbar's "Add parameter" (design, topic 4, "Adding parameters and
// starting values"): the node's parameters, then its modifiers, each labelled
// with its key as it will appear in the tree. It always shows its
// placeholder, and is left out when nothing is left to add.

interface AddParameterProps {
  keys: AddableKeys
  onAdd: (key: string) => void
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

const option = ({ key, required, description }: AddableKey) => ({
  label: key,
  hint: required ? strings.FT_ADD_REQUIRED : undefined,
  description,
  value: key,
})
