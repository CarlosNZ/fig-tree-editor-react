/**
 * This hook allows the editor to keep track of which node is being edited at
 * the top level, which achieves two things:
 * - ensures only one "FigTree" node can be edited at a time
 * - tracks when switching a node between "Operator" and "Fragment" and *not*
 *   cancel the editing for that node even though the "path" has changed
 */

import { EvaluatorNode } from 'fig-tree-evaluator'
import { useState } from 'react'

export interface CurrentlyEditingReturnType {
  currentEditPath: string | null
  setCurrentEditPath: (path: string | null) => void
  isEditing: (testPath: string) => boolean
  switchNodeType: (pathPart: Array<string | number>) => void
  toPathString: (path: Array<string | number>) => string
  prevState: EvaluatorNode
  setPrevState: (exp: EvaluatorNode) => void
}

export const useCurrentlyEditing = (): CurrentlyEditingReturnType => {
  const [prevState, setPrevState] = useState<EvaluatorNode>()
  const [currentEditPath, setCurrentEditPath] = useState<string | null>(null)

  const switchNodeType = (newPath: Array<string | number>) => {
    setCurrentEditPath(toPathString(newPath))
  }

  const isEditing = (testPath: string) => testPath === currentEditPath

  const toPathString = (path: Array<string | number>) => path.join('.')

  return {
    currentEditPath,
    setCurrentEditPath,
    isEditing,
    switchNodeType,
    toPathString,
    prevState,
    setPrevState,
  }
}
