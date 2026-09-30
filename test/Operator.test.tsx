import { render, screen, within } from '@testing-library/react'
import { type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'
import { figTree } from './fixtures'

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

const displayBar = (container: HTMLElement, index = 0) =>
  container.querySelectorAll<HTMLElement>('.ft-display-bar')[index]

describe('the operator node', () => {
  it('shows the name as written on its button, and the display name', () => {
    const { container } = editor({ operator: 'plus', values: [1, 2] })
    const bar = within(displayBar(container))
    expect(bar.getByRole('button', { name: 'plus' })).toBeInTheDocument()
    expect(bar.getByRole('link', { name: 'Plus (+)' })).toHaveAttribute(
      'href',
      'https://github.com/CarlosNZ/fig-tree-evaluator'
    )
  })

  it('shows an alias as written', () => {
    const { container } = editor({ operator: '+', values: [1, 2] })
    expect(within(displayBar(container)).getByRole('button', { name: '+' })).toBeInTheDocument()
  })

  it('shows the description on hover', () => {
    const { container } = editor({ operator: 'plus', values: [1, 2] })
    // The stylesheet hides the card until hovered
    expect(within(displayBar(container)).getByRole('tooltip', { hidden: true })).toHaveTextContent(
      /^Add numbers/
    )
  })

  it('drops its operator row, and keeps the others', () => {
    editor({ operator: 'plus', values: [1, 2], fallback: 0 })
    expect(screen.queryByText('operator')).not.toBeInTheDocument()
    expect(screen.getByText('values')).toBeInTheDocument()
    expect(screen.getByText('fallback')).toBeInTheDocument()
  })

  it('renders nested nodes, and one in a shorthand payload', () => {
    const { container } = editor({
      operator: 'if',
      condition: { operator: 'greaterThan', values: [2, 1] },
      then: { $not: { operator: 'and', values: [true] } },
      else: 'x',
    })
    const names = [...container.querySelectorAll('.ft-display-bar .ft-name')].map(
      (name) => name.textContent
    )
    expect(names).toEqual(['if', 'greaterThan', 'and'])
  })

  it('shows a host operator by its name, with no link when it has no docUrl', () => {
    const { container } = editor({ operator: 'reverse', value: 'abc' })
    const bar = within(displayBar(container))
    expect(bar.getByRole('button', { name: 'reverse' })).toBeInTheDocument()
    expect(bar.getByText('reverse', { selector: '.ft-display-name' })).toBeInTheDocument()
    expect(bar.queryByRole('link')).not.toBeInTheDocument()
  })

  it("takes the host's display overrides", () => {
    const { container } = editor(
      { operator: 'plus', values: [1, 2] },
      { operatorHints: { plus: { displayName: 'Add', docUrl: 'https://example.com/add' } } }
    )
    expect(within(displayBar(container)).getByRole('link', { name: 'Add' })).toHaveAttribute(
      'href',
      'https://example.com/add'
    )
  })

  describe('when broken', () => {
    it('shows an unknown name as an error, with the message and no button', () => {
      const { container } = editor({ operator: 'plsu', values: [1] })
      const bar = within(displayBar(container))
      expect(bar.queryByRole('button')).not.toBeInTheDocument()
      expect(bar.getByText('plsu')).toHaveStyle({ color: 'rgb(192, 57, 43)' })
      expect(bar.getByText(/names no registered operator/)).toBeInTheDocument()
    })

    it('shows "invalid node" for a name that is not a string', () => {
      const { container } = editor({ operator: 42 })
      expect(within(displayBar(container)).getByText('invalid node')).toBeInTheDocument()
    })

    it("takes the host's error colour", () => {
      const { container } = editor({ operator: 'plsu' }, { editorTheme: { error: 'purple' } })
      expect(within(displayBar(container)).getByText('plsu').parentElement).toHaveStyle({
        color: 'rgb(128, 0, 128)',
      })
    })

    it('is not broken when it is only missing a parameter', () => {
      const { container } = editor({ operator: 'if', condition: true })
      expect(within(displayBar(container)).getByRole('button', { name: 'if' })).toBeInTheDocument()
    })
  })

  describe('collapsed', () => {
    it('summarises itself by its name as written', () => {
      editor({ total: { operator: '*', values: [2, 3] } }, { collapse: 1 })
      expect(screen.getByText('Operator: *')).toBeInTheDocument()
    })

    it("uses the host's text where the editor has none", () => {
      editor(
        { total: { operator: 'plus', values: [1] }, list: [1, 2] },
        { collapse: 1, customText: { ITEMS_MULTIPLE: () => 'many' } }
      )
      expect(screen.getByText('Operator: plus')).toBeInTheDocument()
      expect(screen.getByText('list').closest('.jer-collection-header-row')).toHaveTextContent(
        'many'
      )
    })
  })
})
