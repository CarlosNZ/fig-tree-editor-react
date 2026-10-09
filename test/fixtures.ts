import { type ComponentProps } from 'react'
import { type FigTreeEditor } from '../src/FigTreeEditor'
import {
  FigTree,
  coreOperators,
  defineOperator,
  httpOperators,
  sqlOperators,
  type FragmentDefinition,
} from 'fig-tree-evaluator'

// A registry like the demo's (demo/src/figTree.ts): the core, HTTP and SQL
// operators, the demo's own operators and its fragments, plus a `greet`
// fragment. SQL runs against no database, since nothing here evaluates.
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
  },
  greet: {
    expression: { $plus: ['Hello ', '$params.name'] },
    parameters: { name: { type: 'string' } },
  },
}

export const figTree = new FigTree({
  operators: [
    coreOperators,
    httpOperators(),
    sqlOperators({ query: () => Promise.resolve([]) }),
    customOperators,
  ],
  fragments,
})

export const registry = {
  operators: figTree.getOperators(),
  fragments: figTree.getFragments(),
}

// The demo's expressions (demo/src/data/demoData.tsx), copied as they are
export const demoExpressions: { name: string; expression: unknown }[] = [
  {
    name: '⚙️ Basic data fetching',
    expression: { operator: 'plus', values: ['$data.user.firstName', ' ', '$data.user.lastName'] },
  },
  {
    name: '❓ Conditional logic',
    expression: {
      operator: 'if',
      condition: {
        operator: 'or',
        values: [
          {
            operator: 'greaterThanOrEqual',
            values: ['$data.patron.age', '$data.film.minAgeRating'],
          },
          {
            operator: 'and',
            values: [
              { operator: 'greaterThanOrEqual', values: ['$data.patron.age', 13] },
              '$data.patron.isParentAttending',
            ],
          },
        ],
      },
      then: {
        operator: 'buildString',
        template: 'Enjoy "{{movie}}"! 🍿🎬',
        substitutions: { movie: '$data.film.title' },
      },
      else: "Sorry, try again when you're older 😔",
    },
  },
  {
    name: '🎲 String formatting with a random user',
    expression: {
      operator: 'buildString',
      template:
        'Hello, {{$vars.user.name.first}} {{$vars.user.name.last}} from {{$vars.user.location.city}}, {{$vars.user.location.country}}!',
      vars: {
        user: { operator: 'http', url: 'https://randomuser.me/api/', returnPath: 'results[0]' },
      },
    },
  },
  {
    name: '🧵 Complex string substitution',
    expression: {
      operator: 'buildString',
      template:
        "This applicant's name is {{$data.user.name.first}} {{$data.user.name.last}}. {{genderLives}} in {{$data.user.country}}, where the capital city is {{capital}}. {{genderHas}} {{friendCount}}.",
      substitutions: {
        capital: {
          operator: 'http',
          url: 'https://countriesnow.space/api/v0.1/countries/capital',
          method: 'post',
          body: { country: '$data.user.country' },
          returnPath: 'data.capital',
          fallback: 'unknown',
        },
        friendCount: {
          operator: 'match',
          value: '$vars.count',
          branches: { '0': 'no friends 😢', '1': 'only one friend' },
          default: {
            operator: 'if',
            condition: { operator: 'greaterThan', values: ['$vars.count', 4] },
            then: 'loads of friends',
            else: {
              operator: 'buildString',
              template: '{{count}} friends',
              substitutions: { count: '$vars.count' },
            },
          },
          vars: { count: { operator: 'length', value: '$data.user.friends' } },
        },
        genderLives: {
          operator: 'match',
          value: '$data.user.gender',
          branches: { Female: 'She lives', Male: 'He lives' },
          default: 'They live',
        },
        genderHas: {
          operator: 'match',
          value: '$data.user.gender',
          branches: { Female: 'She has', Male: 'He has' },
          default: 'They have',
        },
      },
    },
  },
  {
    name: '🏙️ City list from country selection',
    expression: {
      operator: 'http',
      url: 'https://countriesnow.space/api/v0.1/countries/cities',
      method: 'post',
      body: { country: '$data.userResponses.country' },
      returnPath: 'data',
      fallback: 'Country not specified',
    },
  },
  {
    name: '🌴 Decision Tree',
    expression: {
      operator: 'match',
      value: '$data.numberOfPlayers',
      branches: {
        '1': {
          operator: 'if',
          condition: { operator: 'greaterThanOrEqual', values: ['$data.ageOfYoungestPlayer', 7] },
          then: 'Solitaire',
          else: 'No recommendations 😔',
        },
      },
      default: {
        operator: 'if',
        condition: { operator: 'greaterThanOrEqual', values: ['$data.ageOfYoungestPlayer', 5] },
        then: {
          operator: 'if',
          condition: { operator: 'lessThan', values: ['$data.ageOfYoungestPlayer', 8] },
          then: 'Go Fish',
          else: {
            operator: 'if',
            condition: { operator: 'lessThan', values: ['$data.ageOfYoungestPlayer', 12] },
            then: '$vars.difficultyYounger',
            else: {
              operator: 'if',
              condition: { operator: 'lessThan', values: ['$data.ageOfYoungestPlayer', 16] },
              then: '$vars.difficultyOlder',
              else: {
                operator: 'match',
                value: '$data.numberOfPlayers',
                branches: {
                  '4': {
                    operator: 'if',
                    condition: { operator: 'equal', values: ['$data.preferredDifficulty', 'hard'] },
                    then: 'Bridge',
                    else: '$vars.difficultyOlder',
                  },
                },
                default: '$vars.difficultyOlder',
              },
            },
          },
        },
        else: 'Snap',
      },
      vars: {
        difficultyYounger: {
          operator: 'match',
          value: '$data.preferredDifficulty',
          branches: { easy: 'Go Fish', challenging: 'Rummy', hard: 'Rummy' },
        },
        difficultyOlder: {
          operator: 'match',
          value: '$data.preferredDifficulty',
          branches: { easy: 'Rummy', challenging: '500', hard: '500' },
        },
      },
    },
  },
  {
    name: '🕵️ Vars (Star Wars 🚀)',
    expression: {
      operator: 'buildString',
      template: 'Name: %1\nGender: %2\nHomeworld: %3\nFirst appearance: %4',
      substitutions: [
        '$vars.character.name',
        '$vars.character.gender',
        { operator: 'http', url: '$vars.character.homeworld', returnPath: 'name' },
        { operator: 'http', url: '$vars.character.films[0]', returnPath: 'title' },
      ],
      fallback: {
        operator: 'plus',
        values: ["Can't retrieve data for character: ", '$data.selected'],
        fallback: '‼️',
      },
      vars: {
        character: {
          operator: 'http',
          url: {
            operator: 'buildString',
            template: 'https://swapi.py4e.com/api/people/%1',
            substitutions: [{ operator: 'get', path: '$data.selected', from: '$data.characters' }],
          },
          fallback: 'Nope',
        },
      },
    },
  },
  {
    name: '🧩 Fragments',
    expression: {
      operator: 'buildString',
      template: '===={{country}}====\nCapital city: {{capital}}\nFlag: {{flag}}',
      substitutions: {
        capital: { fragment: 'getCapital', parameters: { country: '$vars.selectedCountry' } },
        flag: { fragment: 'getFlag', parameters: { country: '$vars.selectedCountry' } },
        country: '$vars.selectedCountry',
      },
      fallback: "Can't find country 😔",
      vars: {
        selectedCountry: {
          operator: 'get',
          path: 'myFavouriteCountry',
          default: 'Country not found',
        },
      },
    },
  },
  {
    name: '➡ Custom Operators',
    expression: {
      operator: 'changeCase',
      string: {
        operator: 'plus',
        values: [{ $reverse: ['$data.backwardsInput'] }, { operator: 'currentDate' }],
      },
      toCase: '$data.toCase',
    },
  },
]

// The props a test passes beside its expression, in expression mode
export type EditorProps = Partial<
  Extract<ComponentProps<typeof FigTreeEditor>, { setExpression: unknown }>
>
