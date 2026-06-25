import React, { useCallback } from 'react'
import { isObject, OperatorNode, OperatorParameterMetadata } from 'fig-tree-evaluator'
import { CustomComponentProps } from './_imports'
import { IconCancel, IconOk, Icons } from './Icons'
import { getButtonFontSize } from './helpers'
import { OperatorProps } from './Operator'
import { DisplayBar } from './DisplayBar'
import { FunctionSelector, NodeTypeSelector, PropertySelector } from './CommonSelectors'
import { useCommon } from './useCommon'
import { getAvailableProperties } from './validator'

export const CustomOperator: React.FC<CustomComponentProps<OperatorProps>> = (props) => {
  const {
    value,
    parentData,
    nodeData,
    getLatestData,
    allowEditFilter,
    componentProps,
    customNodeDefinitions,
  } = props

  if (!componentProps) throw new Error('Missing componentProps')

  const {
    handleCancel,
    handleSubmit,
    expressionPath,
    isEditing,
    startEditing,
    evaluate,
    loading,
    maybeInsertFallback,
    onEdit,
  } = useCommon({
    componentProps,
    parentData,
    nodeData,
    getLatestData,
  })

  const {
    figTreeData,
    CurrentEdit: { switchNodeType, hasSwitchedFromOtherNodeType },
    converters,
  } = componentProps

  const canEdit = allowEditFilter(nodeData)

  const { functions } = figTreeData

  const convert = useCallback(async () => {
    const converted = await converters.toShorthand(parentData)
    onEdit(converted, expressionPath)
  }, [parentData])

  const functionData = functions.find((f) => f.name === value)

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
            currentExpression={parentData}
            switchNodeType={(newPath: string) => switchNodeType([...expressionPath, newPath])}
            figTreeData={figTreeData}
            nodeData={nodeData}
            customNodeDefinitions={customNodeDefinitions}
          />
          :
          <FunctionSelector
            value={(parentData as OperatorNode)?.operator as string}
            functions={functions}
            updateNode={({ name, numRequiredArgs, argsDefault, inputDefault }) => {
              const newNode = isObject(inputDefault)
                ? ({ operator: name, ...inputDefault } as Record<string, unknown>)
                : { operator: name }
              if (inputDefault !== undefined && !isObject(inputDefault))
                newNode.input = inputDefault
              delete newNode.args
              if (argsDefault) newNode.args = argsDefault
              if (numRequiredArgs && !argsDefault && !inputDefault)
                newNode.args = new Array(numRequiredArgs).fill(null)
              onEdit(maybeInsertFallback(newNode), expressionPath)
            }}
            startOpen={hasSwitchedFromOtherNodeType(parentData)}
          />
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
              {IconOk}
            </div>
            <div className="ft-clickable ft-cancel-icon" onClick={handleCancel}>
              {IconCancel}
            </div>
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
          convertOptions={{ type: 'toShorthand', onClick: convert }}
          canEdit={canEdit}
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
