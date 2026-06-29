import React from 'react'
import {
  type FragmentMetadata,
  type FragmentNode,
  type FragmentParameterMetadata,
  isAliasString,
} from 'fig-tree-evaluator'
import type { CustomComponentProps } from './_imports'
import { NodeTypeSelector, PropertySelector } from './CommonSelectors'
import type { OperatorProps } from './Operator'
import { DisplayBar } from './DisplayBar'
import { getAvailableProperties } from './validator'
import { Select } from './Select'
import { useCommon, filterChildren } from './useCommon'
import { getCurrentFragment } from './helpers'
import { IconCancel, IconOk } from './Icons'

export const Fragment: React.FC<CustomComponentProps<OperatorProps>> = (props) => {
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

  const { fragments } = figTreeData

  const node = value as FragmentNode
  const thisFragment = node.fragment
  const fragmentData = getCurrentFragment(node, fragments)

  const availableProperties = getAvailableProperties(fragmentData.parameters ?? [], node)

  const { textColor, backgroundColor } = fragmentData

  const displayData =
    textColor && backgroundColor
      ? { textColor, backgroundColor, displayName: 'Fragment' }
      : undefined

  const convert = () => {
    const converted = converters.toShorthand(node)
    onEdit(converted, expressionPath)
  }

  return (
    <>
      <div className="ft-custom ft-fragment">
        {isEditing ? (
          <div className="ft-toolbar ft-fragment-toolbar">
            <NodeTypeSelector
              value="fragment"
              changeNode={(newValue: unknown) => onEdit(newValue, expressionPath)}
              figTreeData={figTreeData}
              nodeData={nodeData}
              defaultNewOperatorExpression={defaultNewOperatorExpression}
              defaultNewFragment={defaultNewFragment}
              defaultNewCustomOperator={defaultNewCustomOperator}
              justSwitchedTo={justSwitchedTo}
            />
            :
            <FragmentSelector
              value={thisFragment}
              changeFragment={(fragment) => {
                const newNode = Object.fromEntries(
                  // Remove any properties that are parameters from other
                  // Fragments
                  Object.entries(node).filter(([key]) => !isAliasString(key))
                )
                onEdit({ ...maybeInsertFallback(newNode), fragment }, expressionPath)
              }}
              fragments={fragments}
              startOpen={startOpen}
            />
            {availableProperties.length > 0 && (
              <PropertySelector
                availableProperties={availableProperties as FragmentParameterMetadata[]}
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
            name={thisFragment}
            description={fragmentData.description}
            setIsEditing={startEditing}
            evaluate={evaluate}
            isLoading={loading}
            canonicalName="FRAGMENT"
            operatorDisplay={displayData ?? operatorDisplay?.FRAGMENT}
            convertOptions={{ type: 'toShorthand', onClick: convert }}
            canEdit={canEdit}
          />
        )}
      </div>
      {filterChildren(children)}
    </>
  )
}

const FragmentSelector: React.FC<{
  value: string
  changeFragment: (fragment: string) => void
  fragments: FragmentMetadata[]
  startOpen?: boolean
}> = ({ value, changeFragment, fragments, startOpen }) => {
  const fragmentOptions = fragments.map(({ name, description }) => ({
    label: name,
    description,
    value: name,
  }))

  return (
    <Select
      className="ft-fragment-select"
      selected={value}
      setSelected={(selected) => changeFragment(selected.value)}
      options={fragmentOptions}
      search={fragmentOptions.length >= 5}
      placeholder="Select Fragment"
      border="all"
      startOpen={startOpen}
    />
  )
}
