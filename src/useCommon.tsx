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
  const {
    evaluateNode,
    topLevelAliases,
    operatorDisplay,
    initialEdit,
    currentlyEditing,
    setCurrentlyEditing,
    editing,
  } = customNodeProps
  const { currentEditPath, startEditing, stopEditing, switchNodeType, isEditing, toPathString } =
    editing
  const [prevState, setPrevState] = useState(parentData)
  // const [isEditing, setIsEditing] = useState(initialEdit.current)
  const [loading, setLoading] = useState(false)

  const expressionPath = nodeData.path.slice(0, -1)

  const handleSubmit = () => {
    setPrevState(parentData)
    stopEditing()
    // initialEdit.current = false
    setCurrentlyEditing(null)
  }

  const handleCancel = () => {
    onEdit(prevState, expressionPath)
    stopEditing()
    // initialEdit.current = false
    setCurrentlyEditing(null)
  }

  const setIsEditing = () => {
    startEditing(nodeData.path, parentData)
  }

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
  }, [isEditing])

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
    isEditing: () => isEditing(nodeData.path.join('.')),
    // currentlyEditing === nodeData.path.join('.') || initialEdit.current,
    setIsEditing,
    // startEditing,
    // setIsEditing: (value: boolean) => {
    //   setIsEditing(value)
    //   initialEdit.current = value
    // },
    // setCurrentlyEditing: (path: string | null) => {
    //   setCurrentlyEditing(path)
    //   if (path) setTimeout(() => (initialEdit.current = true), 500)
    // },
    evaluate,
    loading,
    operatorDisplay,
  }
}
