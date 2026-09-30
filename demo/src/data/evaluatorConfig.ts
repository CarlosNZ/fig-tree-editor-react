import { defineOperator, type FragmentDefinition } from 'fig-tree-evaluator'

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
    description: 'Reverses a string, or an array',
    parameters: { value: { type: ['string', 'array'], description: 'The string or array' } },
    positionalParams: ['value'],
    evaluate: ({ value }) =>
      Array.isArray(value) ? [...value].reverse() : String(value).split('').reverse().join(''),
  }),
  defineOperator({
    name: 'changeCase',
    category: 'string',
    description: 'Converts a string to upper or lower case',
    parameters: {
      string: { type: 'string', description: 'The string to convert' },
      toCase: { type: { literal: ['upper', 'lower'] }, description: 'The case to convert to' },
    },
    positionalParams: ['string', 'toCase'],
    evaluate: ({ string, toCase }) =>
      toCase === 'upper' ? String(string).toUpperCase() : String(string).toLowerCase(),
  }),
  defineOperator({
    name: 'currentDate',
    category: 'other',
    description: "Returns today's date in the local format",
    parameters: {},
    evaluate: () => new Date().toLocaleDateString(),
  }),
]

export const evaluatorConfig = { fragments, customOperators }
