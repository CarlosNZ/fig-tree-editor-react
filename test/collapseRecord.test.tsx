import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'
import { classify } from '../src/classify'
import {
  emptyCollapseRecord,
  pruneCollapseRecord,
  recordToggle,
  recordedState,
} from '../src/collapseRecord'
import { figTree, registry } from './fixtures'

describe('the collapse record', () => {
  it("gives a row's own toggle, the latest winning", () => {
    const record = emptyCollapseRecord()
    recordToggle(record, ['a'], false, false)
    expect(recordedState(record, ['a'])).toBe(false)
    recordToggle(record, ['a'], true, false)
    expect(recordedState(record, ['a'])).toBe(true)
    expect(recordedState(record, ['b'])).toBeUndefined()
  })

  it('applies a collapse-all to its row and everything beneath, replacing their toggles', () => {
    const record = emptyCollapseRecord()
    recordToggle(record, ['a', 'b'], false, false)
    recordToggle(record, ['a'], true, true)
    expect(recordedState(record, ['a'])).toBe(true)
    expect(recordedState(record, ['a', 'b'])).toBe(true)
    expect(recordedState(record, ['a', 'b', 0])).toBe(true)
    expect(recordedState(record, ['c'])).toBeUndefined()
    // A later toggle beneath it wins for that row
    recordToggle(record, ['a', 'b'], false, false)
    expect(recordedState(record, ['a', 'b'])).toBe(false)
    expect(recordedState(record, ['a', 'b', 0])).toBe(true)
  })

  it('drops the toggles of rows no longer in the tree, and keeps quoted rows', () => {
    const record = emptyCollapseRecord()
    recordToggle(record, ['gone'], false, false)
    recordToggle(record, ['kept'], false, true)
    recordToggle(record, ['quoted', 'value', 'a'], false, false)
    const expression = { kept: [1], quoted: { $literal: { a: [1] } } }
    pruneCollapseRecord(record, expression, classify(expression, registry))
    expect(recordedState(record, ['gone'])).toBeUndefined()
    expect(recordedState(record, ['kept'])).toBe(false)
    expect(recordedState(record, ['quoted', 'value', 'a'])).toBe(false)
  })
})

describe('collapse state through a conversion', () => {
  const initial = { sum: { operator: 'round', value: { operator: 'abs', value: -1 } } }

  // A host holding the expression, so each conversion comes back
  const Host = (props: Partial<ComponentProps<typeof FigTreeEditor>>) => {
    const [expression, setExpression] = useState<unknown>(initial)
    return (
      <FigTreeEditor
        figTree={figTree}
        expression={expression}
        setExpression={setExpression}
        {...props}
      />
    )
  }

  // json-edit-react keeps a collapsed row's summary in place, shown by class
  const collapsed = (summary: string) => screen.getByText(summary).classList.contains('jer-visible')
  const chevron = (summary: string) =>
    screen
      .getByText(summary)
      .closest('.jer-collection-header-row')!
      .querySelector<HTMLElement>('.jer-collapse-icon')!
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)))
  // The outer node's button comes first
  const convert = (label: string) =>
    fireEvent.click(screen.getAllByRole('button', { name: label })[0])

  it('keeps a node the author opened open through every form of its parent', async () => {
    render(<Host collapse={2} />)
    // Two levels down, so it starts collapsed
    expect(collapsed('Operator: abs')).toBe(true)
    fireEvent.click(chevron('Operator: abs'))
    await settle()
    convert('To shorthand')
    expect(collapsed('Shorthand: $abs')).toBe(false)
    convert('To positional')
    expect(collapsed('Shorthand: $abs')).toBe(false)
    convert('To full')
    expect(collapsed('Operator: abs')).toBe(false)
  })

  it('keeps a node the author closed closed', async () => {
    render(<Host collapse={false} />)
    fireEvent.click(chevron('Operator: abs'))
    await settle()
    convert('To shorthand')
    expect(collapsed('Shorthand: $abs')).toBe(true)
  })

  it('keeps a collapse-all, which json-edit-react replays only at the path it was made at', async () => {
    render(<Host collapse={false} />)
    fireEvent.click(chevron('Operator: abs'), { altKey: true })
    await settle()
    convert('To shorthand')
    expect(collapsed('Shorthand: $round')).toBe(false)
    expect(collapsed('Shorthand: $abs')).toBe(true)
  })

  it("tells the host's onCollapse", async () => {
    const onCollapse = vi.fn()
    render(<Host collapse={false} onCollapse={onCollapse} />)
    fireEvent.click(chevron('Operator: abs'))
    await settle()
    expect(onCollapse).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['sum', 'value'], collapsed: true })
    )
  })

  it("forgets the author's toggles when the host's collapse changes", async () => {
    const { rerender } = render(<Host collapse={2} />)
    fireEvent.click(chevron('Operator: abs'))
    await settle()
    // The same levels, as a filter json-edit-react resets every row to
    rerender(<Host collapse={({ level }) => level >= 2} />)
    await settle()
    convert('To shorthand')
    expect(collapsed('Shorthand: $abs')).toBe(true)
  })
})
