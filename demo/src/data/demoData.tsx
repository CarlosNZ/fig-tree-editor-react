import { JsonEditorProps } from 'json-edit-react'
import { DemoOptions } from '../figTree'
import { and, byKey, byLevel, byType, inArray, not, root } from '@json-edit-react/utils/filters'

export interface DemoData {
  name: string
  content: string // Markdown
  objectData?: Record<string, unknown>
  objectJsonEditorProps?: Omit<JsonEditorProps, 'data' | 'setData'>
  expression: unknown
  expressionCollapse?: number
  figTreeOptions?: DemoOptions
}

export const demoData: DemoData[] = [
  {
    name: '⚙️ Basic data fetching',
    content: `
# The Basics

\`\`\`
{
  "operator": "plus",
  "values": ["$data.user.firstName", " ", "$data.user.lastName"]
}
\`\`\`

A basic expression that just joins a couple of values pulled from some form data. A string such as \`"$data.user.firstName"\` is a *reference*: it reads that path from the data object.

Experiment with changing the values of the data object as well as the paths being referenced. (See what happens if you reference a path that doesn't exist: it reads as \`null\`, so the whole result is \`null\`. Then try wrapping the reference in a \`firstOf\` to give it a default.)

Click the **plus** button to see the result.

Try out some of the other [operators](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#operator-reference), and build your own expressions from scratch.
`,
    objectData: {
      user: {
        id: 2,
        firstName: 'Steve',
        lastName: 'Rogers',
        title: 'The First Avenger',
      },
      organisation: {
        id: 1,
        name: 'The Avengers',
        category: 'Superheroes',
      },
      application: {
        questions: {
          q1: 'When were you born?',
          q2: 'What is your primary weapon',
        },
        responses: {
          q1: '1918',
          q2: 'Vibranium shield',
        },
      },
    },
    expression: {
      operator: 'plus',
      values: ['$data.user.firstName', ' ', '$data.user.lastName'],
    },
    expressionCollapse: 3,
  },
  {
    name: '❓ Conditional logic',
    content: `
# Conditional logic

<img src="https://carlosnz.github.io/fig-tree-evaluator/img/movie-ticket_300.png" width="150"/>

The result of this expression determines whether the filmgoer is allowed entry to the film, based on their age and whether or not they have a parent in attendance.

The rule is: the filmgoer must meet the minimum age restriction, unless they have a parent with them, in which case they must be over 13 years old.

Note that the data is read with *references*, such as \`"$data.patron.age"\`. A reference is just a convenience to make complex expressions less verbose. So instead of:

\`\`\`
{
  "operator": "get",
  "path": "patron.age"
}
\`\`\`

we can just write:

\`\`\`
"$data.patron.age"
\`\`\`

Note that you can toggle any node to and from Shorthand form with the hover button on the right of each node header:

<img src="https://carlosnz.github.io/fig-tree-evaluator/img/shorthand-toggle.png" width="593"/>


`,
    objectJsonEditorProps: {
      allowEdit: byLevel(2),
      allowDelete: false,
      allowAdd: false,
    },
    objectData: {
      film: { title: 'Deadpool & Wolverine', minAgeRating: 17 },
      patron: { age: 12, isParentAttending: true },
    },
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
    expressionCollapse: 4,
  },
  {
    name: '🎲 String formatting with a random user',
    content: `
# Fetch and display a random user

This expression fetches a random user object by making an HTTP request to [https://randomuser.me/api/](https://randomuser.me/api/), and keeps it in a var. We then use this data to populate a templated string.

FigTree [caches](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#caching-memoization) every request, so the request has \`noCache: true\`, otherwise we'd get the same user every time it's run.

Try removing \`noCache\` to see the difference.
    `,
    expression: {
      operator: 'buildString',
      template:
        'Hello, {{$vars.user.name.first}} {{$vars.user.name.last}} from {{$vars.user.location.city}}, {{$vars.user.location.country}}!',
      vars: {
        user: {
          operator: 'http',
          url: 'https://randomuser.me/api/',
          returnPath: 'results[0]',
          noCache: true,
        },
      },
    },
    objectJsonEditorProps: { collapse: 1 },
  },
  {
    name: '🧵 Complex string substitution',
    content: `
# Complex string substitution
This expression features a much more complex templated string, intended to showcase the capabilities of the [String Substitution](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#string_substitution) operator.

The values substituted into the output string are based on several different factors:

- Data references written straight into the template (e.g. \`{{$data.user.name.first}}\`)
- An HTTP request to look up the country's capital city
- Counting the number of friends, and choosing different text depending on the count
- Different wording in several places depending on the gender of the \`user\`, utilising the [Match](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#match) operator

Try changing all these values and see the output differences.
    `,
    objectData: {
      user: {
        name: {
          first: 'Natasha',
          last: 'Romanoff',
        },
        country: 'Russia',
        friends: ['Steve', 'Bruce', 'Tony'],
        gender: 'Female',
      },
    },
    objectJsonEditorProps: {
      allowEdit: byType('string', 'array', 'null'),
      allowDelete: inArray,
      allowAdd: byKey('friends'),
      allowTypeSelection: ({ key, value }) => {
        if (key === 'gender')
          return [
            {
              enum: 'gender',
              values: ['Male', 'Female', 'Other'],
              matchPriority: 1,
            },
          ]
        if (typeof value === 'string' || value === null) return ['string', 'null']
        return false
      },
      defaultValue: 'Clint',
      collapse: 3,
    },
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
    content: `
# List of cities based on country selection

A classic case for a form input is to choose your country from a drop-down, then subsequently select from a list of cities based on your selected country. With a FigTree expression, we can populate this list dynamically with a call to an [online countries database](https://countriesnow.space/).

This expression returns the city list based on the \`country\` value in \`userResponses\`. You can see this applied to a real form with [this example](https://carlosnz.github.io/jsonforms-with-figtree-demo/) which uses FigTree to extend the dynamic functionality of [JSON Forms](https://jsonforms.io/).

<img src="https://carlosnz.github.io/fig-tree-evaluator/img/country_city_form.png" width="500"/>

Note the \`fallback\` property used here — an array with a *"Loading..."* indicator. This ensures that the Cities dropdown can render with a valid \`options\` list even if the online lookup returns an error due to an invalid or incomplete "country" value.
`,
    objectJsonEditorProps: {
      allowAdd: false,
      allowDelete: false,
      allowEdit: byKey('name', 'country'),
      allowTypeSelection: false,
    },
    objectData: {
      userResponses: { name: 'Mohini', country: 'India' },
    },
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
    content: `
# Decision Tree (for card games)

<img src="https://carlosnz.github.io/fig-tree-evaluator/img/cards_500.png" width="250"/>

This expression demonstrates a fairly convoluted [Decision tree](https://en.wikipedia.org/wiki/Decision_tree), making heavy use of the [Match](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#match) operator to handle conditional logic with multiple branches.

A diagram of this particular tree can be found [here](https://user-images.githubusercontent.com/5456533/208660132-39f42ecf-894f-4e7a-891d-ce3a2d184d02.png).

*Hot tip: Click the "Expand" icon at the top of the expression object while holding "Option"/"Alt" to quickly expand the entire expression tree at once.*

This expression also declares \`vars\`, values defined once and read with references such as \`"$vars.difficultyOlder"\`, which reduces the amount of duplication required in this structure.
    `,
    objectData: {
      Info: 'Change the following values to get a card game recommendation!',
      numberOfPlayers: 1,
      ageOfYoungestPlayer: 12,
      preferredDifficulty: 'easy',
    },
    objectJsonEditorProps: {
      allowEdit: and(not(byKey('Info')), not(root)),
      allowAdd: false,
      allowDelete: false,
      allowTypeSelection: [
        {
          enum: 'difficulty',
          values: ['easy', 'challenging'],
          matchPriority: 1,
        },
      ],
      onUpdate: (props) => {
        const { path, event } = props
        if (
          path[0] === 'preferredDifficulty' &&
          (event === 'edit' || event === 'add') &&
          !['easy', 'challenging'].includes(props.newValue as string)
        )
          return { error: 'Invalid value' }
        return true
      },
    },
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
    content: `
# Vars
If you have the same data referenced more than once in your expression, it can be a good idea to declare it in a \`vars\` block so it's only evaluated once, particularly if it's a network request.

In this case, the \`character\` var pulls a chunk of data from [https://swapi.py4e.com/](https://swapi.py4e.com/) and then values from it are substituted into the final expression, or used as inputs to further lookups.

Change the \`selected\` character name to look up a different Star Wars character.

<div style="display:flex;justify-content:center">
<img src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzVvd2lsNjFqZHJ0NXZrMmE0MmMxbm5tcmcxOWF2NTIwdno5a3QwNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3ofSB4uhagGiWdSVbi/giphy.webp"/>
</div>
    `,
    objectJsonEditorProps: {
      allowDelete: false,
      allowAdd: false,
      allowEdit: byKey('selected'),
      allowTypeSelection: false,
      onUpdate: (props) => {
        if (props.event !== 'edit' && props.event !== 'add') return
        const { newData, newValue } = props
        if (
          !Object.keys((newData as Record<string, unknown>)?.characters ?? {}).includes(
            newValue as string
          )
        )
          return { error: 'Invalid input' }
      },
    },
    objectData: {
      title: 'Star Wars',
      selected: 'Luke',
      characters: {
        Luke: 1,
        'C-3PO': 2,
        'R2-D2': 3,
        Vader: 4,
        Leia: 5,
        Owen: 6,
        Beru: 7,
        'R5-D4': 8,
        Biggs: 9,
        'Obi-Wan': 10,
        Anakin: 11,
        Tarkin: 12,
        Chewbacca: 13,
        Han: 14,
        Greedo: 15,
        Jabba: 16,
        Wedge: 18,
        Porkins: 19,
        Yoda: 20,
        Palpatine: 21,
        'Boba Fett': 22,
        'IG-88': 23,
        Bossk: 24,
        'Lando Calrissian': 25,
        Lobot: 26,
        Ackbar: 27,
        'Mon Mothma': 28,
        'Arvel Crynyd': 29,
        Wicket: 30,
        'Nien Nunb': 31,
        'Qui-Gon Jinn': 32,
        'Nute Gunray': 33,
        'Chancellor Valorum': 34,
        Padmé: 35,
        'Jar Jar': 36,
        'Roos Tarpals': 37,
        'Rugor Nass': 38,
        'Ric Olié': 39,
        Watto: 40,
        Sebulba: 41,
        'Captain Panaka': 42,
        'Shmi Skywalker': 43,
        'Darth Maul': 44,
        'Bib Fortuna': 45,
        'Ayla Secura': 46,
        'Ratts Tyerel': 47,
        'Dud Bolt': 48,
        Gasgano: 49,
        'Ben Quadinaros': 50,
        'Mace Windu': 51,
        'Ki-Adi-Mundi': 52,
        'Kit Fisto': 53,
        'Eeth Koth': 54,
        'Adi Gallia': 55,
        'Saesee Tiin': 56,
        'Yarael Poof': 57,
        'Plo Koon': 58,
        'Mas Amedda': 59,
        'Gregar Typho': 60,
        Cordé: 61,
        'Cliegg Lars': 62,
        'Poggle the Lesser': 63,
        'Luminara Unduli': 64,
        'Barriss Offee': 65,
        Dormé: 66,
        'Count Dooku': 67,
        'Bail Organa': 68,
        'Jango Fett': 69,
        'Zam Wesell': 70,
        'Dexter Jettster': 71,
        'Lama Su': 72,
        'Taun We': 73,
        'Jocasta Nu': 74,
        'R4-P17': 75,
        'Wat Tambor': 76,
        'San Hill': 77,
        'Shaak Ti': 78,
        'General Grievous': 79,
        Tarfful: 80,
        'Raymus Antilles': 81,
        'Sly Moore': 82,
        'Tion Medon': 83,
      },
    },
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
    content: `
# Fragments

If you expect your configurations to re-use a lot of common expressions (for example, looking up your app's database), you pre-define some [Fragments](https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#fragments), making subsequent expressions simpler.

In this case, two Fragments are defined, and can be explored in the "Configuration" panel:

- \`getCapital\`
- \`getFlag\`

They both take a \`country\` parameter, which the fragment reads as \`"$params.country"\`. \`getFlag\` gives it a default, so it's optional there.
    `,
    objectData: {
      myFavouriteCountry: 'New Zealand',
    },
    objectJsonEditorProps: {
      allowEdit: byKey('myFavouriteCountry'),
      allowAdd: false,
      allowDelete: false,
      allowTypeSelection: false,
    },
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
    expressionCollapse: 3,
  },
  {
    name: '➡ Custom Operators',
    content: `
# Custom Operators

Extend the capabilities of FigTree by defining your own operators with \`defineOperator()\`, and registering them with the \`operators\` option. A custom operator is used in exactly the same way as a built-in one.

There are three registered with this FigTree instance:
- **changeCase**:

  \`\`\`
  defineOperator({
    name: 'changeCase',
    parameters: {
      string: { type: 'string' },
      toCase: { type: { literal: ['upper', 'lower'] } },
    },
    evaluate: ({ string, toCase }) =>
      toCase === 'upper' ? string.toUpperCase() : string.toLowerCase(),
    ...
  })
  \`\`\`
- **reverse** (reverse a string or array):

  \`\`\`
  defineOperator({
    name: 'reverse',
    parameters: { value: { type: ['string', 'array'] } },
    positionalParams: ['value'],
    evaluate: ({ value }) =>
      Array.isArray(value)
        ? [...value].reverse()
        : value.split('').reverse().join(''),
    ...
  })
  \`\`\`
- **currentDate** (print current date in local format):

  \`\`\`
  defineOperator({
    name: 'currentDate',
    parameters: {},
    evaluate: () => new Date().toLocaleDateString(),
    ...
  })
  \`\`\`
    `,
    objectData: {
      backwardsInput: " :si etad s'yadoT",
      toCase: 'upper',
    },
    objectJsonEditorProps: {
      allowDelete: false,
      allowAdd: false,
      allowEdit: byType('string'),
      allowTypeSelection: false,
    },
    expression: {
      operator: 'changeCase',
      string: {
        operator: 'plus',
        values: [{ $reverse: ['$data.backwardsInput'] }, { operator: 'currentDate' }],
      },
      toCase: '$data.toCase',
    },
    expressionCollapse: 4,
  },
]
