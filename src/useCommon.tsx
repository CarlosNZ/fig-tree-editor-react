// Common functionality for Node components
import { useEffect, useState } from 'react'
import { OperatorProps } from './Operator'
import { NodeData } from 'json-edit-react'
import { getAliases } from './helpers'

interface Input {
  customNodeProps: OperatorProps
  parentData: object | unknown[] | null
  nodeData: NodeData
  onEdit: (value: unknown, path: (string | number)[]) => Promise<string | void>
}

export const useCommon = ({ customNodeProps, parentData, nodeData, onEdit }: Input) => {
  const { evaluateNode, topLevelAliases, operatorDisplay, setCurrentlyEditing, CurrentEdit } =
    customNodeProps
  const {
    currentEditPath,
    setCurrentEditPath,
    isEditing: isEditingTest,
    toPathString,
  } = CurrentEdit
  const [prevState, setPrevState] = useState(parentData)
  const [loading, setLoading] = useState(false)

  const expressionPath = nodeData.path.slice(0, -1)
  const pathAsString = toPathString(nodeData.path)

  const handleSubmit = () => {
    setPrevState(parentData)
    setCurrentEditPath(null)
  }

  const handleCancel = () => {
    onEdit(prevState, expressionPath)
    setCurrentEditPath(null)
  }

  const startEditing = () => {
    setCurrentEditPath(pathAsString)
  }

  const isEditing = () => isEditingTest(pathAsString)

  const listenForSubmit = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') handleCancel()
  }

  useEffect(() => {
    if (isEditing()) {
      setPrevState(parentData)
      window.addEventListener('keydown', listenForSubmit)
    } else window.removeEventListener('keydown', listenForSubmit)
    return () => window.removeEventListener('keydown', listenForSubmit)
  }, [currentEditPath])

  const aliases = { ...topLevelAliases, ...getAliases(parentData) }

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
  }
}
