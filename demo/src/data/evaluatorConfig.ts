import {
  defineOperator,
  type FragmentDefinition,
  type OperatorListingMap,
} from 'fig-tree-evaluator'

const fragments: Record<string, FragmentDefinition> = {
  getCapital: {
    expression: {
      operator: 'http',
      url: 'https://countriesnow.space/api/v0.1/countries/capital',
      method: 'post',
      body: { country: '$params.country' },
      returnPath: 'data.capital',
    },
    parameters: { country: { type: 'string' } },
    description: "Gets a country's capital city",
    metadata: { displayName: 'Capital city' },
  },
  getFlag: {
    expression: {
      operator: 'http',
      url: 'https://countriesnow.space/api/v0.1/countries/flag/unicode',
      method: 'post',
      body: { country: '$params.country' },
      returnPath: 'data.unicodeFlag',
    },
    parameters: { country: { type: 'string', default: 'New Zealand' } },
    description: "Gets a country's flag",
    metadata: { textColor: 'white', backgroundColor: 'black' },
  },
}

const customOperators = [
  defineOperator({
    name: 'reverse',
    category: 'other',
    parameters: { value: { type: ['string', 'array'] } },
    positionalParams: ['value'],
    evaluate: ({ value }) =>
      Array.isArray(value) ? [...value].reverse() : String(value).split('').reverse().join(''),
  }),
  defineOperator({
    name: 'changeCase',
    category: 'string',
    parameters: {
      string: { type: 'string' },
      toCase: { type: { literal: ['upper', 'lower'] } },
    },
    positionalParams: ['string', 'toCase'],
    evaluate: ({ string, toCase }) =>
      toCase === 'upper' ? String(string).toUpperCase() : String(string).toLowerCase(),
  }),
  defineOperator({
    name: 'currentDate',
    category: 'other',
    parameters: {},
    evaluate: () => new Date().toLocaleDateString(),
  }),
]

// How the editor presents the custom operators: their text, which no
// operator definition carries
const operatorListings: OperatorListingMap = {
  reverse: {
    description: 'Reverses a string, or an array',
    parameterDescriptions: { value: 'The string or array' },
  },
  changeCase: {
    description: 'Converts a string to upper or lower case',
    parameterDescriptions: { string: 'The string to convert', toCase: 'The case to convert to' },
  },
  currentDate: { description: "Returns today's date in the local format" },
}

export const evaluatorConfig = { fragments, customOperators, operatorListings }
