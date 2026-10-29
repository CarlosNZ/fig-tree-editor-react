import { JsonEditorProps } from 'json-edit-react'
import { and, byKey, byLevel, byType, inArray, not, root } from '@json-edit-react/utils/filters'

// The data editor's settings for each example, by example id: json-edit-react
// props, some of them functions, so they stay out of the shared data, which
// the docs site's Playground edits as JSON5 text
export const dataEditorProps: Record<string, Omit<JsonEditorProps, 'data' | 'setData'>> = {
  'conditional-logic': {
    allowEdit: byLevel(2),
    allowDelete: false,
    allowAdd: false,
  },
  'random-user': { collapse: 1 },
  'string-substitution': {
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
  'city-list': {
    allowAdd: false,
    allowDelete: false,
    allowEdit: byKey('name', 'country'),
    allowTypeSelection: false,
  },
  'decision-tree': {
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
  'star-wars': {
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
  fragments: {
    allowEdit: byKey('myFavouriteCountry'),
    allowAdd: false,
    allowDelete: false,
    allowTypeSelection: false,
  },
  'custom-operators': {
    allowDelete: false,
    allowAdd: false,
    allowEdit: byType('string'),
    allowTypeSelection: false,
  },
}
