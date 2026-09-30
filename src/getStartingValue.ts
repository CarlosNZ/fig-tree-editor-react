import {
  type BasicType,
  type ExpectedType,
  type FragmentParameter,
  type ParameterInfo,
} from 'fig-tree-evaluator'
import { typeSeeds } from 'fig-tree-evaluator/editor-hints'

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

const typeValue = (type: ExpectedType): unknown => {
  if (isLiteralUnion(type)) return type.literal[0]
  if (typeof type === 'string') return typeSeeds[type]
  const members: readonly BasicType[] = type
  return typeSeeds[members.find((member) => member !== 'null') ?? 'null']
}

const awayFromDefault = (value: unknown, declaration: ParameterInfo | FragmentParameter) => {
  const effective =
    'instanceDefault' in declaration && declaration.instanceDefault !== undefined
      ? declaration.instanceDefault
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
