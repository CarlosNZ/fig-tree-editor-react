import { EvaluatorNode } from 'fig-tree-evaluator'
import { JsonData } from 'json-edit-react'
import { useRef, useState } from 'react'

export const useCurrentlyEditing = () => {
  const [currentEditPath, setCurrentEditPath] = useState<string | null>(null)
  const keepEditingFlag = useRef<boolean>(false)
  const [prevState, setPrevState] = useState<EvaluatorNode>()

  const startEditing = (path: string, data: EvaluatorNode) => {
    setCurrentEditPath(path)
    setPrevState(data)
  }

  const stopEditing = () => {
    setCurrentEditPath(null)
    const prev = prevState
    setPrevState(undefined)
    return prev
  }

  const switchNodeType = () => {
    keepEditingFlag.current = true
    setTimeout(() => (keepEditingFlag.current = false), 1000)
  }

  const isEditing = (testPath: string) => testPath === currentEditPath || keepEditingFlag.current

  const toPathString = (path: Array<string | number>) => path.join('.')

  return { currentEditPath, startEditing, stopEditing, switchNodeType, isEditing, toPathString }
}
