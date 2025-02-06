import React from 'react'
import { OperatorNode, OperatorParameterMetadata } from 'fig-tree-evaluator'
import { CustomNodeProps, IconOk, IconCancel } from './_imports'
import { Icons } from './Icons'
import { getButtonFontSize } from './helpers'
import { OperatorProps } from './Operator'
import { DisplayBar } from './DisplayBar'
import { FunctionSelector, NodeTypeSelector, PropertySelector } from './CommonSelectors'
import { useCommon } from './useCommon'
import { getAvailableProperties } from './validator'

export const CustomOperator: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const { data, parentData, nodeData, onEdit, customNodeProps } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { handleCancel, handleSubmit, expressionPath, isEditing, startEditing, evaluate, loading } =
    useCommon({
      customNodeProps,
      parentData,
      nodeData,
      onEdit,
    })

  const { figTree, CurrentEdit } = customNodeProps

  if (!figTree) return null

  const functionData = figTree.getCustomFunctions().find((f) => f.name === data)

  if (!functionData) return null

  const availableProperties = getAvailableProperties([], parentData as OperatorNode)

  const { textColor, backgroundColor } = functionData

  const operatorData =
    textColor && backgroundColor
      ? { textColor, backgroundColor, displayName: 'Custom Operator' }
      : undefined

  return (
    <div className="ft-custom ft-operator">
      {isEditing() ? (
        <div className="ft-toolbar ft-operator-toolbar">
          <NodeTypeSelector
            value="customOperator"
            changeNode={(newValue) => onEdit(newValue, expressionPath)}
            figTree={figTree}
            currentExpression={parentData}
            switchNode={CurrentEdit.switchNodeType}
          />
          :
          <FunctionSelector
            value={(parentData as OperatorNode)?.operator as string}
            functions={figTree.getCustomFunctions()}
            updateNode={({ name, numRequiredArgs, argsDefault, inputDefault }) => {
              const newNode = { operator: name, ...inputDefault } as Record<string, unknown>
              delete newNode.input
              delete newNode.args
              if (argsDefault) newNode.args = argsDefault
              if (numRequiredArgs && !argsDefault && !inputDefault)
                newNode.args = new Array(numRequiredArgs).fill(null)
              onEdit(newNode, expressionPath)
            }}
          />
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
          name={functionData.name}
          description={functionData.description}
          setIsEditing={startEditing}
          evaluate={evaluate}
          isLoading={loading}
          canonicalName={'CUSTOM_FUNCTIONS'}
          operatorDisplay={operatorData}
        />
      )}
    </div>
  )
}

export interface EvaluateButtonProps {
  name?: string
  backgroundColor: string
  textColor: string
  evaluate: () => void
  isLoading: boolean
}

export const EvaluateButton: React.FC<EvaluateButtonProps> = ({
  name,
  backgroundColor,
  textColor,
  evaluate,
  isLoading,
}) => {
  return (
    <div
      className="ft-display-button"
      style={{ backgroundColor, color: textColor }}
      onClick={evaluate}
    >
      {!isLoading ? (
        <>
          {name && (
            <span
              className="ft-operator-alias"
              style={{
                fontSize: getButtonFontSize(name),
                fontStyle: 'inherit',
              }}
            >
              {name}
            </span>
          )}
          {Icons.evaluate}
        </>
      ) : (
        <div style={{ width: '100%', textAlign: 'center' }}>
          <span
            className="ft-loader"
            style={{ width: '1.5em', height: '1.5em', borderTopColor: textColor }}
          ></span>
        </div>
      )}
    </div>
  )
}
