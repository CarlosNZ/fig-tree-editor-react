import React, { useCallback } from 'react'
import {
  FragmentMetadata,
  FragmentNode,
  FragmentParameterMetadata,
  isObject,
} from 'fig-tree-evaluator'
import { CustomNodeProps, IconOk, IconCancel } from './_imports'
import { NodeTypeSelector, PropertySelector } from './CommonSelectors'
import { OperatorProps } from './Operator'
import { DisplayBar } from './DisplayBar'
import { getAvailableProperties } from './validator'
import { Select } from './Select'
import { useCommon } from './useCommon'
import { getCurrentFragment } from './helpers'

export const Fragment: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
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

  const { fragments } = figTreeData

  const fragmentData = getCurrentFragment(parentData as FragmentNode, fragments)
  const thisFragment = data as string

  const availableProperties = getAvailableProperties(
    fragmentData.parameters ?? [],
    parentData as FragmentNode
  )

  const { textColor, backgroundColor } = fragmentData

  const displayData =
    textColor && backgroundColor
      ? { textColor, backgroundColor, displayName: 'Fragment' }
      : undefined

  const convert = useCallback(async () => {
    const converted = await converters.toShorthand(parentData)
    onEdit(converted, expressionPath)
  }, [parentData])

  return (
    <div className="ft-custom ft-fragment">
      {isEditing() ? (
        <div className="ft-toolbar ft-fragment-toolbar">
          <NodeTypeSelector
            value="fragment"
            changeNode={(newValue: unknown) => onEdit(newValue, expressionPath)}
            switchNodeType={(newPath: string) => switchNodeType([...expressionPath, newPath])}
            figTreeData={figTreeData}
            nodeData={nodeData}
            customNodeDefinitions={customNodeDefinitions}
          />
          :
          <FragmentSelector
            value={thisFragment}
            changeFragment={(fragment) => onEdit({ ...parentData, fragment }, expressionPath)}
            fragments={fragments}
            startOpen={hasSwitchedFromOtherNodeType(parentData)}
          />
          {availableProperties.length > 0 && (
            <PropertySelector
              availableProperties={availableProperties as FragmentParameterMetadata[]}
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
