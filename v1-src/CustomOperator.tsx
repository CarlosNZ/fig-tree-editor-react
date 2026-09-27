import React from 'react'
import { type OperatorNode, type OperatorParameterMetadata, isObject } from 'fig-tree-evaluator'
import type { CustomComponentProps } from './_imports'
import { IconCancel, IconOk, Icons } from './Icons'
import { getButtonFontSize } from './helpers'
import type { OperatorProps } from './Operator'
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

  const {
    expressionPath,
    evaluate,
    loading,
    maybeInsertFallback,
    onEdit,
    startOpen,
    startEditing,
    closeEditing,
  } = useCommon({
    componentProps,
    value,
    nodeData,
    getLatestData,
    isEditing,
    setIsEditing,
    handleCancel,
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

  const { functions } = figTreeData

  const node = value as OperatorNode

  const convert = () => {
    const converted = converters.toShorthand(node)
    onEdit(converted, expressionPath)
  }

  const functionData = functions.find((f) => f.name === node.operator)

  if (!functionData) return null

  const availableProperties = getAvailableProperties([], node)

  const { textColor, backgroundColor } = functionData

  const operatorData =
    textColor && backgroundColor
      ? { textColor, backgroundColor, displayName: 'Custom Operator' }
      : undefined

  return (
    <>
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
              justSwitchedTo={justSwitchedTo}
            />
            :
            <FunctionSelector
              value={node.operator}
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
              startOpen={startOpen}
            />
            {availableProperties.length > 0 && (
              <PropertySelector
                availableProperties={availableProperties as OperatorParameterMetadata[]}
                updateNode={(newProperty) => onEdit({ ...node, ...newProperty }, expressionPath)}
              />
            )}
            <div className="ft-edit-buttons">
              <div className="ft-clickable ft-okay-icon" onClick={closeEditing}>
                {IconOk}
              </div>
              <div className="ft-clickable ft-cancel-icon" onClick={closeEditing}>
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
      {filterChildren(children)}
    </>
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
