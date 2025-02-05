import React, { useMemo } from 'react'
import {
  FigTreeEvaluator,
  OperatorAlias,
  OperatorMetadata,
  OperatorNode,
  OperatorParameterMetadata,
  Operator as OperatorName,
  EvaluatorNode,
  FragmentParameterMetadata,
} from 'fig-tree-evaluator'
import { CustomNodeProps, IconOk, IconCancel } from './_imports'
import { DisplayBar } from './DisplayBar'
import { OptionGroup, Select, SelectOption } from './Select'
import { getCurrentOperator, getDefaultValue } from './helpers'
import { NodeTypeSelector } from './NodeTypeSelector'
import { useCommon } from './useCommon'
import { cleanOperatorNode, getAvailableProperties } from './validator'
import { OperatorDisplay } from './operatorDisplay'
import { FunctionSelector } from './CustomOperator'

export interface OperatorProps {
  figTree: FigTreeEvaluator
  evaluateNode: (expression: EvaluatorNode, e: React.MouseEvent) => Promise<void>
  topLevelAliases: Record<string, EvaluatorNode>
  operatorDisplay?: Partial<Record<OperatorName | 'FRAGMENT', OperatorDisplay>>
  initialEdit: React.MutableRefObject<boolean>
}

export const Operator: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const { data, parentData, nodeData, onEdit, customNodeProps } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const {
    handleCancel,
    handleSubmit,
    expressionPath,
    isEditing,
    setIsEditing,
    evaluate,
    loading,
    operatorDisplay,
  } = useCommon({
    customNodeProps,
    parentData,
    nodeData,
    onEdit,
  })

  const { figTree } = customNodeProps

  if (!figTree) return null

  const operatorData = getCurrentOperator(
    (parentData as OperatorNode).operator,
    figTree.getOperators()
  ) as OperatorMetadata
  const thisOperator = data as OperatorAlias

  if (!operatorData) return null

  const availableProperties = getAvailableProperties(
    operatorData.parameters,
    parentData as OperatorNode
  )

  const isCustomFunction = operatorData.name === 'CUSTOM_FUNCTIONS'

  return (
    <div className="ft-custom ft-operator">
      {isEditing ? (
        <div className="ft-toolbar ft-operator-toolbar">
          <NodeTypeSelector
            value="operator"
            changeNode={(newValue) => onEdit(newValue, expressionPath)}
            figTree={figTree}
          />
          :
          <OperatorSelector
            value={thisOperator}
            figTree={figTree}
            changeOperator={(operator: OperatorAlias) => {
              // If we're just changing to another alias of the same operator
              // type, then don't clean the node
              const newNode = operatorData.aliases.includes(operator)
                ? { ...parentData, operator }
                : { ...cleanOperatorNode(parentData as OperatorNode), operator }
              onEdit(newNode, expressionPath)
            }}
          />
          {isCustomFunction && isEditing && (
            <FunctionSelector
              value={(parentData as OperatorNode)?.functionName as string}
              functions={figTree.getCustomFunctions()}
              updateNode={({ name, numRequiredArgs, argsDefault, inputDefault }) => {
                const newNode = { ...parentData, functionName: name } as Record<string, unknown>
                delete newNode.input
                delete newNode.args
                if (inputDefault) newNode.input = inputDefault
                if (argsDefault) newNode.args = argsDefault
                if (numRequiredArgs && !argsDefault && !inputDefault)
                  newNode.args = new Array(numRequiredArgs).fill(null)
                onEdit(newNode, expressionPath)
              }}
            />
          )}
          {availableProperties.length > 0 && (
            <PropertySelector
              availableProperties={availableProperties as OperatorParameterMetadata[]}
              updateNode={(newProperty) =>
                onEdit({ ...parentData, ...newProperty }, expressionPath)
              }
            />
          )}
          <div className="ft-clickable ft-okay-icon" onClick={handleSubmit}>
            <IconOk size="2em" style={{ color: 'green' }} />
          </div>
          <div className="ft-clickable ft-cancel-icon" onClick={handleCancel}>
            <IconCancel size="2.8em" style={{ color: 'rgb(203, 75, 22)' }} />
          </div>
        </div>
      ) : (
        <DisplayBar
          name={thisOperator}
          description={operatorData.description}
          setIsEditing={() => setIsEditing(true)}
          evaluate={evaluate}
          isLoading={loading}
          canonicalName={operatorData.name}
          operatorDisplay={operatorDisplay?.[operatorData.name]}
        />
      )}
    </div>
  )
}

const OperatorSelector: React.FC<{
  value: OperatorAlias
  figTree: FigTreeEvaluator
  changeOperator: (operator: OperatorAlias) => void
}> = ({ value, figTree, changeOperator }) => {
  const operatorOptions = useMemo(() => getOperatorOptions(figTree.getOperators()), [figTree])

  return (
    <Select
      optionGroups={operatorOptions}
      selected={value}
      setSelected={(newValue) => changeOperator(newValue.value)}
      className="ft-operator-select"
      placeholder="Search operators"
      search
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

export interface DropdownOption {
  label: string
  options: { value: string; label: string }[]
}

const getOperatorOptions = (operators: readonly OperatorMetadata[]) => {
  const options: OptionGroup<string>[] = []
  for (const op of operators) {
    const operatorAliases = op.aliases.map((alias) => ({ value: alias, label: alias }))
    options.push({ label: op.name, options: operatorAliases })
  }

  return options
}
