import React from 'react'
import {
  CustomFunctionMetadata,
  FragmentMetadata,
  FragmentParameterMetadata,
  OperatorMetadata,
  OperatorParameterMetadata,
} from 'fig-tree-evaluator'
import { Select, SelectOption } from './Select'
import { getDefaultValue } from './helpers'

export type NodeType = 'operator' | 'fragment' | 'value' | 'customOperator'

export const NodeTypeSelector: React.FC<{
  value: NodeType
  changeNode: (type: unknown) => void
  currentExpression?: object | unknown[] | null
  switchNodeType: (pathPart: string) => void
  figTreeData: {
    operators: OperatorMetadata[]
    fragments: FragmentMetadata[]
    functions: CustomFunctionMetadata[]
  }
}> = ({ value, changeNode, currentExpression, switchNodeType, figTreeData }) => {
  const { fragments, functions } = figTreeData

  const options = [
    { key: 'operator', label: 'Operator', value: 'operator' },
    ...(fragments.length > 0 ? [{ key: 'fragment', label: 'Fragment', value: 'fragment' }] : []),
    ...(functions.length > 0
      ? [{ key: 'customOperator', label: 'Custom Operator', value: 'customOperator' }]
      : []),
    { key: 'value', label: 'Value', value: 'value' },
  ]

  const currentSelection = options.find((option) => option.value === value)

  const defaultFunction = functions[0]
  const defaultFragment = fragments[0]

  const handleChange = (selected: SelectOption<string>) => {
    const newType = selected.value
    if (currentSelection?.value === newType) return

    switch (newType) {
      case 'operator':
        changeNode({ operator: '+' })
        switchNodeType('operator')
        break
      case 'fragment':
        changeNode({ fragment: defaultFragment.name })
        switchNodeType('fragment')
        break
      case 'customOperator':
        const { name, numRequiredArgs, argsDefault, inputDefault } = defaultFunction
        const newNode = { ...currentExpression, operator: name } as Record<string, unknown>
        delete newNode.input
        delete newNode.args
        if (inputDefault) newNode.input = inputDefault
        if (argsDefault) newNode.args = argsDefault
        if (numRequiredArgs && !argsDefault && !inputDefault)
          newNode.args = new Array(numRequiredArgs).fill(null)
        changeNode(newNode)
        switchNodeType('operator')
        break
      case 'value':
        changeNode('DEFAULT STRING')
    }
  }

  return (
    <Select
      className="ft-node-type-select"
      selected={currentSelection?.label ?? null}
      options={options}
      setSelected={handleChange}
      placeholder="Select Node Type"
    />
  )
}

export const PropertySelector: React.FC<{
  availableProperties: OperatorParameterMetadata[] | FragmentParameterMetadata[]
  updateNode: (newField: any) => void
}> = ({ availableProperties, updateNode }) => {
  const propertyOptions = availableProperties.map((property) => ({
    label: property.name,
    value: property,
  }))

  const handleAddProperty = (selected: OperatorParameterMetadata) => {
    updateNode({ [selected.name]: selected.default ?? getDefaultValue(selected.type) })
  }

  return (
    <Select
      className="ft-property-select"
      options={propertyOptions}
      placeholder="Add property"
      selected={null}
      setSelected={(selected) => handleAddProperty(selected.value as OperatorParameterMetadata)}
    />
  )
}

export const FunctionSelector: React.FC<{
  value: string
  functions: readonly CustomFunctionMetadata[]
  updateNode: (functionDefinition: CustomFunctionMetadata) => void
}> = ({ value, functions, updateNode }) => {
  const functionOptions = functions.map(({ name, numRequiredArgs, description }) => ({
    key: name,
    label: `${name} (${numRequiredArgs})`,
    description,
    value: name,
  }))

  const handleFunctionSelect = (selected: SelectOption<string>) => {
    const func = functions.find((f) => f.name === selected.value)
    if (func) updateNode(func)
  }

  const selectedOption = functionOptions.find((option) => value === option.value)

  return (
    <Select
      className="ft-function-select"
      selected={selectedOption?.value ?? null}
      options={functionOptions}
      placeholder="Select function"
      setSelected={handleFunctionSelect}
      search={functionOptions.length >= 5}
      border="all"
    />
  )
}
