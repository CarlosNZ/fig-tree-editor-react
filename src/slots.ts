import {
  type BasicType,
  type ExpectedType,
  type FragmentParameter,
  type ParameterInfo,
  type TypeDeclaration,
} from 'fig-tree-evaluator'
import { type Path } from './paths'

// A slot is a position whose value is evaluated and delivered somewhere with
// an expectation attached (design, topic 4, "Slots"). The classification walk
// records one for every such row, so the type dropdown, the pickers, the
// starting values, the guards and sub-tree evaluation all read one answer. A
// slot says what a position expects; `validate()` says whether the value
// there is valid.

export type SlotRole =
  | 'parameter' // a declared or undeclared parameter, or fragment argument
  | 'element' // an element of an array parameter
  | 'entry' // a value in a `lazyEntries` map (`match.branches`)
  | 'field' // a field of an `elementShape` element (`buildObject.entries`)
  | 'arguments' // a fragment call's `parameters`, computed
  | 'modifier' // `fallback`, `useCache`
  | 'var' // a value in a `vars` block
  | 'data' // plain data inside an evaluated position
  | 'root'

// A field's declaration is its `elementShape` entry
export type Declaration = ParameterInfo | FragmentParameter | TypeDeclaration

export interface Slot {
  path: Path
  // The node whose declaration this slot belongs to, recorded rather than
  // derived, since how far up it is depends on the node's form. Null at the
  // root and in plain data outside any node.
  ownerPath: Path | null
  role: SlotRole
  parameter?: string // the declared name, where there is one
  declaration?: Declaration
  admits: ExpectedType
  literalOnly: boolean // `as`, `useCache`: no nodes or references
}

const slot = (
  path: Path,
  ownerPath: Path | null,
  role: SlotRole,
  admits: ExpectedType,
  extra: Partial<Slot> = {}
): Slot => ({ path, ownerPath, role, admits, literalOnly: false, ...extra })

export const rootSlot = (): Slot => slot([], null, 'root', 'any')

export const dataSlot = (path: Path, ownerPath: Path | null) => slot(path, ownerPath, 'data', 'any')

// An undeclared parameter admits anything: `validate()` reports the key
export const parameterSlot = (
  path: Path,
  ownerPath: Path,
  parameter: string,
  declaration: ParameterInfo | FragmentParameter | undefined
) =>
  slot(path, ownerPath, 'parameter', declaration?.type ?? 'any', {
    parameter,
    declaration,
    literalOnly: declaration !== undefined && isStructural(declaration),
  })

export const elementSlot = (
  path: Path,
  ownerPath: Path,
  parameter: string,
  declaration: ParameterInfo | FragmentParameter | undefined
) =>
  slot(path, ownerPath, 'element', declaration ? elementAdmits(declaration) : 'any', {
    parameter,
    declaration,
  })

export const entrySlot = (
  path: Path,
  ownerPath: Path,
  parameter: string,
  declaration: ParameterInfo
) => slot(path, ownerPath, 'entry', 'any', { parameter, declaration })

export const fieldSlot = (
  path: Path,
  ownerPath: Path,
  field: string,
  declaration: TypeDeclaration
) => slot(path, ownerPath, 'field', declaration.type ?? 'any', { parameter: field, declaration })

export const argumentsSlot = (path: Path, ownerPath: Path) =>
  slot(path, ownerPath, 'arguments', 'object', { parameter: 'parameters' })

export const modifierSlot = (path: Path, ownerPath: Path, modifier: 'fallback' | 'useCache') =>
  modifier === 'fallback'
    ? slot(path, ownerPath, 'modifier', 'any', { parameter: modifier })
    : slot(path, ownerPath, 'modifier', 'boolean', { parameter: modifier, literalOnly: true })

export const varSlot = (path: Path, ownerPath: Path) => slot(path, ownerPath, 'var', 'any')

// Whether a literal array at this parameter is a list of elements, each a
// slot of its own, rather than plain data
export const takesElements = (declaration: Declaration | undefined) => {
  const type = declaration?.type
  return type === 'array' || (Array.isArray(type) && type.includes('array'))
}

// The metadata declares no element type, so an element admits what the
// constraints say: the `homogeneous` types, an object for an
// `elementShape`, and anything otherwise. It admits null where the
// container declares an `elementNullPolicy` or `truthiness`.
const elementAdmits = (declaration: ParameterInfo | FragmentParameter): ExpectedType => {
  const { homogeneous, elementShape } = declaration.constraints ?? {}
  const types: BasicType[] = homogeneous ? [...homogeneous] : elementShape ? ['object'] : []
  if (types.length === 0) return 'any'
  const nullable =
    ('elementNullPolicy' in declaration && declaration.elementNullPolicy !== undefined) ||
    ('truthiness' in declaration && declaration.truthiness)
  return nullable ? [...types, 'null'] : types
}

const isStructural = (declaration: ParameterInfo | FragmentParameter) =>
  'evaluation' in declaration && declaration.evaluation === 'structural'
