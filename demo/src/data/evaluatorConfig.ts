export const evaluatorConfig = {
  fragments: {
    getCapital: {
      operator: 'POST',
      url: 'https://countriesnow.space/api/v0.1/countries/capital',
      returnProperty: 'data.capital',
      parameters: {
        country: '$country',
      },
      metadata: {
        description: "Gets a country's capital city",
        parameters: [{ name: '$country', type: 'string', required: true }],
      },
    },
    getFlag: {
      operator: 'POST',
      url: 'https://countriesnow.space/api/v0.1/countries/flag/unicode',
      returnProperty: 'data.unicodeFlag',
      parameters: {
        country: '$country',
      },
      default: 'New Zealand',
      metadata: {
        description: "Gets a country's flag",
        parameters: [{ name: '$country', type: 'string', required: true, default: 'New Zealand' }],
        textColor: 'white',
        backgroundColor: 'black',
      },
    },
  },
  customFunctions: {
    reverse: {
      function: (input: unknown[] | string) => {
        if (Array.isArray(input)) return [...input].reverse()
        return input.split('').reverse().join('')
      },
      description: 'Reverse a string, or array',
      argsDefault: ['Reverse Me'],
      backgroundColor: 'orange',
      textColor: 'blue',
    },
    changeCase: {
      function: ({ string, toCase }: { string: string; toCase: 'lower' | 'upper' }) =>
        toCase === 'upper' ? string.toUpperCase() : string.toLowerCase(),
      description: 'Convert a string to either upper or lower case',
      inputDefault: { string: 'New string', toCase: 'upper' },
    },
    currentDate: {
      function: () => new Date().toLocaleDateString(),
      description: "Returns today's date in local format",
    },
  },
}
