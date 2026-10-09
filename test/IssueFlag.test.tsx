import { render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FigTree, coreOperators } from 'fig-tree-evaluator'
import { FigTreeEditor } from '../src'
import { keyLabel } from './queries'
import { type EditorProps } from './fixtures'

const figTree = new FigTree({ operators: [coreOperators] })

const editor = (expression: unknown, props: EditorProps = {}) =>
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
    expect(valueRow('thn').querySelector('.ft-issue-badge')).toBeNull()
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
      words: [{ $buildString: ['Hi %1 %3 %4', 'Ada', 'Lovelace'] }],
      total: { operator: 'round', value: [1] },
    })
    expect(cards(container)).toEqual([
      [
        "'%3' binds to nothing and renders as its own text — there are only 2 substitutions, and substitution 2 is unused",
        "'%4' binds to nothing and renders as its own text — there are only 2 substitutions, and substitution 2 is unused",
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

  it("are a broken node's stray key's own, beside the node's message", () => {
    const { container } = editor({ $plus: [1], extra: 2 })
    const header = container.querySelector('.ft-display-bar')!
    expect(header.querySelector('.ft-broken-message')).toHaveTextContent(
      "'extra' may not sit beside the shorthand key '$plus'"
    )
    expect(header.querySelector('.ft-issue-badge')).toBeNull()
    expect(valueRow('extra').querySelector('.ft-issue-card')).toHaveTextContent(
      "'extra' may not sit beside the shorthand key '$plus'"
    )
  })

  it('leave a row without any drawn as json-edit-react draws it', () => {
    const { container } = editor({ operator: 'round', value: 3.14, decimals: 1 })
    expect(
      container.querySelector('.ft-flagged, .ft-flag-line, .ft-issue-card, .ft-issue-badge')
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
      // A value row's card, and a collection's, over its header line only, so
      // it never covers the rows beneath while they are hovered
      '.jer-value-main-row:hover .ft-issue-card',
      '.jer-collection-component:has(> .jer-collection-header-row:hover) > .jer-collection-inner > .ft-flag-line > .ft-issue-card',
      // Hidden under a card in the row: a key's or a node's
      '.jer-value-main-row:has(.ft-hover-card-anchor:hover) .ft-issue-card',
      '.jer-collection-component:has(> .jer-collection-header-row .ft-hover-card-anchor:hover) > .jer-collection-inner > .ft-flag-line > .ft-issue-card',
    ])
      expect(stylesheet).toContain(compact(rule))
  })
})

describe("a node's issues", () => {
  // The hover card on a node's button, around the button
  const buttonAnchor = (header: Element) =>
    header.querySelector('.ft-evaluate-button')!.closest('.ft-hover-card-anchor')!
  const listed = (anchor: Element) =>
    [...anchor.querySelectorAll('.ft-flag-issue')].map((line) => line.lastChild!.textContent)

  it("are listed in its button's card, shown sooner, with a badge on the button", () => {
    const { container } = editor({ $round: { value: { operator: 'upper', value: 'x' } } })
    const anchor = buttonAnchor(container.querySelectorAll('.ft-display-bar')[1])
    expect(listed(anchor)).toEqual([
      "'upper' returns \"string\" — it can never satisfy 'round.value'",
    ])
    expect(anchor).toHaveAttribute('data-urgent')
    expect(anchor.querySelector<HTMLElement>('.ft-issue-badge')!.style.backgroundColor).toBe(
      'rgb(192, 57, 43)'
    )
  })

  it('are listed most severe first, the badge in its colour', () => {
    const { container } = editor({ $round: { value: { operator: 'map', input: [1], each: 'x' } } })
    const anchor = buttonAnchor(container.querySelectorAll('.ft-display-bar')[1])
    expect(listed(anchor)).toEqual([
      "'map' returns \"array\" — it can never satisfy 'round.value'",
      "'map' binds $element / $index but its 'each' references neither",
    ])
    expect(anchor.querySelector<HTMLElement>('.ft-issue-badge')!.style.backgroundColor).toBe(
      'rgb(192, 57, 43)'
    )
  })

  it('leave out a missing parameter held back for a misspelt key, which shows the mistake', () => {
    const { container } = editor({ operator: 'if', condition: true, thn: 'Adult' })
    const anchor = buttonAnchor(container.querySelector('.ft-display-bar')!)
    const typo = "'thn' is not a parameter of 'if' — did you mean 'then'?"
    expect(cards(container)).toEqual([[typo]])
    expect(listed(anchor)).toEqual([typo])
    expect(anchor.querySelector('.ft-hover-card')).toHaveTextContent(
      'Fix the error to evaluate this'
    )
  })

  it("include those on its rows, but not a nested node's", () => {
    const { container } = editor({
      operator: 'if',
      condition: { operator: 'upper', valeu: 'x' },
      then: { $round: { value: [1, 2] } },
    })
    const [ifBar, upperBar, roundBar] = container.querySelectorAll('.ft-display-bar')
    expect(listed(buttonAnchor(ifBar))).toEqual([])
    expect(buttonAnchor(ifBar).querySelector('.ft-issue-badge')).toBeNull()
    expect(listed(buttonAnchor(upperBar))).toEqual([
      "'valeu' is not a parameter of 'upper' — did you mean 'value'?",
    ])
    expect(listed(buttonAnchor(roundBar))).toEqual([
      "'round.value': expected number | null, received array",
    ])
    expect(buttonAnchor(roundBar).querySelector('.ft-issue-badge')).not.toBeNull()
  })

  it("show a warning's badge in amber, before the card's usual lines", () => {
    const { container } = editor({ operator: 'map', input: [1, 2, 3], each: 'x' })
    const anchor = buttonAnchor(container.querySelector('.ft-display-bar')!)
    expect(listed(anchor)).toEqual([
      "'map' binds $element / $index but its 'each' references neither",
    ])
    expect(anchor).toHaveAttribute('data-urgent')
    expect(anchor.querySelector<HTMLElement>('.ft-issue-badge')!.style.backgroundColor).toBe(
      'rgb(214, 137, 16)'
    )
    const lines = [...anchor.querySelectorAll('.ft-hover-card-line')]
    expect(lines[0]).toHaveClass('ft-flag-issue')
    expect(lines.length).toBeGreaterThan(1)
  })

  it('leave a card without any at the usual delay, and no badge', () => {
    const { container } = editor({ operator: 'round', value: 3.14, decimals: 1 })
    const anchor = buttonAnchor(container.querySelector('.ft-display-bar')!)
    expect(anchor).not.toHaveAttribute('data-urgent')
    expect(anchor.querySelector('.ft-issue-badge')).toBeNull()
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
        age: { operator: 'if', condtion: true, thn: 'Adult' },
        rounded: { operator: 'round', value: [1] },
        words: [{ $upper: 5 }, '$colour'],
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
