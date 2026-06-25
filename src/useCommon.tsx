// Common functionality for FigTree Node components

import { useEffect, useState } from 'react'
import { OperatorProps } from './Operator'
import { EditEvent, NodeData } from 'json-edit-react'
import { getAliases } from './helpers'
import { EvaluatorNode, isObject } from 'fig-tree-evaluator'

interface Input {
  componentProps: OperatorProps
  parentData: object | unknown[] | null
  nodeData: NodeData
  // onEditEvent: (e: EditEvent<unknown>) => void
  // (value: unknown, path: (string | number)[]) => Promise<string | void>
}

export const useCommon = ({ componentProps, parentData, nodeData /* onEditEvent */ }: Input) => {
  const {
    evaluateNode,
    topLevelAliases,
    operatorDisplay,
    CurrentEdit,
    figTreeData,
    addTopLevelFallback,
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
  }
}
