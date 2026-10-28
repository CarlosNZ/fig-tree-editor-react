import { type FragmentDefinition } from 'fig-tree-evaluator'

export const initialFragmentName = 'greeting'

// The fragment the main editor starts with in fragment mode: a body reading
// two parameters, one of them optional
export const initialFragmentDefinition: FragmentDefinition = {
  expression: {
    $plus: [
      { $if: { condition: '$params.formal', then: 'Good day, ', else: 'Hi, ' } },
      '$params.name',
      '!',
    ],
  },
  parameters: {
    name: { type: 'string' },
    formal: { type: 'boolean', default: false },
  },
  listing: {
    displayName: 'Greeting',
    description: 'Greets someone by name, formally or not',
    parameterDescriptions: { name: 'Who to greet', formal: 'Whether the greeting is formal' },
    colors: { background: '#e8e0f8', text: '#4b2a8a' },
    samples: { name: 'Ada' },
  },
}
