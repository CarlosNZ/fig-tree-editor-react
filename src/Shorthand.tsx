import React, { useCallback, useState } from 'react'
import {
  Operator as OperatorName,
  OperatorMetadata,
  EvaluatorNode,
  FragmentMetadata,
  CustomFunctionMetadata,
} from 'fig-tree-evaluator'
import { CustomNodeProps } from './_imports'
import { getAliases, getCurrentFragment, getCurrentOperator } from './helpers'
import { OperatorDisplay, operatorDisplay } from './operatorDisplay'
import { ConvertButton, DisplayBar, EvaluateButton } from './DisplayBar'

const README_URL = 'https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#'

export interface ShorthandProps {
  evaluateNode: (expression: EvaluatorNode, e: React.MouseEvent) => Promise<void>
  operatorDisplay: Partial<Record<OperatorName, OperatorDisplay>>
  topLevelAliases: Record<string, EvaluatorNode>
  figTreeData: {
    operators: OperatorMetadata[]
    fragments: FragmentMetadata[]
    functions: CustomFunctionMetadata[]
    allNonAliases: Set<string>
  }
  converters: {
    toShorthand: (expression: EvaluatorNode) => void
    fromShorthand: (expression: EvaluatorNode) => void
    toV2: (expression: EvaluatorNode) => void
  }
}

/**
 * ShorthandNodeCollection has a "collection" as its property, e.g.
 * { $getData: { property: "simple.property.path" }}
 * or
 * { $getData: ["simple.property.path"]}
 */
export const ShorthandNodeCollection: React.FC<CustomNodeProps<ShorthandProps>> = ({
  children,
  nodeData,
  onEdit,
  restrictEditFilter,
  customNodeProps,
}) => {
  const { key, parentData, path } = nodeData
  const { evaluateNode, topLevelAliases, figTreeData, converters } = customNodeProps ?? {}
  if (!evaluateNode || !figTreeData) return null

  const canEdit = !restrictEditFilter(nodeData)

  const [loading, setLoading] = useState(false)

  const operatorAlias = (key as string).slice(1)

  const { operators, fragments, functions, allNonAliases } = figTreeData
  const operatorData = getCurrentOperator(operatorAlias, operators)

  const customOpData = !operatorData ? functions.find((f) => f.name === operatorAlias) : undefined

  const fragmentData =
    !operatorData && !customOpData
      ? getCurrentFragment({ fragment: operatorAlias }, fragments)
      : undefined

  const { textColor, backgroundColor } = customOpData ?? fragmentData ?? {}
  const displayData =
    textColor && backgroundColor
      ? { textColor, backgroundColor, displayName: 'Fragment' }
      : undefined

  const aliases = { ...topLevelAliases, ...getAliases(parentData, allNonAliases) }

  const convert = useCallback(async () => {
    const converted = await converters?.fromShorthand(parentData)
    const newPath = path.slice(0, -1)
    onEdit(converted, newPath)
  }, [parentData])

  return (
    <div className="ft-shorthand-wrapper">
      <div className="ft-shorthand-display-bar">
        <DisplayBar
          name={key as string}
          description={operatorData?.description ?? fragmentData?.description}
          setIsEditing={() => {}}
          evaluate={async (e) => {
            setLoading(true)
            await evaluateNode({ ...parentData, ...aliases }, e)
            setLoading(false)
          }}
          isLoading={loading}
          canonicalName={operatorData?.name ?? 'FRAGMENT'}
          operatorDisplay={displayData}
          convertOptions={{ type: 'fromShorthand', onClick: convert }}
          canEdit={canEdit}
        />
      </div>
      {children}
    </div>
  )
}

/**
 * ShorthandNodeWithSimpleValue is a node of the type:
 * { $getData: "simple.property.path"}
 *
 * Note that the "node" here is actually the value "simple.property.path",
 * whereas with with the ShorthandNodeCollection we are targeting the
 * "wrapper" (i.e. the parentData)
 */

export const ShorthandNodeWithSimpleValue: React.FC<CustomNodeProps<ShorthandProps>> = (props) => {
  const { data: d, nodeData, customNodeProps, children, onEdit } = props
  const data = d as Record<string, string>

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { evaluateNode, topLevelAliases, figTreeData, converters } = customNodeProps
  const [loading, setLoading] = useState(false)

  if (!figTreeData) return null

  const { operators, allNonAliases } = figTreeData

  const property = Object.keys(data)[0]

  const operatorAlias = property.slice(1)

  const operatorData = getCurrentOperator(operatorAlias, operators)

  if (!operatorData) return <p>Invalid Shorthand node</p>

  const { backgroundColor, textColor, displayName } = operatorDisplay[operatorData.name]

  const aliases = { ...topLevelAliases, ...getAliases(data, allNonAliases) }

  const convert = useCallback(async () => {
    const converted = await converters.fromShorthand(data)
    onEdit(converted, nodeData.path)
  }, [data])

  return (
    <div className="ft-shorthand-node">
      <EvaluateButton
        name={property}
        backgroundColor={backgroundColor}
        textColor={textColor}
        evaluate={async (e) => {
          setLoading(true)
          await evaluateNode({ ...data, ...aliases }, e)
          setLoading(false)
        }}
        isLoading={loading}
        isShorthand
      />
      <ConvertButton
        type="fromShorthand"
        onClick={convert}
        backgroundColor={backgroundColor}
        textColor={textColor}
      />
      {/* Negative margin to cancel out Json-Edit-React indent for this case */}
      <div style={{ marginLeft: '-1.7em' }}>{children}</div>
      <div className="ft-display-name">
        <a href={README_URL + operatorData.name.toLowerCase()} target="_blank">
          {displayName}
        </a>
      </div>
    </div>
  )
}
