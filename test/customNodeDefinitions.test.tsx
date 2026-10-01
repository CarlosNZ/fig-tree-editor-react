import { render, screen } from '@testing-library/react'
import type * as JsonEditReact from 'json-edit-react'
import { type JsonEditorProps } from 'json-edit-react'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'
import { classify } from '../src/classify'
import { demoExpressions, figTree, registry } from './fixtures'
import { keyLabel } from './queries'

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

// Every reference in the tree, by its text
const references = (container: HTMLElement) =>
  [...container.querySelectorAll('.ft-reference .jer-value-string')].map(
    (element) => element.textContent
  )

describe('the custom node definitions', () => {
  it('give a full operator node its component, and drop its operator row', () => {
    const { container } = render(editor({ operator: 'plus', values: [1, '$data.x'] }))
    expect(container.querySelector('.ft-node .ft-display-bar')).toBeInTheDocument()
    expect(references(container)).toEqual(['$data.x'])
    expect(screen.queryByText('operator')).not.toBeInTheDocument()
  })

  it('give a shorthand node its component, and flatten a named payload', () => {
    const { container } = render(editor({ $if: { condition: '$data.ok', then: 'Yes' } }))
    expect(container.querySelector('.ft-node .ft-display-bar')).toBeInTheDocument()
    expect(references(container)).toEqual(['$data.ok'])
    expect(() => keyLabel('$if')).toThrow()
    expect(keyLabel('condition')).toBeInTheDocument()
  })

  it('leave an argument list to json-edit-react, without the `$name` key', () => {
    const { container } = render(editor({ $plus: [1, 2] }))
    expect(() => keyLabel('$plus')).toThrow()
    expect(container.querySelectorAll('.jer-collection-header-row')).toHaveLength(2)
  })

  it('render a single value as its own kind, without the `$name` key', () => {
    const reference = render(editor({ $not: '$data.x' }))
    expect(references(reference.container)).toEqual(['$data.x'])
    expect(() => keyLabel('$not')).toThrow()
    reference.unmount()
    const { container } = render(editor({ $not: { $greaterThan: ['$data.age', 18] } }))
    expect(references(container)).toEqual(['$data.age'])
    expect(container.querySelectorAll('.ft-display-bar')).toHaveLength(2)
  })

  it('give a full fragment call its component, and flatten its static arguments', () => {
    const { container } = render(editor({ fragment: 'greet', parameters: { name: 'Ada' } }))
    expect(container.querySelector('.ft-node .ft-display-bar')).toBeInTheDocument()
    expect(keyLabel('name')).toBeInTheDocument()
    expect(screen.queryByText('fragment')).not.toBeInTheDocument()
    expect(screen.queryByText('parameters')).not.toBeInTheDocument()
  })

  it("keep a dynamic call's `parameters` row, with its key", () => {
    const { container } = render(editor({ fragment: 'greet', parameters: '$data.form' }))
    expect(references(container)).toEqual(['$data.form'])
    expect(keyLabel('parameters')).toBeInTheDocument()
  })

  it('give a literal the operator and shorthand components, and quote its content', () => {
    for (const expression of [
      { operator: 'literal', value: { $plus: ['$data.x'] } },
      { $literal: { $plus: ['$data.x'] } },
    ]) {
      const { container, unmount } = render(editor(expression))
      expect(container.querySelectorAll('.ft-node .ft-display-bar')).toHaveLength(1)
      expect(references(container)).toEqual([])
      unmount()
    }
  })

  it('give the root container its Evaluate bar, and no other container', () => {
    const { container } = render(editor({ title: '$data.t', inner: { x: '$data.x' } }))
    expect(container.querySelectorAll('.ft-root-bar')).toHaveLength(1)
  })

  it("give a comment's text its component, and a comment of lines none", () => {
    const notes = (container: HTMLElement) =>
      [...container.querySelectorAll('.ft-comment')].map((element) => element.textContent)
    const { container, unmount } = render(editor({ '//': 'A note', title: '$data.t' }))
    expect(notes(container)).toEqual(['A note'])
    expect(container.querySelector('.ft-root-bar')).toBeInTheDocument()
    unmount()
    const lines = render(editor({ '//': ['One', '$data.x'], $plus: [1] })).container
    expect(notes(lines)).toEqual(['One', '$data.x'])
    // A line is quoted, so a reference-shaped one is a note like any other
    expect(references(lines)).toEqual([])
  })

  it('read the names an `as` gives as references', () => {
    const { container } = render(
      editor({ $map: { input: '$data.list', as: 'item', each: '$item.price' } })
    )
    expect(references(container)).toEqual(['$data.list', '$item.price'])
  })

  it.each(demoExpressions)('show every reference in $name as one', ({ expression }) => {
    const classified = [...classify(expression, registry).values()].filter(
      ({ kind }) => kind?.kind === 'reference'
    )
    expect(references(render(editor(expression)).container)).toHaveLength(classified.length)
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
