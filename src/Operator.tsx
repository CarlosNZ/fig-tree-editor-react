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
  isObject,
} from 'fig-tree-evaluator'
import { CustomNodeProps, IconOk, IconCancel } from './_imports'
import { ConversionType, DisplayBar } from './DisplayBar'
import { OptionGroup, Select } from './Select'
import { getCurrentOperator } from './helpers'
import { FunctionSelector, NodeTypeSelector, PropertySelector } from './CommonSelectors'
import { useCommon } from './useCommon'
import { cleanOperatorNode, getAvailableProperties } from './validator'
import { OperatorDisplay } from './operatorDisplay'
import { CurrentlyEditingReturnType } from './useCurrentlyEditing'

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
  initialEdit: React.MutableRefObject<boolean>
  currentlyEditing: string | null
  setCurrentlyEditing: (path: string | null) => void
  CurrentEdit: CurrentlyEditingReturnType
  toShorthand: (expression: EvaluatorNode) => void
  converters: {
    toShorthand: (expression: EvaluatorNode) => void
    fromShorthand: (expression: EvaluatorNode) => void
    toV2: (expression: EvaluatorNode) => void
  }
}

export const Operator: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const {
    data,
    parentData,
    nodeData,
    onEdit,
    restrictEditFilter,
    customNodeProps,
    customNodeDefinitions,
  } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const {
    handleCancel,
    handleSubmit,
    expressionPath,
    isEditing,
    startEditing,
    evaluate,
    loading,
    operatorDisplay,
  } = useCommon({
    customNodeProps,
    parentData,
    nodeData,
    onEdit,
  })

  const {
    figTreeData,
    CurrentEdit: { switchNodeType, hasSwitchedFromOtherNodeType },
    converters,
  } = customNodeProps

  const canEdit = !restrictEditFilter(nodeData)

  const { operators, functions } = figTreeData

  const operatorData = getCurrentOperator((parentData as OperatorNode).operator, operators)
  const thisOperator = data as OperatorAlias

  if (!operatorData) return null

  const availableProperties = getAvailableProperties(
    operatorData.parameters,
    parentData as OperatorNode
  )

  const isCustomFunction = operatorData.name === 'CUSTOM_FUNCTIONS'

  const convertType: ConversionType = isV1Node(parentData) ? 'toV2' : 'toShorthand'

  const convert = useCallback(async () => {
    const { toV2, toShorthand } = converters
    const converter = convertType === 'toV2' ? toV2 : toShorthand
    const converted = await converter(parentData)
    onEdit(converted, expressionPath)
  }, [parentData])

  return (
    <div className="ft-custom ft-operator">
      {isEditing() ? (
        <div className="ft-toolbar ft-operator-toolbar">
          <NodeTypeSelector
            value="operator"
            changeNode={(newValue) => onEdit(newValue, expressionPath)}
            switchNodeType={(newPath: string) => switchNodeType([...expressionPath, newPath])}
            figTreeData={figTreeData}
            nodeData={nodeData}
            customNodeDefinitions={customNodeDefinitions}
          />
          :
          <OperatorSelector
            value={thisOperator}
            changeOperator={(operator: OperatorAlias) => {
              // If we're just changing to another alias of the same operator
              // type, then don't clean the node
              const newNode = operatorData.aliases.includes(operator)
                ? { ...parentData, operator }
                : { ...cleanOperatorNode(parentData as OperatorNode), operator }
              onEdit(newNode, expressionPath)
            }}
            operators={operators}
            startOpen={hasSwitchedFromOtherNodeType(parentData)}
          />
          {isCustomFunction && isEditing() && (
            <FunctionSelector
              value={(parentData as OperatorNode)?.functionName as string}
              functions={functions}
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
          <div className="ft-edit-buttons">
            <div className="ft-clickable ft-okay-icon" onClick={handleSubmit}>
              <IconOk size="2em" style={{ color: 'green' }} />
            </div>
            <div className="ft-clickable ft-cancel-icon" onClick={handleCancel}>
              <IconCancel size="2.8em" style={{ color: 'rgb(203, 75, 22)' }} />
            </div>
          </div>
        </div>
      ) : (
        <>
          <DisplayBar
            name={thisOperator}
            description={operatorData.description}
            setIsEditing={startEditing}
            evaluate={evaluate}
            isLoading={loading}
            canonicalName={operatorData.name}
            operatorDisplay={operatorDisplay?.[operatorData.name]}
            convertOptions={{ type: convertType, onClick: convert }}
            canEdit={canEdit}
          />
        </>
      )}
    </div>
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
