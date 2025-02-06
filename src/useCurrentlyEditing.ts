import { useRef, useState } from 'react'

export interface CurrentlyEditingReturnType {
  currentEditPath: string | null
  setCurrentEditPath: (path: string | null) => void
  isEditing: (testPath: string) => boolean
  switchNodeType: () => void
  toPathString: (path: Array<string | number>) => string
}

export const useCurrentlyEditing = (): CurrentlyEditingReturnType => {
  const [currentEditPath, setCurrentEditPath] = useState<string | null>(null)
  const keepEditingFlag = useRef<boolean>(false)

  const switchNodeType = () => {
    keepEditingFlag.current = true
    setTimeout(() => (keepEditingFlag.current = false), 1000)
  }

  const isEditing = (testPath: string) => testPath === currentEditPath || keepEditingFlag.current

  const toPathString = (path: Array<string | number>) => path.join('.')

  return { currentEditPath, setCurrentEditPath, isEditing, switchNodeType, toPathString }
}
