import {
  type CustomComponentProps,
  type CustomNodeDefinition,
  type NodeData,
} from 'json-edit-react'
import { type FC } from 'react'
import { type FigTree, type ReferenceNamespace } from 'fig-tree-evaluator'
import { flaggedIssues, type IssueIndex } from './attachIssues'
import { type ReferenceNames } from './conversions'
import { rowAt, type Classification, type Row } from './classify'
import { CommentLine } from './CommentLine'
import { commentPart } from './comments'
import { Container } from './Container'
import { type DisplayData } from './displayData'
import { type EditorTheme } from './editorTheme'
import { type Evaluator } from './evaluation'
import { getStartingFragment } from './getStartingFragment'
import { getStartingNode, type DefaultOperators } from './getStartingNode'
import { Fragment } from './Fragment'
import { Flagged } from './IssueFlag'
import { Operator } from './Operator'
import { hasCard } from './parameterCard'
import { ParameterKey } from './ParameterKey'
import { type Path } from './paths'
import { PlainCollection, PlainRun } from './PlainRun'
import { Reference } from './Reference'
import { plainMark, type RunMarks } from './runMarks'
import { Shorthand } from './Shorthand'
import { strings } from './strings'
import { REFERENCE_ENTRIES, referenceStart } from './typeOptions'

// The editor's custom node definitions (design, topic 1, "Node shapes and
// their definitions"; docs-dev/v3-node-anatomy.md), in first-match order:
// json-edit-react gives each row the first definition whose condition
// matches. Every condition is a lookup in the classification walk's map, so
// a row's kind is worked out once per update rather than per row.

// What every component reads, through `componentProps`: json-edit-react's
// route for configuration a component needs
export interface Shared {
  figTree: FigTree
  classification: Classification
  displayData: DisplayData
  issues: IssueIndex // by the row each shows on
  nodeIssues: IssueIndex // by the node each marks (`attachToNodes`)
  editorTheme: EditorTheme // merged over the defaults
  defaultOperators: DefaultOperators | undefined
  defaultFragment: string | undefined
  referenceNames: ReferenceNames
  // The node the type dropdown has just created, which its component opens
  // its picker on (design, topic 2, "Node lifecycle")
  created: { current: CreatedNode | null }
  // Runs each Evaluate, one at a time, keeping its identity for the editor's
  // lifetime (evaluation.ts)
  evaluator: Evaluator
  run: RunMarks | null // how the rows ran in the latest evaluation
  evaluationData: Record<string, unknown> | undefined // the host's `$data`
}

export interface CreatedNode {
  path: Path
  node: object // as the dropdown committed it, before the fill-in step
  replaced: unknown // the value it replaced, which ✗ restores
}

export type DefinitionName =
  | 'operator'
  | 'fragment'
  | 'shorthand'
  | 'reference'
  | 'container'
  | 'comment'
  | 'commentLine'
  | 'flattened'
  | 'unlabelled'
  | 'plainValue'
  | 'plainCollection'

export interface ComponentConfig extends Shared {
  definition: DefinitionName
  unlabelled?: boolean // an unlabelled copy, on a `$name` row
  entry?: string // a reference definition's entry in the type dropdown
}

type Condition = (row: Row, nodeData: NodeData) => boolean

// Each definition's component. A flattened payload has none: json-edit-react
// draws its rows, and its flags hide the row itself. Nor has an unlabelled row
// or a comment of several lines: json-edit-react draws them, without their
// key, and the theme draws the comment's block. Nor has a plain collection
// the evaluation marked, which json-edit-react draws, inside a wrapper.
const COMPONENTS: Record<DefinitionName, FC<CustomComponentProps<ComponentConfig>> | null> = {
  operator: Operator,
  fragment: Fragment,
  shorthand: Shorthand,
  reference: Reference,
  container: Container,
  comment: null,
  commentLine: CommentLine,
  flattened: null,
  unlabelled: null,
  plainValue: PlainRun,
  plainCollection: null,
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
    ...(COMPONENTS[name] !== null && {
      component: COMPONENTS[name] as unknown as CustomNodeDefinition['component'],
    }),
    keyComponent: ParameterKey as unknown as CustomNodeDefinition['keyComponent'],
    componentProps: { ...shared, definition: name } satisfies ComponentConfig,
    ...flags,
  })

  // A kind that can sit in a `$name` row as a single value comes in two: the
  // definition itself, then a copy without its key label for that row
  // (design, "Why unlabelled definitions are copies"). They match disjoint
  // rows, and the definition comes first, since json-edit-react finds a type
  // switch's definition by name alone, taking the first: the key's own
  // component leaves out an unlabelled row's key, so the switch shows the
  // right key either way.
  const unlabelledVariants = (base: CustomNodeDefinition): CustomNodeDefinition[] => {
    const unlabelled = ({ path }: NodeData) =>
      rowAt(shared.classification, path)?.payload === 'unlabelled'
    return [
      { ...base, condition: (nodeData) => !unlabelled(nodeData) && base.condition(nodeData) },
      {
        ...base,
        condition: (nodeData) => unlabelled(nodeData) && base.condition(nodeData),
        componentProps: { ...base.componentProps, unlabelled: true },
        showKey: false,
      },
    ]
  }

  const isKind =
    (kind: NonNullable<Row['kind']>['kind'], form?: 'full' | 'shorthand') =>
    ({ kind: rowKind }: Row) =>
      rowKind?.kind === kind && (form === undefined || ('form' in rowKind && rowKind.form === form))

  const isFullOperator = (row: Row) =>
    isKind('operator', 'full')(row) || isKind('literal', 'full')(row)

  const isPart = (part: ReturnType<typeof commentPart>) => (nodeData: NodeData) =>
    commentPart(shared.classification, nodeData) === part

  // A plain value, or a plain collection, that the latest evaluation marked
  const isPlainRun =
    (collection: boolean) =>
    (_: Row, { path, value }: NodeData) =>
      plainMark(shared.run, path) !== undefined &&
      (typeof value === 'object' && value !== null) === collection

  // The type dropdown's Operator entry: the slot's default operator, marked
  // so the node's picker opens on it
  const startOperator = (nodeData: NodeData) => {
    const row = rowAt(shared.classification, nodeData.path)
    const node = getStartingNode(row?.slot?.admits ?? 'any', {
      operators: shared.figTree.getOperators(),
      displayData: shared.displayData,
      defaultOperators: shared.defaultOperators,
    })
    shared.created.current = { path: nodeData.path, node, replaced: nodeData.value }
    return node
  }

  // The type dropdown's Fragment entry: the slot's starting fragment, marked
  // the same way. It's offered only where a fragment can fit, so there is
  // always one.
  const startFragment = (nodeData: NodeData) => {
    const row = rowAt(shared.classification, nodeData.path)
    const node = getStartingFragment(row?.slot?.admits ?? 'any', {
      fragments: shared.figTree.getFragments(),
      displayData: shared.displayData,
      defaultFragment: shared.defaultFragment,
    })
    if (node === null) return nodeData.value
    shared.created.current = { path: nodeData.path, node, replaced: nodeData.value }
    return node
  }

  // One named definition per reference entry, so a reference row shows its
  // entry as its type (topic 4, "The type dropdown"). Choosing an entry keeps
  // the input open for the path (`editOnTypeSwitch`). Parameter, for
  // `$params`, is never offered while fragment-definition mode is parked.
  // TO-DO: offer Error, for `$error`, inside a fallback, once its starting
  // value is settled.
  const referenceEntry = (
    namespaces: ReferenceNamespace[],
    start: 'data' | 'vars' | 'element' | undefined
  ) =>
    unlabelledVariants(
      definition(
        'reference',
        matches(({ kind }) => kind?.kind === 'reference' && namespaces.includes(kind.namespace)),
        {
          name: REFERENCE_ENTRIES[namespaces[0]],
          componentProps: {
            ...shared,
            definition: 'reference',
            entry: REFERENCE_ENTRIES[namespaces[0]],
          } satisfies ComponentConfig,
          showInTypeSelector: true,
          showOnEdit: true,
          passOriginalNode: true,
          editOnTypeSwitch: start !== undefined,
          defaultValue: (nodeData: NodeData) =>
            start === undefined
              ? nodeData.value
              : referenceStart(
                  start,
                  rowAt(shared.classification, nodeData.path),
                  nodeData.fullData,
                  shared.referenceNames
                ),
        }
      )
    )

  // A row json-edit-react draws takes the flag where it has an error or a
  // warning (design, topic 7, "Where issues attach"): a definition with no
  // component of its own comes in two, with the flag first. The editor's own
  // components draw their own.
  const flagged = (base: CustomNodeDefinition): CustomNodeDefinition => ({
    ...base,
    condition: (nodeData) =>
      flaggedIssues(shared.issues, nodeData.path).length > 0 && base.condition(nodeData),
    component: Flagged as unknown as CustomNodeDefinition['component'],
    passOriginalNode: true,
  })
  const withFlag = (base: CustomNodeDefinition) => [flagged(base), base]

  return [
    // A full node owns both its editors: every edit session renders the
    // component, which shows json-edit-react's raw-JSON editor as
    // `originalNode` or its own toolbar (design, topic 2, "Two editors per
    // node"). A `literal` is an operator node in every way but its content,
    // which is quoted, so it shares the definition, and a switch to or from
    // it keeps the toolbar (plan, 9.3).
    ...unlabelledVariants(
      definition('operator', matches(isFullOperator), {
        showOnEdit: true,
        passOriginalNode: true,
        name: strings.FT_TYPE_OPERATOR,
        defaultValue: startOperator,
      })
    ),
    ...unlabelledVariants(
      definition('fragment', matches(isKind('fragment', 'full')), {
        showOnEdit: true,
        passOriginalNode: true,
        name: strings.FT_TYPE_FRAGMENT,
        defaultValue: startFragment,
      })
    ),
    ...unlabelledVariants(
      definition(
        'shorthand',
        matches(
          (row) =>
            isKind('operator', 'shorthand')(row) ||
            isKind('fragment', 'shorthand')(row) ||
            isKind('literal', 'shorthand')(row)
        )
      )
    ),
    ...referenceEntry(['data'], 'data'),
    ...referenceEntry(['vars'], 'vars'),
    ...referenceEntry(['element', 'index'], 'element'),
    ...referenceEntry(['params'], undefined),
    ...referenceEntry(['error'], undefined),
    // Only the root's gets the bare Evaluate button, for now (topic 3)
    definition(
      'container',
      matches((row, { path }) => isKind('container')(row) && path.length === 0)
    ),
    // A comment of several lines is one block, with no key label, and each
    // line, or a comment of one, is a note. Editing is json-edit-react's own
    // input (design, topic 5, "Comments").
    definition('comment', isPart('lines'), { showKey: false }),
    definition(
      'commentLine',
      (nodeData) =>
        typeof nodeData.value === 'string' &&
        (isPart('note')(nodeData) || isPart('line')(nodeData)),
      { showKey: false }
    ),
    // A shorthand's named payload or a fragment call's static arguments, whose
    // rows show as the node's own; the theme takes out the indent its row
    // would add (design, topic 1, "Flattened payloads and unlabelled rows")
    definition(
      'flattened',
      matches((row) => row.payload === 'flattened'),
      { showCollectionWrapper: false, showKey: false }
    ),
    // Plain data the latest evaluation marked, a `$name` row's included,
    // drawn by json-edit-react with its mark (topic 7, "How it ran, in the
    // tree")
    ...unlabelledVariants(
      definition('plainValue', matches(isPlainRun(false)), { passOriginalNode: true })
    ).flatMap(withFlag),
    ...unlabelledVariants(
      definition('plainCollection', matches(isPlainRun(true)), {
        wrapperComponent: PlainCollection as unknown as CustomNodeDefinition['wrapperComponent'],
        wrapperProps: { run: shared.run, editorTheme: shared.editorTheme },
      })
    ).flatMap(withFlag),
    // A `$name` row holding a plain value or an argument list
    ...withFlag(
      definition(
        'unlabelled',
        matches((row) => row.payload === 'unlabelled'),
        { showKey: false }
      )
    ),
    // Any other row with a hover card, such as a plain value at a parameter,
    // keeps json-edit-react's rendering, and gains only the card on its key
    ...withFlag({
      condition: matches(hasCard),
      keyComponent: ParameterKey as unknown as CustomNodeDefinition['keyComponent'],
      componentProps: { ...shared },
    }),
    // Any row left with an error or a warning, such as an unknown key or a
    // var, gains only its flag
    flagged({ condition: () => true, componentProps: { ...shared } }),
  ]
}
