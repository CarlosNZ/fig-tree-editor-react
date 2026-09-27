import {
  type OperatorMetadata,
  type OperatorAlias,
  type EvaluatorNode,
  type FragmentMetadata,
  type OperatorNode,
  type FragmentNode,
  type OperatorParameterMetadata,
  type FragmentParameterMetadata,
  standardiseOperatorName,
  isObject,
  isAliasString,
} from 'fig-tree-evaluator'
import type { DataType, EnumDefinition, NodeData } from './_imports'

// Returns a valid default value for each (FigTree) data type
export const getDefaultValue = (property: OperatorParameterMetadata) => {
  const { type } = property

  switch (type) {
    case 'string':
      return 'New Value'
    case 'array':
      return []
    case 'boolean':
      return true
    case 'number':
      return 1
    case 'object':
      return {}
    case 'null':
      return null
    case 'any':
    default:
      return 'DEFAULT'
  }
}

export const getCurrentOperator = (
  operatorName: string | undefined,
  operators: readonly OperatorMetadata[]
) => {
  if (!operatorName) return undefined

  const standardisedOpName = standardiseOperatorName(operatorName)

  const operator = operators.find(
    (op) => op.name === standardisedOpName || op.aliases.includes(standardisedOpName)
  )
  if (!operator) return undefined
  return operator
}

export const getCurrentFragment = (node: FragmentNode, fragments: readonly FragmentMetadata[]) => {
  const fragmentName = node?.fragment
  const fragment = fragments.find((frag) => frag.name === fragmentName)

  return fragment ?? fragments[0]
}

export const commonProperties = [
  {
    name: 'fallback',
    description: 'Value to return if the evaluation throws an error',
    aliases: [],
    required: false,
    type: 'any',
    default: null,
  },
  {
    name: 'outputType',
    description: 'Convert the evaluation result to this type',
    aliases: ['type'],
    required: false,
    type: 'string',
    default: 'string',
  },
]

export const reservedProperties = [
  'operator',
  'fragment',
  'children',
  'fallback',
  'outputType',
  'type',
  'useCache',
]

export const isArbitraryPropertyMarker = (propertyName: string) =>
  /^\[\s*\.\.\.[A-Za-z]+\s*\]$/gm.test(propertyName)

export const operatorAcceptsArbitraryProperties = (opData: OperatorMetadata) => {
  const { parameters } = opData
  if (!parameters) return false
  return parameters.some((param) => isArbitraryPropertyMarker(param.name))
}

export const getAliases = (expression: EvaluatorNode, allNonAliases: Set<string>) => {
  if (!isObject(expression)) return {}
  return Object.fromEntries(
    Object.entries(expression).filter(
      ([key, _]) => isAliasString(key) && !allNonAliases.has(key.replace('$', ''))
    )
  )
}

export const getButtonFontSize = (operatorAlias: string) => {
  const charCount = operatorAlias.length

  if (charCount === 1) return '2em'
  if (charCount < 3) return '1.6em'
  if (charCount < 7) return '1.2em'
  if (charCount < 15) return '1em'
  return '0.9em'
}

export const propertyCountReplace = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  const { value } = nodeData
  if (!(value instanceof Object)) return null
  if ('operator' in value) return `Operator: ${String(value.operator)}`
  if ('fragment' in value) return `Fragment: ${String(value.fragment)}`
  if (isShorthandNodeWithSimpleValue(nodeData, allOperatorAliases, allFragments, allFunctions)) {
    const shorthandOperator = Object.keys(value)[0]
    return `Shorthand: ${shorthandOperator}`
  }
  return null
}

// See Shorthand.tsx for the difference between ShorthandNodeCollection &
// ShorthandNodeWithSimpleValue

export const isShorthandNodeCollection = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  const { parentData, key } = nodeData

  if (!isObject(parentData)) return false

  const alias = (key as string).slice(1)

  return allOperatorAliases.has(alias) || allFragments.has(alias) || allFunctions.has(alias)
}

export const isShorthandNodeWithSimpleValue = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  const { value } = nodeData
  if (!isObject(value)) return false
  const keys = Object.keys(value)
  if (keys.length > 1) return false

  const shorthandKey = keys[0]
  if (!isAliasString(shorthandKey)) return false

  const alias = shorthandKey.slice(1)

  return allOperatorAliases.has(alias) || allFragments.has(alias) || allFunctions.has(alias)
}

// True if the node is a shorthand operator/fragment/function node — i.e. it has
// a key like `$plus`/`$getData` whose name is a registered alias. Unlike the
// two testers above, this tolerates additional alias-definition keys (e.g. a
// `$character` alias sitting alongside the operator key), so a shorthand node
// that also defines aliases is still recognised as a FigTree node.
export const isShorthandNode = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  const { value } = nodeData
  if (!isObject(value)) return false

  return Object.keys(value).some((key) => {
    if (!isAliasString(key)) return false
    const alias = key.slice(1)
    return allOperatorAliases.has(alias) || allFragments.has(alias) || allFunctions.has(alias)
  })
}

export const isAliasNode = (
  { key, parentData }: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  const keyString = key as string
  return (
    isAliasString(keyString) &&
    parentData &&
    !('fragment' in parentData) &&
    !allOperatorAliases.has(keyString) &&
    !allFragments.has(keyString) &&
    !allFunctions.has(keyString.slice(1))
  )
}

export const isFirstAliasNode = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  if (!isAliasNode(nodeData, allOperatorAliases, allFragments, allFunctions)) return false

  const { parentData, index } = nodeData

  const nonAliasProperties = isObject(parentData)
    ? Object.keys(parentData).filter(
        (k) =>
          !isAliasString(k) ||
          [...allOperatorAliases, ...allFragments, ...allFunctions].includes(k.replace('$', ''))
      )
    : []
  return index === nonAliasProperties.length
}

/**
 * Drives json-edit-react's type selector (`allowTypeSelection`) per node:
 *  - Operator/Fragment parameters get the parameter's declared type(s) plus
 *    `Operator`/`Fragment`. An `any`-typed parameter (e.g. the conditional
 *    operator's `condition`/`valueIfTrue`/`valueIfFalse`) is unrestricted, so
 *    it gets the full list.
 *  - `fallback` is unrestricted (any standard type plus `Operator`/`Fragment`);
 *    `outputType`/`useCache` get their enums.
 *  - A key on an operator/fragment node that isn't a declared parameter — an
 *    alias definition (`$one`) or an arbitrary property — has no known expected
 *    type, so it also gets the full list.
 *  - Any other value node — a primitive root, or a plain value not belonging to
 *    an operator/fragment — returns `true`, so the selector lists all standard
 *    types plus `Operator`/`Fragment`. This lets any plain value be turned into
 *    a FigTree node.
 *
 * Note: collection (object/array) nodes have no type selector in
 * json-edit-react, so a plain object/array can't be converted via this list.
 */
export const getTypeFilter = (
  { key, parentData }: NodeData,
  {
    operators,
    fragments,
  }: {
    operators: readonly OperatorMetadata[]
    fragments: readonly FragmentMetadata[]
  }
) => {
  let operatorData: OperatorMetadata | undefined
  let fragmentData: FragmentMetadata | undefined

  switch (true) {
    case key === 'fallback': {
      // A fallback can be any type — including a nested operator/fragment — so
      // it gets the full list. (It's not a declared operator parameter, so
      // without this it would match the `'operator' in parentData` branch
      // below, find nothing, and yield no selector.)
      return true
    }
    case key === 'outputType': {
      return [
        { enum: 'outputType', values: ['string', 'number', 'boolean', 'array'], matchPriority: 1 },
        'Operator',
        'Fragment',
      ]
    }
    case key === 'useCache': {
      return ['boolean', 'Operator', 'Fragment']
    }
    case 'operator' in (parentData ?? {}) && key !== 'operator': {
      operatorData = getCurrentOperator((parentData as OperatorNode)?.operator, operators)
      break
    }
    case 'fragment' in (parentData ?? {}) && key !== 'fragment': {
      fragmentData = getCurrentFragment(parentData as FragmentNode, fragments)
      break
    }
  }

  if (operatorData) {
    const parameter = operatorData.parameters.find(
      (p) => p.name === key || p.aliases.includes(String(key))
    )
    return getDataTypeList(parameter)
  }

  if (fragmentData?.parameters) {
    const parameter = fragmentData.parameters.find((p) => p.name === key)
    return getDataTypeList(parameter)
  }

  // Any other value node (a primitive root, or a plain value not belonging to
  // an operator/fragment): allow all standard types plus Operator/Fragment, so
  // it can be converted into a FigTree node.
  return true
}

const getDataTypeList = (
  parameter?: OperatorParameterMetadata | FragmentParameterMetadata
): boolean | Array<string | EnumDefinition> => {
  // No declared parameter for this key — e.g. an alias definition (`$one`) or
  // an arbitrary property on an operator that allows them. We don't know an
  // expected type, so default to the full list (all standard types plus
  // `Operator`/`Fragment`) rather than suppressing the selector.
  if (!parameter) return true
  const { name, type } = parameter
  // An `any`-typed parameter (whether the bare type or one option of a type
  // union) accepts any value, so offer the full type list — all standard types
  // plus `Operator`/`Fragment` — rather than no selector at all.
  if (type === 'any' || (Array.isArray(type) && type.includes('any'))) return true
  if (Array.isArray(type)) return [...type, 'Operator', 'Fragment'] as DataType[]
  if (isObject(type) && 'literal' in type)
    return [
      { enum: name, values: type.literal as string[], matchPriority: 1 },
      'Operator',
      'Fragment',
    ]
  return [type, 'Operator', 'Fragment'] as DataType[]
}
