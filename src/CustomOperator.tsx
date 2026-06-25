import React, { useCallback } from 'react'
import { isObject, OperatorNode, OperatorParameterMetadata } from 'fig-tree-evaluator'
import { CustomComponentProps } from './_imports'
import { IconCancel, IconOk, Icons } from './Icons'
import { getButtonFontSize } from './helpers'
import { OperatorProps } from './Operator'
import { DisplayBar } from './DisplayBar'
import { FunctionSelector, NodeTypeSelector, PropertySelector } from './CommonSelectors'
import { useCommon, filterChildren } from './useCommon'
import { getAvailableProperties } from './validator'

export const CustomOperator: React.FC<CustomComponentProps<OperatorProps>> = (props) => {
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

  const { expressionPath, evaluate, loading, maybeInsertFallback, onEdit } = useCommon({
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
  } = componentProps

  const canEdit = allowEditFilter(nodeData)

  const { functions } = figTreeData

  const node = value as OperatorNode

  const convert = useCallback(async () => {
    const converted = await converters.toShorthand(node)
    onEdit(converted, expressionPath)
  }, [value])

  const functionData = functions.find((f) => f.name === node.operator)

  if (!functionData) return null

  const availableProperties = getAvailableProperties([], node)

  const { textColor, backgroundColor } = functionData

  const operatorData =
    textColor && backgroundColor
      ? { textColor, backgroundColor, displayName: 'Custom Operator' }
      : undefined

  return (
    <div className="ft-custom ft-operator">
      {isEditing ? (
        <div className="ft-toolbar ft-operator-toolbar">
          <NodeTypeSelector
            value="customOperator"
            changeNode={(newValue) => onEdit(newValue, expressionPath)}
            currentExpression={node}
            figTreeData={figTreeData}
            nodeData={nodeData}
            defaultNewOperatorExpression={defaultNewOperatorExpression}
            defaultNewFragment={defaultNewFragment}
            defaultNewCustomOperator={defaultNewCustomOperator}
          />
          :
          <FunctionSelector
            value={node.operator as string}
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
          />
          {availableProperties.length > 0 && (
            <PropertySelector
              availableProperties={availableProperties as OperatorParameterMetadata[]}
              updateNode={(newProperty) => onEdit({ ...node, ...newProperty }, expressionPath)}
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
          name={functionData.name}
          description={functionData.description}
          setIsEditing={() => setIsEditing(true)}
          evaluate={evaluate}
          isLoading={loading}
          canonicalName={'CUSTOM_FUNCTIONS'}
          operatorDisplay={operatorData}
          convertOptions={{ type: 'toShorthand', onClick: convert }}
          canEdit={canEdit}
        />
      )}
      {filterChildren(children)}
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
