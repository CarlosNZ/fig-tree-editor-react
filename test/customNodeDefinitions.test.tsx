import { render, screen } from '@testing-library/react'
import type * as JsonEditReact from 'json-edit-react'
import { type JsonEditorProps } from 'json-edit-react'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'
import { classify } from '../src/classify'
import { demoExpressions, figTree, registry } from './fixtures'

// Each render's definitions array, to check its identity
const definitionArrays = vi.hoisted(() => [] as unknown[])
vi.mock('json-edit-react', async (importOriginal) => {
  const original = await importOriginal<typeof JsonEditReact>()
  return {
    ...original,
    JsonEditor: (props: JsonEditorProps) => {
      definitionArrays.push(props.customNodeDefinitions)
      return original.JsonEditor(props)
    },
  }
})

const editor = (expression: unknown) => (
  <FigTreeEditor
    figTree={figTree}
    expression={expression}
    setExpression={vi.fn()}
    collapse={false}
  />
)

// Every placeholder in the tree, in document order: its definition and label
const placeholders = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-kind]')].map((element) => [
    element.getAttribute('data-kind'),
    element.querySelector(':scope > span')?.textContent,
  ])

const shown = (expression: unknown) => placeholders(render(editor(expression)).container)

describe('the custom node definitions', () => {
  it('mark a full operator node and drop its operator row', () => {
    expect(shown({ operator: 'plus', values: [1, '$data.x'] })).toEqual([
      ['operator', 'Operator · plus (Plus (+))'],
      ['reference', 'Reference · data'],
    ])
    expect(screen.queryByText('operator')).not.toBeInTheDocument()
  })

  it('flatten a named payload, and leave an argument list unlabelled', () => {
    expect(shown({ $if: { condition: '$data.ok', then: 'Yes' } })).toEqual([
      ['shorthand', 'Shorthand · $if (Conditional (?))'],
      ['flattened', 'Flattened payload'],
      ['reference', 'Reference · data'],
    ])
    expect(screen.queryByText('$if')).not.toBeInTheDocument()
    expect(shown({ $plus: [1, 2] })).toEqual([
      ['shorthand', 'Shorthand · $plus (Plus (+))'],
      ['unlabelled', 'Unlabelled'],
    ])
  })

  it('render a single value as its own kind, without the `$name` key', () => {
    expect(shown({ $not: '$data.x' })).toEqual([
      ['shorthand', 'Shorthand · $not (Logical NOT (!))'],
      ['reference', 'Reference · data · unlabelled'],
    ])
    expect(screen.queryByText('$not')).not.toBeInTheDocument()
    expect(shown({ $not: { $greaterThan: ['$data.age', 18] } })).toEqual([
      ['shorthand', 'Shorthand · $not (Logical NOT (!))'],
      ['shorthand', 'Shorthand · $greaterThan (Greater than (>)) · unlabelled'],
      ['unlabelled', 'Unlabelled'],
      ['reference', 'Reference · data'],
    ])
  })

  it('mark fragment calls by their arguments', () => {
    expect(shown({ fragment: 'greet', parameters: { name: 'Ada' } })).toEqual([
      ['fragment', 'Fragment · greet · static arguments'],
      ['flattened', 'Flattened payload'],
    ])
    expect(shown({ fragment: 'greet', parameters: '$data.form' })).toEqual([
      ['fragment', 'Fragment · greet · dynamic arguments'],
      ['reference', 'Reference · data'],
    ])
  })

  it('quote the content of a literal', () => {
    expect(shown({ operator: 'literal', value: { $plus: ['$data.x'] } })).toEqual([
      ['literal', 'Literal · full'],
    ])
    expect(shown({ $literal: { $plus: ['$data.x'] } })).toEqual([
      ['literal', 'Literal · shorthand'],
      ['unlabelled', 'Unlabelled'],
    ])
  })

  it('mark the root container, comments and their lines', () => {
    expect(shown({ '//': 'A note', title: '$data.t' })).toEqual([
      ['container', 'Container'],
      ['commentLine', 'Comment line'],
      ['reference', 'Reference · data'],
    ])
    expect(shown({ '//': ['One', '$data.x'], $plus: [1] })).toEqual([
      ['shorthand', 'Shorthand · $plus (Plus (+))'],
      ['comment', 'Comment'],
      ['commentLine', 'Comment line'],
      ['commentLine', 'Comment line'],
      ['unlabelled', 'Unlabelled'],
    ])
  })

  it('name the bindings an `as` gives', () => {
    expect(
      shown({ $map: { input: '$data.list', as: 'item', each: '$item.price' } }).slice(-1)
    ).toEqual([['reference', 'Reference · element as item']])
  })

  it.each(demoExpressions)('mark every reference in $name', ({ expression }) => {
    const references = [...classify(expression, registry).values()].filter(
      ({ kind }) => kind?.kind === 'reference'
    )
    const marked = shown(expression).filter(([kind]) => kind === 'reference')
    expect(marked).toHaveLength(references.length)
  })

  describe('identity', () => {
    const latest = () => definitionArrays[definitionArrays.length - 1]

    it('keeps its identity while no row changes kind', () => {
      const { rerender } = render(editor({ $plus: [1, '$data.x'] }))
      const first = latest()
      expect(first).toBeInstanceOf(Array)
      rerender(editor({ $plus: [2, '$data.x'] }))
      expect(latest()).toBe(first)
    })

    it('changes when a row does', () => {
      const { rerender } = render(editor({ $plus: [1, '$data.x'] }))
      const first = latest()
      rerender(editor({ $plus: ['$data.y', '$data.x'] }))
      expect(latest()).not.toBe(first)
    })
  })
})
