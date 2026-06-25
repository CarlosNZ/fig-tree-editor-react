import React, { useCallback } from 'react'
import {
  OperatorAlias,
  OperatorMetadata,
  OperatorNode,
  OperatorParameterMetadata,
  Operator as OperatorName,
  EvaluatorNode,
  FragmentMetadata,
  CustomFunctionMetadata,
  isV1Node,
} from 'fig-tree-evaluator'
import { ConversionType, DisplayBar } from './DisplayBar'
import { OptionGroup, Select } from './Select'
import { getCurrentOperator } from './helpers'
import { FunctionSelector, NodeTypeSelector, PropertySelector } from './CommonSelectors'
import { useCommon, filterChildren } from './useCommon'
import { cleanOperatorNode, getAvailableProperties } from './validator'
import { OperatorDisplay } from './operatorDisplay'
import { CustomComponentProps } from './_imports'
import { IconCancel, IconOk } from './Icons'

export interface OperatorProps {
  figTreeData: {
    operators: OperatorMetadata[]
    fragments: FragmentMetadata[]
    functions: CustomFunctionMetadata[]
    allNonAliases: Set<string>
  }
  evaluateNode: (expression: EvaluatorNode, e: React.MouseEvent) => Promise<void>
  topLevelAliases: Record<string, EvaluatorNode>
  operatorDisplay?: Partial<Record<OperatorName | 'FRAGMENT', OperatorDisplay>>
  converters: {
    toShorthand: (expression: EvaluatorNode) => void
    fromShorthand: (expression: EvaluatorNode) => void
    toV2: (expression: EvaluatorNode) => void
  }
  addTopLevelFallback?: EvaluatorNode
  // Validates and persists a complete expression (see `buildOnEdit`).
  updateExpression: (data: EvaluatorNode) => void
  // Defaults used by the NodeTypeSelector when switching node type
  defaultNewOperatorExpression?: EvaluatorNode
  defaultNewFragment?: string | null
  defaultNewCustomOperator?: string
  // Shared "a type switch just landed on this path" flag, so the new node
  // auto-opens its picker (see `useCommon`'s `startOpen` / `NodeTypeSelector`).
  justSwitchedTo?: React.MutableRefObject<string | null>
}

export const Operator = (props: CustomComponentProps<OperatorProps>) => {
  const {
    value,
    nodeData,
    getLatestData,
    allowEditFilter,
    componentProps,
    isEditing,
    setIsEditing,
    handleCancel,
    children,
  } = props

  if (!componentProps) throw new Error('Missing componentProps')

  const {
    expressionPath,
    evaluate,
    loading,
    operatorDisplay,
    maybeInsertFallback,
    onEdit,
    startOpen,
  } = useCommon({
    componentProps,
    value,
    nodeData,
    getLatestData,
    isEditing,
    closeEditing: handleCancel,
  })

  const {
    figTreeData,
    converters,
    defaultNewOperatorExpression,
    defaultNewFragment,
    defaultNewCustomOperator,
    justSwitchedTo,
  } = componentProps

  const canEdit = allowEditFilter(nodeData)

  const { operators, functions } = figTreeData

  const node = value as OperatorNode
  const thisOperator = node.operator as OperatorAlias
  const operatorData = getCurrentOperator(node.operator, operators)

  const convertType: ConversionType = isV1Node(node) ? 'toV2' : 'toShorthand'

  const convert = useCallback(async () => {
    const { toV2, toShorthand } = converters
    const converter = convertType === 'toV2' ? toV2 : toShorthand
    const converted = await converter(node)
    onEdit(converted, expressionPath)
  }, [value])

  if (!operatorData) return null

  const availableProperties = getAvailableProperties(operatorData.parameters, node)

  const isCustomFunction = operatorData.name === 'CUSTOM_FUNCTIONS'

  return (
    <>
      <div className="ft-custom ft-operator">
        {isEditing ? (
          <div className="ft-toolbar ft-operator-toolbar">
            <NodeTypeSelector
              value="operator"
              changeNode={(newValue) => onEdit(newValue, expressionPath)}
              figTreeData={figTreeData}
              nodeData={nodeData}
              defaultNewOperatorExpression={defaultNewOperatorExpression}
              defaultNewFragment={defaultNewFragment}
              defaultNewCustomOperator={defaultNewCustomOperator}
              justSwitchedTo={justSwitchedTo}
            />
            :
            <OperatorSelector
              value={thisOperator}
              changeOperator={(operator: OperatorAlias) => {
                // If we're just changing to another alias of the same operator
                // type, then don't clean the node
                const newNode = operatorData.aliases.includes(operator)
                  ? { ...node, operator }
                  : { ...cleanOperatorNode(node), operator }
                onEdit(maybeInsertFallback(newNode), expressionPath)
              }}
              operators={operators}
              startOpen={startOpen}
            />
            {isCustomFunction && (
              <FunctionSelector
                value={(node as OperatorNode)?.functionName as string}
                functions={functions}
                updateNode={({ name, numRequiredArgs, argsDefault, inputDefault }) => {
                  const newNode = { ...node, functionName: name } as Record<string, unknown>
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
                updateNode={(newProperty) => {
                  onEdit({ ...node, ...newProperty }, expressionPath)
                }}
              />
            )}
            <div className="ft-edit-buttons">
              <div className="ft-clickable ft-okay-icon" onClick={handleCancel}>
                {IconOk}
              </div>
              <div className="ft-clickable ft-cancel-icon" onClick={handleCancel}>
                {IconCancel}
              </div>
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
            convertOptions={{ type: convertType, onClick: convert }}
            canEdit={canEdit}
          />
        )}
      </div>
      {filterChildren(children)}
    </>
  )
}

const OperatorSelector: React.FC<{
  value: OperatorAlias
  changeOperator: (operator: OperatorAlias) => void
  operators: OperatorMetadata[]
  startOpen?: boolean
}> = ({ value, changeOperator, operators, startOpen }) => {
  const operatorOptions = getOperatorOptions(operators)

  return (
    <Select
      optionGroups={operatorOptions}
      selected={value}
      setSelected={(newValue) => changeOperator(newValue.value)}
      className="ft-operator-select"
      placeholder="Search operators"
      search
      border="group"
      startOpen={startOpen}
    />
  )
}

const getOperatorOptions = (operators: readonly OperatorMetadata[]) => {
  const options: OptionGroup<string>[] = []
  for (const op of operators) {
    const operatorAliases = op.aliases.map((alias) => ({ value: alias, label: alias }))
    options.push({
      label: op.name,
      description: op.description,
      value: op.name,
      options: operatorAliases,
    })
  }

  return options
}
