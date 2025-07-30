/**
 * This hook allows the editor to keep track of which node is being edited at
 * the top level, which achieves two things:
 * - ensures only one "FigTree" node can be edited at a time
 * - tracks when switching a node between "Operator" and "Fragment" and *not*
 *   cancel the editing for that node even though the "path" has changed
 */

import { EvaluatorNode, isObject } from 'fig-tree-evaluator'
import { useState } from 'react'

export interface CurrentlyEditingReturnType {
  currentEditPath: string | null
  setCurrentEditPath: (path: string | null) => void
  isEditing: (testPath: string) => boolean
  switchNodeType: (pathPart: Array<string | number>) => void
  toPathString: (path: Array<string | number>) => string
  prevState: EvaluatorNode
  setPrevState: (exp: EvaluatorNode) => void
  hasSwitchedFromOtherNodeType: (currentExpression: EvaluatorNode) => boolean
}

export const useCurrentlyEditing = (): CurrentlyEditingReturnType => {
  const [prevState, setPrevState] = useState<EvaluatorNode>()
  const [currentEditPath, setCurrentEditPath] = useState<string | null>(null)

  const switchNodeType = (newPath: Array<string | number>) => {
    setCurrentEditPath(toPathString(newPath))
  }

  const isEditing = (testPath: string) => testPath === currentEditPath

  const toPathString = (path: Array<string | number>) => path.join('.')

  const hasSwitchedFromOtherNodeType = (currentExpression: EvaluatorNode) => {
    if (!prevState) return false
    if (!isObject(currentExpression) || !isObject(prevState)) return false
    if ('operator' in currentExpression && !('operator' in prevState)) return true
    if ('fragment' in currentExpression && !('fragment' in prevState)) return true
    if (
      'operator' in prevState &&
      'operator' in currentExpression &&
      currentExpression.operator !== prevState.operator
    )
      return true
    return false
  }

  return {
    currentEditPath,
    setCurrentEditPath,
    isEditing,
    switchNodeType,
    toPathString,
    prevState,
    setPrevState,
    hasSwitchedFromOtherNodeType,
  }
}
