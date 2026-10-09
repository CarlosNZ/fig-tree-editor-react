import {
  type BasicType,
  type ExpectedType,
  type FragmentParameter,
  type OperatorInfo,
  type ParameterInfo,
  type TypeDeclaration,
} from 'fig-tree-evaluator'
import { typeSeeds } from 'fig-tree-evaluator/catalog'
import { positionalLayout } from 'fig-tree-evaluator/format'
import { rowAt, type Classification } from './classify'
import { type DisplayData } from './displayData'
import { type Path } from './paths'
import { elementAdmits, takesElements, type Slot } from './slots'

// The value everything the editor creates for a declared parameter starts as
// (design, topic 4, "Adding parameters and starting values"): its seed from
// the display data, otherwise a value for its declared type. The runtime
// `default` is deliberately not a step, since a parameter is usually added to
// change it, so a boolean or literal union never starts at its effective
// default: where the rule gives exactly that value, a boolean starts as its
// negation, and a literal union at its first member that is not the default.

export const getStartingValue = (
  parameter: string,
  declaration: ParameterInfo | FragmentParameter,
  seeds: Record<string, unknown>
): unknown => {
  const value = Object.prototype.hasOwnProperty.call(seeds, parameter)
    ? seeds[parameter]
    : typeValue(declaration.type)
  // A copy, so the tree never shares an object with the display data
  return awayFromDefault(structuredClone(value), declaration)
}

// The value a node switched to a plain value starts as (design, topic 2,
// "Node lifecycle"): a declared parameter's starting value where the node is
// one, otherwise a value for what its position admits, which is the string
// seed where it admits anything
export const getSlotValue = (
  slot: Slot | undefined,
  { classification, displayData }: Pick<ElementContext, 'classification' | 'displayData'>
): unknown => {
  if (slot?.role === 'parameter' && slot.parameter !== undefined && slot.declaration) {
    const owner = rowAt(classification, slot.ownerPath ?? [])?.kind
    const seeds =
      owner?.kind === 'operator'
        ? displayData.operators[owner.operator ?? '']?.seeds
        : owner?.kind === 'fragment'
          ? displayData.fragments[owner.name ?? '']?.seeds
          : undefined
    return getStartingValue(
      slot.parameter,
      slot.declaration as ParameterInfo | FragmentParameter,
      seeds ?? {}
    )
  }
  return structuredClone(typeValue(slot?.admits ?? 'any'))
}

// The value an element added to the end of an array starts as (the same
// section, "An element added to an array"). What it binds comes from the
// array's row: an element of an array parameter, or on an argument list the
// position it takes, where a leading position starts as its parameter would.
// An element of an array parameter starts as the first of these that applies:
//
// 1. In a homogeneous array, the type seed of the type its literal siblings
//    share, so an add never breaks the constraint. Null siblings don't count.
// 2. The parameter seed's element at the new index, otherwise its last.
// 3. A value for what the element admits, an `elementShape` giving an object
//    of its required fields.
//
// Anything else (plain data, and content that isn't evaluated) admits
// anything, so starts as the `any` seed.

export interface ElementContext {
  classification: Classification
  operators: readonly OperatorInfo[]
  displayData: DisplayData
}

export const getStartingElement = (
  arrayPath: Path,
  array: readonly unknown[],
  { classification, operators, displayData }: ElementContext
): unknown => {
  const seedsAt = (ownerPath: Path) => {
    const kind = rowAt(classification, ownerPath)?.kind
    if (kind?.kind === 'operator') return displayData.operators[kind.operator ?? '']?.seeds ?? {}
    if (kind?.kind === 'fragment') return displayData.fragments[kind.name ?? '']?.seeds ?? {}
    return {}
  }
  // The literal siblings from `from` on: rows that are neither a node nor a
  // reference, nor a container of one
  const literalSiblings = (from: number) =>
    array.filter(
      (element, index) =>
        index >= from &&
        element !== null &&
        rowAt(classification, [...arrayPath, index])?.kind === undefined
    )

  const slot = rowAt(classification, arrayPath)?.slot
  if (slot?.role === 'parameter' && takesElements(slot.declaration)) {
    const declaration = slot.declaration as ParameterInfo | FragmentParameter
    return structuredClone(
      elementValue(
        slot.parameter!,
        declaration,
        seedsAt(slot.ownerPath!),
        array.length,
        literalSiblings(0)
      )
    )
  }

  // An argument list, bound through the operator's positional layout
  const ownerPath = arrayPath.slice(0, -1)
  const owner = rowAt(classification, ownerPath)?.kind
  const operator =
    owner?.kind === 'operator' &&
    owner.form === 'shorthand' &&
    owner.malformed === undefined &&
    arrayPath.at(-1) === `$${owner.name}`
      ? operators.find(({ name }) => name === owner.operator)
      : undefined
  const layout = operator && positionalLayout(operator, array.length + 1)
  if (operator && layout) {
    const seeds = seedsAt(ownerPath)
    if (array.length < layout.bound) {
      const name = operator.positionalParams![array.length]
      return getStartingValue(name, operator.parameters[name], seeds)
    }
    const rest = operator.restParam
    if (layout.restAt !== null && rest !== null)
      return structuredClone(
        elementValue(
          rest,
          operator.parameters[rest],
          seeds,
          array.length - layout.restAt,
          literalSiblings(layout.restAt)
        )
      )
  }

  return structuredClone(typeSeeds.any)
}

const elementValue = (
  parameter: string,
  declaration: ParameterInfo | FragmentParameter,
  seeds: Record<string, unknown>,
  index: number,
  literals: unknown[]
): unknown => {
  const { homogeneous, elementShape } = declaration.constraints ?? {}
  const shared =
    homogeneous && literals.length > 0
      ? homogeneous.find((type) => literals.every(hasType[type]))
      : undefined
  if (shared !== undefined) return typeSeeds[shared]

  const seed = Object.prototype.hasOwnProperty.call(seeds, parameter) ? seeds[parameter] : undefined
  if (Array.isArray(seed) && seed.length > 0) return seed[Math.min(index, seed.length - 1)]

  if (elementShape) return shapeValue(elementShape)
  return typeValue(elementAdmits(declaration))
}

// Each field is required unless it says otherwise, as fig-tree reads it
const shapeValue = (shape: Record<string, TypeDeclaration>) =>
  Object.fromEntries(
    Object.entries(shape)
      .filter(([, field]) => field.required !== false)
      .map(([name, field]) => [name, typeValue(field.type ?? 'any')])
  )

// Whether a value is of a basic type, as fig-tree's `homogeneous` check reads
// it
const hasType: Record<BasicType, (value: unknown) => boolean> = {
  any: () => true,
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number',
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
  array: (value) => Array.isArray(value),
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  null: (value) => value === null,
}

// A value of a declared type: a literal union's first member, otherwise the
// type seed of the type, or of a union's first non-null member
export const typeValue = (type: ExpectedType): unknown => {
  if (isLiteralUnion(type)) return type.literal[0]
  if (typeof type === 'string') return typeSeeds[type]
  const members: readonly BasicType[] = type
  return typeSeeds[members.find((member) => member !== 'null') ?? 'null']
}

const awayFromDefault = (value: unknown, declaration: ParameterInfo | FragmentParameter) => {
  const effective =
    'hostDefault' in declaration && declaration.hostDefault !== undefined
      ? declaration.hostDefault
      : declaration.default
  if (effective === undefined || value !== effective) return value
  const { type } = declaration
  if (typeof value === 'boolean' && isBoolean(type)) return !value
  if (isLiteralUnion(type)) return type.literal.find((member) => member !== effective) ?? value
  return value
}

const isLiteralUnion = (
  type: ExpectedType
): type is { literal: readonly (string | number | boolean)[] } =>
  typeof type === 'object' && !Array.isArray(type)

// `boolean`, or `boolean` or null
const isBoolean = (type: ExpectedType) =>
  type === 'boolean' ||
  (Array.isArray(type) &&
    type.includes('boolean') &&
    type.every((member) => member === 'boolean' || member === 'null'))
