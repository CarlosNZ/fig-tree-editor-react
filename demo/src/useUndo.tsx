import { useState } from 'react'
import { useUndo as useUndoHook } from '@json-edit-react/utils'
import { UndoRedoButtons } from './UndoRedoButtons'
import { JsonData } from 'json-edit-react'

export const useUndo = (initialData: JsonData) => {
  // The hook is controlled — we own the live data, it keeps the snapshot stacks.
  const [data, setData] = useState<JsonData>(initialData)
  const { set, replace, undo, redo, canUndo, canRedo } = useUndoHook(data, setData)

  // A write the author didn't make (the editor filling in an expression it
  // was given, marked `autoUpdate`) replaces the current state rather than
  // recording a step, so undo never lands on the incomplete version
  const handleChange = (newData: JsonData, options?: { autoUpdate?: boolean }) => {
    if (JSON.stringify(newData) === JSON.stringify(data)) return
    if (options?.autoUpdate) replace(newData)
    else set(newData)
  }

  const UndoRedo = <UndoRedoButtons undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />

  return {
    data,
    setData: handleChange,
    // reset: externalReset,
    // setResetPoint,
    UndoRedo,
  }
}
