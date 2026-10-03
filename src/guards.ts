import { type FragmentInfo, type OperatorInfo } from 'fig-tree-evaluator'
import { positionalLayout } from 'fig-tree-evaluator/format'
import { type NodeData } from 'json-edit-react'
import { rowAt, type Classification } from './classify'
import { addableKeys } from './parameterOptions'
import { type Path } from './paths'
import { takesElements } from './slots'

// The editor's own restrictions on json-edit-react's ✕ and ＋ (design, topic
// 2, "Guards", and topic 4, "Array constraints"), added to the host's. An
// edit is blocked only where the metadata declares something (a required
// parameter, a fixed length, a positional binding), and only where a valid
// next step is left; everything else is allowed, and `validate()` reports it.
//
// Renaming has no rule of its own: json-edit-react allows it where the row
// can be deleted and its parent accepts adds.

export interface GuardContext {
  classification: Classification
  operators: readonly OperatorInfo[]
  fragments: readonly FragmentInfo[]
}

// ── Deleting ────────────────────────────────────────────────────────────────

// Blocked: the root; a required parameter or field; a full `literal`'s
// `value`, which the walk leaves unrecorded, since it's quoted; a positional
// element bound to a leading parameter, but the last where it's optional,
// since deleting another would shift the rest onto other parameters; a
// `$name` row, which would leave `{}`; and an element that takes its array
// further from a fixed length.
export const canDelete = ({ path, parentData }: NodeData, context: GuardContext) => {
  if (path.length === 0) return false
  const owner = rowAt(context.classification, path.slice(0, -1))?.kind
  if (owner?.kind === 'literal' && owner.form === 'full' && path.at(-1) === 'value') return false
  const row = rowAt(context.classification, path)
  if (row?.payload !== undefined) return false
  const slot = row?.slot
  if (slot === undefined) return true
  const declaration = slot.declaration
  switch (slot.role) {
    case 'parameter': {
      if (typeof path.at(-1) !== 'number') return !declaration?.required
      const siblings = parentData as unknown[]
      return path.at(-1) === siblings.length - 1 && !declaration?.required
    }
    case 'field':
      return declaration?.required === false
    case 'element': {
      const length = declaration?.constraints?.length
      return length === undefined || elementCount(path.slice(0, -1), parentData, context) > length
    }
    default:
      return true
  }
}

// The elements of an array parameter, or of the rest parameter in an argument
// list
const elementCount = (arrayPath: Path, array: unknown, context: GuardContext) => {
  const elements = array as unknown[]
  const operator = argumentListOperator(arrayPath, context)
  const restAt = operator && positionalLayout(operator, elements.length)?.restAt
  return elements.length - (restAt ?? 0)
}

// ── Adding ──────────────────────────────────────────────────────────────────

// Blocked: a full operator node, `literal` included, or fragment call, whose
// toolbar adds its parameters; any other node with nothing left to add; an
// array parameter at its fixed length; and an argument list with no position
// left, or whose rest parameter is at its fixed length.
export const canAdd = ({ path, value }: NodeData, context: GuardContext) => {
  const row = rowAt(context.classification, path)
  if (Array.isArray(value)) {
    const slot = row?.slot
    if (slot?.role === 'parameter' && takesElements(slot.declaration)) {
      const length = slot.declaration?.constraints?.length
      return length === undefined || value.length < length
    }
    const operator = argumentListOperator(path, context)
    if (operator === undefined) return true
    const layout = positionalLayout(operator, value.length + 1)
    if (layout === null) return false
    const rest = operator.restParam
    if (layout.restAt === null || rest === null || value.length < layout.restAt) return true
    const length = operator.parameters[rest].constraints?.length
    return length === undefined || value.length - layout.restAt < length
  }
  if (typeof value !== 'object' || value === null) return true
  const kind = row?.kind
  const isNode = kind?.kind === 'operator' || kind?.kind === 'fragment' || kind?.kind === 'literal'
  if (isNode && kind.form === 'full') return false
  // A key already there, a comment offered again for a line, isn't one ＋
  // can add
  const keys = addableKeys(value as Record<string, unknown>, path, kind, context)
  return keys === null || [...keys.parameters, ...keys.modifiers].some(({ key }) => !(key in value))
}

// The operator whose argument list the array at `arrayPath` is, if it is one
const argumentListOperator = (arrayPath: Path, { classification, operators }: GuardContext) => {
  if (rowAt(classification, arrayPath)?.payload !== 'unlabelled') return undefined
  const owner = rowAt(classification, arrayPath.slice(0, -1))?.kind
  if (owner?.kind !== 'operator' || owner.form !== 'shorthand' || owner.malformed !== undefined)
    return undefined
  return operators.find(({ name }) => name === owner.operator)
}
