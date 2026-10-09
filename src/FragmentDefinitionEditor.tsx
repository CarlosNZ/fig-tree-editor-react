import { useMemo } from 'react'
import { type FragmentDefinition } from 'fig-tree-evaluator'
import { JsonEditor, type JsonEditorProps } from 'json-edit-react'
import {
  allowAdd,
  allowTypeSelection,
  defaultValue,
  newKeyOptions,
  updateDefinition,
  type DefinitionFields,
} from './definitionShape'
import { strings } from './strings'

// The rest of a fragment definition beside its body: the parameter
// declarations, description, samples and metadata (fragment-editor-design.md,
// "The definition editor"). The body is the expression editor's, so it isn't
// shown here, and every change reaches `setDefinition` with it kept, as a
// complete definition. The rest are json-edit-react's props, less those the
// editor sets to hold the definition to its shape.
export interface FragmentDefinitionEditorProps extends Omit<
  JsonEditorProps,
  | 'data'
  | 'setData'
  | 'newKeyOptions'
  | 'defaultValue'
  | 'allowTypeSelection'
  | 'allowAdd'
  | 'onUpdate'
> {
  definition: FragmentDefinition
  setDefinition: (definition: FragmentDefinition) => void
}

export const FragmentDefinitionEditor = ({
  definition,
  setDefinition,
  rootName = strings.FT_DEFINITION_ROOT,
  ...props
}: FragmentDefinitionEditorProps) => {
  const { expression } = definition
  const fields = useMemo(() => withoutBody(definition), [definition])

  return (
    <JsonEditor
      rootName={rootName}
      {...props}
      data={fields}
      setData={(next) => setDefinition({ expression, ...(next as DefinitionFields) })}
      newKeyOptions={newKeyOptions}
      defaultValue={defaultValue}
      allowTypeSelection={allowTypeSelection}
      allowAdd={allowAdd}
      onUpdate={updateDefinition}
    />
  )
}

const withoutBody = ({ expression: _body, ...fields }: FragmentDefinition): DefinitionFields =>
  fields
