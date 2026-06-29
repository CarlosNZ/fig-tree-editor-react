import React from 'react'
import type {
  CustomFunctionMetadata,
  EvaluatorNode,
  FragmentMetadata,
  FragmentParameterMetadata,
  OperatorMetadata,
  OperatorParameterMetadata,
} from 'fig-tree-evaluator'
import { Select, type SelectOption } from './Select'
import {
  commonProperties,
  getCurrentFragment,
  getCurrentOperator,
  getDefaultValue,
} from './helpers'
import { extract, toPathString, type NodeData } from 'json-edit-react'

export type NodeType = 'operator' | 'fragment' | 'value' | 'customOperator'

export const NodeTypeSelector: React.FC<{
  value: NodeType
  changeNode: (type: unknown) => void
  currentExpression?: object | unknown[] | null
  figTreeData: {
    operators: OperatorMetadata[]
    fragments: FragmentMetadata[]
    functions: CustomFunctionMetadata[]
  }
  nodeData: NodeData
  // Defaults used when switching node type (provided by the calling component)
  defaultNewOperatorExpression?: EvaluatorNode
  defaultNewFragment?: string | null
  defaultNewCustomOperator?: string
  // Set to this node's path on a type switch, so the freshly-switched node
  // auto-opens its picker (see `useCommon`'s `startOpen`).
  justSwitchedTo?: React.MutableRefObject<string | null>
}> = ({
  value,
  changeNode,
  currentExpression,
  figTreeData,
  nodeData,
  defaultNewOperatorExpression,
  defaultNewFragment,
  defaultNewCustomOperator,
  justSwitchedTo,
}) => {
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

  const defaultFunction = functions.find((f) => f.name === defaultNewCustomOperator) ?? functions[0]

  const handleChange = (selected: SelectOption<string>) => {
    const newType = selected.value
    if (currentSelection?.value === newType) return

    // Flag the switch so the new node (same path) auto-opens its picker on mount
    if (justSwitchedTo && newType !== 'value') justSwitchedTo.current = toPathString(nodeData.path)

    switch (newType) {
      case 'operator':
        changeNode(defaultNewOperatorExpression ?? { operator: '+' })
        break
      case 'fragment':
        changeNode({ fragment: defaultNewFragment })
        break
      case 'customOperator': {
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
      }
      case 'value': {
        // When switching to "Value", we need the name of the operator/fragment
        // *above* the current node to figure out the appropriate default for
        // this property. `nodeData.path` is now the node object's own path (the
        // custom node is anchored on the object), so its last segment is the
        // property/key holding this node in its parent.
        const path = [...nodeData.path]
        const propertyName = path.slice(-1)[0]

        // Check for the "common" properties
        const commonProperty = commonProperties.find((p) => p.name === propertyName)
        if (commonProperty) {
          changeNode(commonProperty.default)
          return
        }

        if (typeof propertyName === 'number') path.pop()
        path.pop()

        let property: OperatorParameterMetadata | FragmentParameterMetadata | undefined

        const operatorName = extract(nodeData?.fullData, [...path, 'operator'], null) as
          string | null
        const fragmentName = extract(nodeData?.fullData, [...path, 'fragment'], null) as
          string | null

        if (operatorName) {
          const operator = getCurrentOperator(operatorName, figTreeData.operators)
          property = operator?.parameters?.find(
            (p) => p.name === propertyName || p.aliases.includes(propertyName as string)
          )
        }

        if (fragmentName) {
          const fragment = getCurrentFragment({ fragment: fragmentName }, figTreeData.fragments)
          property = fragment?.parameters?.find((p) => p.name === propertyName)
        }

        if (property?.default) changeNode(property.default)
        else changeNode('New Value')
        break
      }
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
  updateNode: (newField: Record<string, unknown>) => void
}> = ({ availableProperties, updateNode }) => {
  const propertyOptions = availableProperties.map((property) => ({
    label: property.name,
    value: property,
  }))

  const handleAddProperty = (selected: OperatorParameterMetadata) => {
    updateNode({
      [selected.name]:
        selected.default !== undefined ? selected.default : getDefaultValue(selected),
    })
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
  startOpen?: boolean
}> = ({ value, functions, updateNode, startOpen }) => {
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
      startOpen={startOpen}
    />
  )
}
