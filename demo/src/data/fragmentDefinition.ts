import { type FragmentDefinition } from 'fig-tree-evaluator'

export const initialFragmentName = 'greeting'

// The fragment the main editor starts with in fragment mode: a body reading
// two parameters, one of them optional
export const initialFragmentDefinition: FragmentDefinition = {
  expression: {
    operator: 'plus',
    values: [
      { operator: 'if', condition: '$params.formal', then: 'Good day, ', else: 'Hi, ' },
      '$params.name',
      '!',
    ],
  },
  parameters: {
    name: { type: 'string', description: 'Who to greet' },
    formal: { type: 'boolean', default: false, description: 'Whether the greeting is formal' },
  },
  description: 'Greets someone by name, formally or not',
  metadata: { displayName: 'Greeting', backgroundColor: '#e8e0f8', textColor: '#4b2a8a' },
}
