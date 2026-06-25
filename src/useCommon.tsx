// Common functionality for FigTree Node components

import { useEffect, useState } from 'react'
import { OperatorProps } from './Operator'
import { EditEvent, JsonData, NodeData, assign } from 'json-edit-react'
import { getAliases } from './helpers'
import { EvaluatorNode, isObject } from 'fig-tree-evaluator'

interface Input {
  componentProps: OperatorProps
  parentData: object | unknown[] | null
  nodeData: NodeData
  // Live read of the full tree, used by `buildOnEdit` to compute the new data
  // for an edit at an arbitrary path.
  getLatestData: () => JsonData
}

/**
 * Writes `newValue` to any path in the tree: reads the live data, swaps in the
 * new value at `path` with `assign`, then validates and persists via
 * `updateExpression`. Shared by `useCommon` and the Shorthand nodes (which
 * don't use `useCommon`).
 */
export const buildOnEdit =
  (getLatestData: () => JsonData, updateExpression: (data: EvaluatorNode) => void) =>
  (newValue: unknown, path: (string | number)[]) => {
    // `assign` is a no-op on an empty path, so replace the root explicitly
    const newData =
      path.length === 0 ? newValue : assign(getLatestData() as any, path, newValue)
    updateExpression(newData as EvaluatorNode)
  }

export const useCommon = ({ componentProps, parentData, nodeData, getLatestData }: Input) => {
  const {
    evaluateNode,
    topLevelAliases,
    operatorDisplay,
    CurrentEdit,
    figTreeData,
    addTopLevelFallback,
    updateExpression,
  } = componentProps
  const {
    currentEditPath,
    setCurrentEditPath,
    isEditing: isEditingTest,
    toPathString,
    prevState,
    setPrevState,
  } = CurrentEdit
  const [loading, setLoading] = useState(false)

  const expressionPath = nodeData.path.slice(0, -1)
  const pathAsString = toPathString(nodeData.path)

  const onEdit = buildOnEdit(getLatestData, updateExpression)

  const handleSubmit = () => {
    setPrevState(parentData)
    setCurrentEditPath(null)
  }

  const handleCancel = () => {
    // onEditEvent(prevState, expressionPath)
    setCurrentEditPath(null)
  }

  const startEditing = () => {
    setPrevState(parentData)
    setCurrentEditPath(pathAsString)
  }

  const isEditing = () => isEditingTest(pathAsString)

  const listenForSubmit = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') handleCancel()
  }

  /**
   * If `addTopLevelFallback` is specified, the fallback value will be applied
   * to top-level nodes that do not already have a fallback defined.
   */
  const maybeInsertFallback = <T,>(expression: T): T | (T & { fallback?: EvaluatorNode }) => {
    if (
      addTopLevelFallback !== undefined &&
      nodeData.level === 1 &&
      isObject(expression) &&
      !('fallback' in expression)
    ) {
      return { ...expression, fallback: addTopLevelFallback }
    }
    return expression
  }

  useEffect(() => {
    if (isEditing()) {
      window.addEventListener('keydown', listenForSubmit)
    } else window.removeEventListener('keydown', listenForSubmit)
    return () => window.removeEventListener('keydown', listenForSubmit)
  }, [currentEditPath])

  const aliases = { ...topLevelAliases, ...getAliases(parentData, figTreeData.allNonAliases) }

  const evaluate = async (e: React.MouseEvent) => {
    setLoading(true)
    await evaluateNode({ ...parentData, ...aliases }, e)
    setLoading(false)
  }

  return {
    handleCancel,
    handleSubmit,
    expressionPath,
    isEditing,
    startEditing,
    evaluate,
    loading,
    operatorDisplay,
    maybeInsertFallback,
    onEdit,
  }
}
