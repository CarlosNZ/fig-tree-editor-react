import { useInsertionEffect, useMemo, useRef } from 'react'
import { type FigTree, type FragmentDefinition, type Issue } from 'fig-tree-evaluator'
import {
  JsonEditor,
  toPathString,
  type JsonEditorProps,
  type UpdateFunction,
} from 'json-edit-react'
import { SEVERITY_RANK } from './attachIssues'
import {
  allowAdd,
  allowTypeSelection,
  defaultValue,
  newKeyOptions,
  checkDefinition,
  removeParameter,
  type DefinitionFields,
} from './definitionShape'
import { definitionNodes } from './definitionNodes'
import { declarationIssues } from './draft'
import { definitionTheme, mergeEditorTheme } from './editorTheme'
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_MAX_WIDTH,
  DEFAULT_MESSAGES_MAX_HEIGHT,
  DEFAULT_MIN_WIDTH,
} from './FigTreeEditor'
import { injectStyles } from './injectStyles'
import { Messages } from './Messages'
import { valueAt, type Path } from './paths'
import { type EditorMessage } from './status'
import { strings } from './strings'
import { UNUSED_PARAM, unusedParameters } from './unusedParameters'

// The rest of a fragment definition beside its body: the parameter
// declarations, description, samples and metadata (fragment-editor-design.md,
// "The definition editor"). The body is the expression editor's, so it isn't
// shown here, and every change reaches `setDefinition` with it kept, as a
// complete definition. The rest are json-edit-react's props, less those the
// editor sets to hold the definition to its shape and draw its fields.
//
// The definition is checked as registration on `figTree` would check it
// ("Validation"), and each issue outside the body is shown on its row and
// listed beneath the tree, as the expression editor shows its issues. So is
// a warning on each declared parameter the body never reads, with a fix that
// removes it ("Parameters").
//
// A whole definition pasted over the root, its body included, replaces the
// definition: the body goes to the expression editor, and the rest is held
// to the shape as any other change is.
export interface FragmentDefinitionEditorProps extends Omit<
  JsonEditorProps,
  | 'data'
  | 'setData'
  | 'newKeyOptions'
  | 'defaultValue'
  | 'allowTypeSelection'
  | 'allowAdd'
  | 'onUpdate'
  | 'customNodeDefinitions'
> {
  figTree: FigTree
  definition: FragmentDefinition
  setDefinition: (definition: FragmentDefinition) => void
}

export const FragmentDefinitionEditor = ({
  figTree,
  definition,
  setDefinition,
  rootName = strings.FT_DEFINITION_ROOT,
  theme,
  id,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidth = DEFAULT_MAX_WIDTH,
  ...props
}: FragmentDefinitionEditorProps) => {
  useInsertionEffect(() => {
    injectStyles()
  }, [])

  const { expression } = definition
  const fields = useMemo(() => withoutBody(definition), [definition])

  // The body of a definition pasted over the root, from the change's check
  // to its write
  const pastedBody = useRef<{ expression: unknown } | null>(null)
  const onUpdate: UpdateFunction = (update) => {
    pastedBody.current = null
    if (update.path.length > 0 || !isPastedDefinition(update.newData))
      return checkDefinition(update)
    const { expression: body, ...rest } = update.newData
    const result = checkDefinition({ ...update, newData: rest })
    if (result !== undefined && 'error' in result) return result
    pastedBody.current = { expression: body }
    return result ?? { data: rest }
  }
  const setData = (next: unknown) =>
    setDefinition({
      ...withoutBody(next as FragmentDefinition),
      expression: pastedBody.current ? pastedBody.current.expression : expression,
    })

  // Worked out on every render, as the expression editor's issues are, since
  // `updateOptions()` changes the registry without changing the instance
  const issues = [
    ...declarationIssues(figTree, definition),
    ...unusedParameters(figTree, definition),
  ].map((issue) => ({ issue, row: drawnRow(fields, issue.path) }))
  const severities = new Map<string, Issue['severity']>()
  for (const { issue, row } of issues) {
    const key = toPathString(row)
    const current = severities.get(key)
    if (current === undefined || SEVERITY_RANK[issue.severity] < SEVERITY_RANK[current])
      severities.set(key, issue.severity)
  }
  const messages: EditorMessage[] = issues.map(({ issue, row }) => ({
    kind: 'issue',
    issue,
    row,
    message: issue.message,
    fixes:
      issue.code === UNUSED_PARAM
        ? [
            {
              label: strings.FT_FIX_REMOVE,
              apply: () => setDefinition(removeParameter(definition, String(issue.path[1]))),
            },
          ]
        : [],
  }))

  const layeredTheme = definitionTheme(theme, {
    severities,
    editorTheme: EDITOR_THEME,
    indent: props.indent ?? JSON_EDIT_REACT_INDENT,
  })

  // The tree and its messages share an outer container, as the expression
  // editor's do, which takes the width the host gives the editor
  return (
    <div
      id={id}
      className="ft-outer-container"
      style={{ minWidth, maxWidth, fontSize: props.baseFontSize ?? DEFAULT_FONT_SIZE }}
    >
      <JsonEditor
        rootName={rootName}
        {...props}
        minWidth={0}
        maxWidth="100%"
        theme={layeredTheme}
        data={fields}
        setData={setData}
        newKeyOptions={newKeyOptions}
        defaultValue={defaultValue}
        allowTypeSelection={allowTypeSelection}
        allowAdd={allowAdd}
        onUpdate={onUpdate}
        customNodeDefinitions={definitionNodes}
      />
      <Messages
        messages={messages}
        maxHeight={DEFAULT_MESSAGES_MAX_HEIGHT}
        editorTheme={EDITOR_THEME}
      />
    </div>
  )
}

// TO-DO: an `editorTheme` prop, as the expression editor has
// (fragment-editor-design.md, build plan, step 7)
const EDITOR_THEME = mergeEditorTheme()

const JSON_EDIT_REACT_INDENT = 2

const withoutBody = ({ expression: _body, ...fields }: FragmentDefinition): DefinitionFields =>
  fields

const isPastedDefinition = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && 'expression' in value

// The row an issue marks: the one at its path, or where that isn't in the
// definition, such as a key registration requires, the nearest above it
const drawnRow = (fields: DefinitionFields, path: Readonly<Path>): Path => {
  for (let length = path.length; length > 0; length--)
    if (valueAt(fields, path.slice(0, length)) !== undefined) return path.slice(0, length)
  return []
}
