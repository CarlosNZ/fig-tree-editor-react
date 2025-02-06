import React, { useMemo } from 'react'
import {
  CustomFunctionMetadata,
  FigTreeEvaluator,
  FragmentParameterMetadata,
  OperatorParameterMetadata,
} from 'fig-tree-evaluator'
import { Select, SelectOption } from './Select'
import { getDefaultValue } from './helpers'

export type NodeType = 'operator' | 'fragment' | 'value' | 'customOperator'

const nodeTypeOptions = [
  { key: 'operator', label: 'Operator', value: 'operator' },
  { key: 'value', label: 'Value', value: 'value' },
]

export const NodeTypeSelector: React.FC<{
  value: NodeType
  changeNode: (type: unknown) => void
  figTree: FigTreeEvaluator
  currentExpression?: object | unknown[] | null
  switchNode: () => void
}> = ({ value, changeNode, figTree, currentExpression, switchNode }) => {
  const fragments = useMemo(() => figTree.getFragments(), [figTree])
  const functions = useMemo(() => figTree.getCustomFunctions(), [figTree])

  const options = [
    ...nodeTypeOptions,
    ...(fragments.length > 0 ? [{ key: 'fragment', label: 'Fragment', value: 'fragment' }] : []),
    ...(functions.length > 0
      ? [{ key: 'customOperator', label: 'Custom Operator', value: 'customOperator' }]
      : []),
  ]

  const currentSelection = options.find((option) => option.value === value)

  const defaultFunction = functions[0]
  const defaultFragment = fragments[0]

  const handleChange = (selected: SelectOption<string>) => {
    switchNode()

    const newType = selected.value
    if (currentSelection?.value === newType) return

    switch (newType) {
      case 'operator':
        changeNode({ operator: '+' })
        break
      case 'fragment':
        changeNode({ fragment: defaultFragment.name })
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
  const functionOptions = functions.map(({ name, numRequiredArgs }) => ({
    key: name,
    label: `${name} (${numRequiredArgs})`,
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
      search
    />
  )
}
