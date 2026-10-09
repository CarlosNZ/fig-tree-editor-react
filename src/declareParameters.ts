import { type ExpectedType, type FigTree, type FragmentDefinition } from 'fig-tree-evaluator'
import { recognizeReference } from 'fig-tree-evaluator/format'
import { type Classification } from './classify'
import { valueAt } from './paths'

// A fragment body's declarations, with one added for each parameter the body
// reads that isn't declared (fragment-editor-design.md, "Parameters"). The
// names are fig-tree's, from `getDependencies()`, which finds every form a
// read takes. Each new declaration's type is what the position of the
// reference admits, where a plain reference reads the parameter itself;
// elsewhere (a drill, a template token, a `get`) the position says nothing
// about the parameter's own value, so it's `any`, as it is where the
// positions disagree. An existing declaration is never changed, and an
// unchanged set is returned as it was given.
//
// TO-DO: a `get` whose path is the parameter alone (`{ path: 'x', from:
// '$params' }`) typed by its own position, in each of the node's forms

type Declarations = NonNullable<FragmentDefinition['parameters']>

export const declareParameters = (
  body: unknown,
  declarations: Declarations | undefined,
  figTree: Pick<FigTree, 'getDependencies'>,
  classification: Classification
): Declarations | undefined => {
  const declared = declarations ?? {}
  const undeclared = figTree
    .getDependencies(body)
    .params.names.filter((name) => !Object.prototype.hasOwnProperty.call(declared, name))
  if (undeclared.length === 0) return declarations

  const positions = typesByPosition(body, classification)
  const added = Object.fromEntries(
    undeclared.map((name) => [name, { type: agreedType(positions.get(name) ?? []) }])
  )
  return { ...declared, ...added }
}

// What each parameter's reference rows admit, by name: the slot's type where
// the reference reads the parameter itself, `any` where it drills into it
const typesByPosition = (body: unknown, classification: Classification) => {
  const types = new Map<string, ExpectedType[]>()
  for (const row of classification.values()) {
    if (row.kind?.kind !== 'reference' || row.kind.namespace !== 'params' || !row.slot) continue
    const text = valueAt(body, row.slot.path)
    if (typeof text !== 'string') continue
    const recognition = recognizeReference(text)
    if (recognition.kind !== 'reference') continue
    const [name, ...drill] = recognition.segments
    if (typeof name !== 'string') continue
    const type = drill.length === 0 ? row.slot.admits : 'any'
    types.set(name, [...(types.get(name) ?? []), type])
  }
  return types
}

const agreedType = (types: ExpectedType[]): ExpectedType => {
  const [first, ...rest] = types
  if (first === undefined) return 'any'
  const key = JSON.stringify(first)
  return rest.every((type) => JSON.stringify(type) === key) ? first : 'any'
}
