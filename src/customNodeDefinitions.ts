import {
  type CustomComponentProps,
  type CustomNodeDefinition,
  type NodeData,
} from 'json-edit-react'
import { type FC } from 'react'
import { type FigTree } from 'fig-tree-evaluator'
import { type IssueIndex } from './attachIssues'
import { rowAt, type Classification, type Row } from './classify'
import { type DisplayData } from './displayData'
import { type EditorTheme } from './editorTheme'
import { Operator } from './Operator'
import { Placeholder } from './Placeholder'

// The editor's custom node definitions (design, topic 1, "Node shapes and
// their definitions"; docs-dev/v3-node-anatomy.md), in first-match order:
// json-edit-react gives each row the first definition whose condition
// matches. Every condition is a lookup in the classification walk's map, so
// a row's kind is worked out once per update rather than per row.
//
// TO-DO: each phase replaces the placeholder components with its own (plan,
// Phases 7 to 9).

// What every component reads, through `componentProps`: json-edit-react's
// route for configuration a component needs
export interface Shared {
  figTree: FigTree
  classification: Classification
  displayData: DisplayData
  issues: IssueIndex // by the row each shows on
  editorTheme: EditorTheme // merged over the defaults
}

export type DefinitionName =
  | 'operator'
  | 'fragment'
  | 'shorthand'
  | 'literal'
  | 'reference'
  | 'container'
  | 'comment'
  | 'commentLine'
  | 'flattened'
  | 'unlabelled'

export interface ComponentConfig extends Shared {
  definition: DefinitionName
  unlabelled?: boolean // an unlabelled copy, on a `$name` row
}

type Condition = (row: Row, nodeData: NodeData) => boolean

// Each definition's component, where it has one yet; the rest show the
// placeholder
const COMPONENTS: Partial<Record<DefinitionName, FC<CustomComponentProps<ComponentConfig>>>> = {
  operator: Operator,
}

export const customNodeDefinitions = (shared: Shared): CustomNodeDefinition[] => {
  const matches =
    (condition: Condition) =>
    (nodeData: NodeData): boolean => {
      const row = rowAt(shared.classification, nodeData.path)
      return row !== undefined && condition(row, nodeData)
    }

  const definition = (
    name: DefinitionName,
    condition: (nodeData: NodeData) => boolean,
    flags: Partial<CustomNodeDefinition> = {}
  ): CustomNodeDefinition => ({
    condition,
    component: (COMPONENTS[name] ?? Placeholder) as unknown as CustomNodeDefinition['component'],
    componentProps: { ...shared, definition: name } satisfies ComponentConfig,
    ...flags,
  })

  // A kind that can sit in a `$name` row as a single value comes in two: a
  // copy without its key label for that row, then the definition itself
  // (design, "Why unlabelled definitions are copies")
  const unlabelledVariants = (base: CustomNodeDefinition): CustomNodeDefinition[] => [
    {
      ...base,
      condition: (nodeData) =>
        rowAt(shared.classification, nodeData.path)?.payload === 'unlabelled' &&
        base.condition(nodeData),
      componentProps: { ...base.componentProps, unlabelled: true },
      showKey: false,
    },
    base,
  ]

  const isKind =
    (kind: NonNullable<Row['kind']>['kind'], form?: 'full' | 'shorthand') =>
    ({ kind: rowKind }: Row) =>
      rowKind?.kind === kind && (form === undefined || ('form' in rowKind && rowKind.form === form))

  const isComment = matches(isKind('comment'))

  return [
    // A full node owns both its editors: every edit session renders the
    // component, which shows json-edit-react's raw-JSON editor as
    // `originalNode` or its own toolbar (design, topic 2, "Two editors per
    // node")
    ...unlabelledVariants(
      definition('operator', matches(isKind('operator', 'full')), {
        showOnEdit: true,
        passOriginalNode: true,
      })
    ),
    ...unlabelledVariants(definition('fragment', matches(isKind('fragment', 'full')))),
    ...unlabelledVariants(
      definition(
        'shorthand',
        matches(
          (row) => isKind('operator', 'shorthand')(row) || isKind('fragment', 'shorthand')(row)
        )
      )
    ),
    ...unlabelledVariants(definition('literal', matches(isKind('literal')))),
    ...unlabelledVariants(
      definition('reference', matches(isKind('reference')), { passOriginalNode: true })
    ),
    // Only the root's gets the bare Evaluate button, for now (topic 3)
    definition(
      'container',
      matches((row, { path }) => isKind('container')(row) && path.length === 0)
    ),
    // A comment of several lines is one block, with no key label. Its lines
    // are quoted, so they have no row of their own: each is found by its
    // parent's
    definition('comment', (nodeData) => isComment(nodeData) && Array.isArray(nodeData.value), {
      showKey: false,
    }),
    definition(
      'commentLine',
      (nodeData) =>
        typeof nodeData.value === 'string' &&
        (isComment(nodeData) ||
          (Array.isArray(nodeData.parentData) &&
            isComment({ ...nodeData, path: nodeData.path.slice(0, -1) }))),
      { showKey: false, passOriginalNode: true }
    ),
    definition(
      'flattened',
      matches((row) => row.payload === 'flattened'),
      { showCollectionWrapper: false, showKey: false }
    ),
    // A `$name` row holding a plain value or an argument list
    definition(
      'unlabelled',
      matches((row) => row.payload === 'unlabelled'),
      { showKey: false, passOriginalNode: true }
    ),
  ]
}
