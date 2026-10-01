import { render, within } from '@testing-library/react'
import { type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTree, coreOperators } from 'fig-tree-evaluator'
import { FigTreeEditor } from '../src'
import { keyLabel } from './queries'

const figTree = new FigTree({ operators: [coreOperators] })

const editor = (expression: unknown, props: Partial<ComponentProps<typeof FigTreeEditor>> = {}) =>
  render(
    <FigTreeEditor
      figTree={figTree}
      expression={expression}
      setExpression={vi.fn()}
      collapse={false}
      {...props}
    />
  )

// The messages in each row's card, in the tree, in order
const cards = (container: HTMLElement) =>
  [...container.querySelectorAll('.ft-issue-card')].map((card) =>
    [...card.querySelectorAll('.ft-flag-issue')].map((line) => line.lastChild!.textContent)
  )

// The value row a key labels
const valueRow = (key: string) => keyLabel(key).closest<HTMLElement>('.jer-value-main-row')!

describe("a row's issues", () => {
  it('float in a card beneath its value', () => {
    editor({ operator: 'if', condition: true, thn: 'Adult', else: 'Child' })
    const value = valueRow('thn').querySelector('.ft-flagged')!
    expect(within(value as HTMLElement).getByText('"Adult"')).toBeInTheDocument()
    expect(value.querySelector('.ft-issue-card')).toHaveTextContent(
      "'thn' is not a parameter of 'if' — did you mean 'then'?"
    )
    // Nothing on the row itself, so it lays out as it would without them
    expect(valueRow('thn').querySelector('.ft-flag')).toBeNull()
    expect(valueRow('else').querySelector('.ft-issue-card')).toBeNull()
  })

  it("float at the top of a plain collection's rows", () => {
    const { container } = editor({ operator: 'round', value: [1, 2] })
    const line = container.querySelector('.ft-flag-line')!
    expect(line.querySelector('.ft-issue-card')).toHaveTextContent(
      "'round.value': expected number | null, received array"
    )
    // Before the collection's first row
    const firstRow = container.querySelector('.ft-flag-line + .jer-collection-element')
    expect(firstRow).toHaveTextContent('1')
  })

  it("float on an argument list's own issue", () => {
    const { container } = editor({ $plus: [1, true] })
    expect(container.querySelector('.ft-flag-line .ft-issue-card')).toHaveTextContent(
      "'plus.values': expected homogeneous array"
    )
  })

  it("float beneath a value on a shorthand's line", () => {
    const { container } = editor({ $upper: 5 })
    const onLine = container.querySelector('.ft-display-bar-value')!
    expect(onLine.querySelector('.ft-issue-card')).toHaveTextContent(
      "'upper.value': expected string | null, received number"
    )
  })

  it('are listed, each with its severity', () => {
    const { container } = editor({
      words: [{ $buildString: ['Hi %1 %3', 'Ada', 'Lovelace'] }],
      total: { operator: 'round', value: [1] },
    })
    expect(cards(container)).toEqual([
      [
        "'%3' binds to nothing and renders as its own text",
        'substitution 2 is never named by the template',
      ],
      ["'round.value': expected number | null, received array"],
    ])
    const [warningCard, errorCard] = container.querySelectorAll('.ft-issue-card')
    const warning = warningCard.querySelector<HTMLElement>('.ft-flag-severity')!
    const error = errorCard.querySelector<HTMLElement>('.ft-flag-severity')!
    expect(warning).toHaveTextContent('warning')
    expect(warning.style.backgroundColor).toBe('white')
    expect(error).toHaveTextContent('error')
    expect(error.style.color).toBe('white')
  })

  it('leave a hint off the row', () => {
    const { container } = editor({ $buildString: ['Hi %1 %3', 'Ada', 'Lovelace'] })
    expect(container.querySelector('.ft-editor')).not.toHaveTextContent('renumber')
  })

  it("are a broken node's stray key's own, beside the node's message", () => {
    const { container } = editor({ $plus: [1], extra: 2 })
    const header = container.querySelector('.ft-display-bar')!
    expect(header.querySelector('.ft-broken-message')).toHaveTextContent(
      "'extra' may not sit beside the shorthand key '$plus'"
    )
    expect(header.querySelector('.ft-flag')).toBeNull()
    expect(valueRow('extra').querySelector('.ft-issue-card')).toHaveTextContent(
      "'extra' may not sit beside the shorthand key '$plus'"
    )
  })

  it('leave a row without any drawn as json-edit-react draws it', () => {
    const { container } = editor({ operator: 'round', value: 3.14, decimals: 1 })
    expect(
      container.querySelector('.ft-flagged, .ft-flag-line, .ft-issue-card, .ft-flag')
    ).toBeNull()
  })

  it('show while the row is hovered, unless something inside shows its own card', () => {
    editor({ operator: 'round', value: 3.14 })
    // Compared without whitespace, which the stylesheet may lose to minifying
    const compact = (css: string) => css.replace(/\s+/g, '')
    const stylesheet = compact(
      [...document.querySelectorAll('style')].map(({ textContent }) => textContent).join('')
    )
    for (const rule of [
      // A value row's card, and a collection's, anywhere over its block
      '.jer-value-main-row:hover .ft-issue-card',
      '.jer-collection-component:hover > .jer-collection-inner > .ft-flag-line > .ft-issue-card',
      // Hidden under a card inside: a key's or a node's, a value row's, or a
      // block's
      '.jer-value-main-row:has(.ft-hover-card-anchor:hover) .ft-issue-card',
      ':has(.ft-hover-card-anchor:hover)',
      ':has(.jer-value-main-row:hover .ft-issue-card)',
      ':has(.jer-collection-component:hover > .jer-collection-inner > .ft-flag-line)',
    ])
      expect(stylesheet).toContain(compact(rule))
  })
})

describe("a node's flag", () => {
  it("shows its own issue on its header's line", () => {
    const { container } = editor({ operator: 'if', condition: true, thn: 'Adult' })
    const header = container.querySelector('.ft-display-bar')!
    expect(header.querySelector('.ft-flag')).toHaveTextContent("'if' requires 'then'")
  })

  it('shows the most severe first, counts the rest, and lists them all on hover', () => {
    const { container } = editor({ $round: { value: { operator: 'upper', valeu: 'x' } } })
    const anchor = container
      .querySelectorAll('.ft-display-bar')[1]
      .querySelector('.ft-flag-anchor')!
    expect(anchor.querySelector('.ft-flag')).toHaveTextContent(
      "'upper' returns \"string\" — it can never satisfy 'round.value'"
    )
    expect(anchor.querySelector('.ft-flag-more')).toHaveTextContent('+1')
    expect(
      [...anchor.querySelectorAll('.ft-flag-issue')].map((line) => line.lastChild!.textContent)
    ).toEqual([
      "'upper' returns \"string\" — it can never satisfy 'round.value'",
      "'upper' requires 'value'",
    ])
  })
})

describe('a collapsed summary', () => {
  const summaries = (container: HTMLElement) =>
    [...container.querySelectorAll('.jer-collection-item-count.jer-visible')].map(
      (count) => count.textContent
    )

  it('counts the issues on and beneath its row, where there is more than one', () => {
    const { container } = editor(
      {
        age: { operator: 'if', condition: true, thn: 'Adult' },
        rounded: { operator: 'round', value: [1] },
        words: [{ $upper: 5 }, { $colour: 'red' }],
      },
      { collapse: 1 }
    )
    expect(summaries(container)).toEqual([
      'Operator: if · 2 errors',
      'Operator: round',
      '2 items · 1 error · 1 warning',
    ])
  })

  it("keeps the host's own summary, then counts", () => {
    const { container } = editor(
      { words: [{ $upper: 5 }, { $upper: 6 }] },
      { collapse: 1, customText: { ITEMS_MULTIPLE: ({ size }) => `${size} words` } }
    )
    expect(summaries(container)).toEqual(['2 words · 2 errors'])
  })
})

describe('evaluation data', () => {
  it("flags a reference to a path the evaluation data doesn't have", () => {
    const expression = { name: '$data.user.nmae' }
    const { container, unmount } = editor(expression)
    expect(cards(container)).toEqual([])
    unmount()
    const withData = editor(expression, { evaluationData: { user: { name: 'Ada' } } })
    expect(cards(withData.container)).toEqual([
      ["'$data.user.nmae' is absent from the supplied sample data"],
    ])
    expect(valueRow('name').querySelector('.ft-reference .ft-issue-card')).not.toBeNull()
  })
})
