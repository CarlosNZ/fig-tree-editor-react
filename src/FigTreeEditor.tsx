import { useInsertionEffect } from 'react'
import { JsonEditor, type JsonEditorProps } from 'json-edit-react'
import { type FigTree } from 'fig-tree-evaluator'
import { injectStyles } from './injectStyles'

// Expressions are typed `unknown`, as fig-tree's own methods take them: any
// JSON value is an expression, and `validate()` is what says whether it's a
// good one. The remaining props are json-edit-react's, passed straight
// through.
export interface FigTreeEditorProps extends Omit<JsonEditorProps, 'data' | 'setData'> {
  // TO-DO: validate against it on every update (plan, 2.2)
  figTree: FigTree
  expression: unknown
  setExpression: (expression: unknown) => void
}

export const FigTreeEditor = ({
  figTree: _figTree,
  expression,
  setExpression,
  className,
  ...props
}: FigTreeEditorProps) => {
  useInsertionEffect(() => {
    injectStyles()
  }, [])

  return (
    <JsonEditor
      {...props}
      className={className ? `ft-editor ${className}` : 'ft-editor'}
      data={expression}
      setData={setExpression}
    />
  )
}
