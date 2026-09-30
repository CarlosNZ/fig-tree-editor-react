import { type BasicType, type ExpectedType } from 'fig-tree-evaluator'
import { strings } from './strings'

// What a type admits, in words: "a number or null", "one of 'test', 'extract'
// or 'match'", "anything". The operator picker gives it as the reason an
// operator can't go somewhere.

const BASIC: Record<BasicType, string> = {
  any: strings.FT_TYPE_ANY,
  string: strings.FT_TYPE_STRING,
  number: strings.FT_TYPE_NUMBER,
  integer: strings.FT_TYPE_INTEGER,
  boolean: strings.FT_TYPE_BOOLEAN,
  array: strings.FT_TYPE_ARRAY,
  object: strings.FT_TYPE_OBJECT,
  null: strings.FT_TYPE_NULL,
}

export const describeType = (type: ExpectedType): string => {
  if (typeof type === 'string') return BASIC[type]
  if ('literal' in type) {
    const values = type.literal.map((value) =>
      typeof value === 'string' ? `'${value}'` : String(value)
    )
    return values.length === 1 ? values[0] : strings.FT_TYPE_ONE_OF(orList(values))
  }
  if (type.includes('any')) return BASIC.any
  return orList(type.map((member) => BASIC[member]))
}

// "a, b or c"
const orList = (items: string[]) =>
  items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} ${strings.FT_LIST_OR} ${items[items.length - 1]}`
