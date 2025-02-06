import React, { useMemo } from 'react'
import {
  FigTreeEvaluator,
  OperatorAlias,
  OperatorMetadata,
  OperatorNode,
  OperatorParameterMetadata,
  Operator as OperatorName,
  EvaluatorNode,
} from 'fig-tree-evaluator'
import { CustomNodeProps, IconOk, IconCancel } from './_imports'
import { DisplayBar } from './DisplayBar'
import { OptionGroup, Select } from './Select'
import { getCurrentOperator } from './helpers'
import { FunctionSelector, NodeTypeSelector, PropertySelector } from './CommonSelectors'
import { useCommon } from './useCommon'
import { cleanOperatorNode, getAvailableProperties } from './validator'
import { OperatorDisplay } from './operatorDisplay'

export interface OperatorProps {
  figTree: FigTreeEvaluator
  evaluateNode: (expression: EvaluatorNode, e: React.MouseEvent) => Promise<void>
  topLevelAliases: Record<string, EvaluatorNode>
  operatorDisplay?: Partial<Record<OperatorName | 'FRAGMENT', OperatorDisplay>>
  initialEdit: React.MutableRefObject<boolean>
  currentlyEditing: string | null
  setCurrentlyEditing: (path: string | null) => void
  editing: any
}

export const Operator: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const { data, parentData, nodeData, onEdit, customNodeProps } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const {
    handleCancel,
    handleSubmit,
    expressionPath,
    isEditing,
    startEditing,
    // setCurrentlyEditing,
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
      {isEditing() ? (
        <div className="ft-toolbar ft-operator-toolbar">
          <NodeTypeSelector
            value="operator"
            changeNode={(newValue) => onEdit(newValue, expressionPath)}
            figTree={figTree}
            switchNode={customNodeProps.editing.switchNodeType}
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
          setIsEditing={() => startEditing(nodeData.path.join('.'))}
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

const getOperatorOptions = (operators: readonly OperatorMetadata[]) => {
  const options: OptionGroup<string>[] = []
  for (const op of operators) {
    const operatorAliases = op.aliases.map((alias) => ({ value: alias, label: alias }))
    options.push({ label: op.name, options: operatorAliases })
  }

  return options
}
