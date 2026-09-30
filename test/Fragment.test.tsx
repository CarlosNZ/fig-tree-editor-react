import { render, screen, within } from '@testing-library/react'
import { type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTree } from 'fig-tree-evaluator'
import { FigTreeEditor } from '../src'
import { keyLabel } from './queries'

// A registry with one fragment carrying `FragmentHints`, and two without, one
// of them taking no arguments
const figTree = new FigTree({
  fragments: {
    getCapital: {
      expression: { $plus: ['Capital of ', '$params.country'] },
      parameters: { country: { type: 'string' }, fields: { type: 'string', required: false } },
      description: "Gets a country's capital city",
      metadata: {
        displayName: 'Capital city',
        docUrl: 'https://example.com/capital',
        backgroundColor: 'black',
        textColor: 'white',
      },
    },
    greet: {
      expression: { $plus: ['Hello ', '$params.name'] },
      parameters: { name: { type: 'string' } },
    },
    today: { expression: 'Monday' },
  },
})

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

const displayBar = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.ft-display-bar')!

describe('the fragment call', () => {
  it('shows the name as written, and its hints: display name, link, colours and card', () => {
    const { container } = editor({ fragment: 'getCapital', parameters: { country: 'NZ' } })
    const bar = within(displayBar(container))
    expect(bar.getByRole('button', { name: 'getCapital' })).toHaveStyle({
      backgroundColor: 'rgb(0, 0, 0)',
      color: 'rgb(255, 255, 255)',
    })
    expect(bar.getByRole('link', { name: 'Capital city' })).toHaveAttribute(
      'href',
      'https://example.com/capital'
    )
    expect(container.querySelector('.ft-display-name')).toHaveTextContent('Capital city · fragment')
    // The stylesheet hides the card until hovered
    expect(bar.getByRole('tooltip', { hidden: true })).toHaveTextContent(
      "Gets a country's capital city"
    )
  })

  it('shows "Fragment" alone, in the editor\'s colours, where it has no hints', () => {
    const { container } = editor({ fragment: 'greet', parameters: { name: 'Ada' } })
    const bar = within(displayBar(container))
    expect(bar.getByRole('button', { name: 'greet' })).toHaveStyle({
      backgroundColor: 'rgb(71, 119, 153)',
      color: 'rgb(235, 223, 90)',
    })
    expect(container.querySelector('.ft-display-name')).toHaveTextContent(/^Fragment$/)
    expect(bar.queryByRole('link')).not.toBeInTheDocument()
    expect(bar.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument()
  })

  it("takes the host's fragment colours", () => {
    const { container } = editor(
      { fragment: 'greet' },
      { editorTheme: { fragmentBackground: 'purple', fragmentText: 'white' } }
    )
    expect(within(displayBar(container)).getByRole('button', { name: 'greet' })).toHaveStyle({
      backgroundColor: 'rgb(128, 0, 128)',
      color: 'rgb(255, 255, 255)',
    })
  })

  it('shows static arguments as its own rows, without its fragment or parameters rows', () => {
    editor({ fragment: 'getCapital', parameters: { country: 'NZ', fields: 'all' }, fallback: 'x' })
    expect(keyLabel('country')).toBeInTheDocument()
    expect(keyLabel('fields')).toBeInTheDocument()
    expect(keyLabel('fallback')).toBeInTheDocument()
    expect(() => keyLabel('parameters')).toThrow()
    expect(() => keyLabel('fragment')).toThrow()
  })

  it("lines its arguments up as an operator's parameters", () => {
    const { container } = editor({
      call: { fragment: 'greet', parameters: { name: 'Ada' } },
      sum: { operator: 'plus', values: [1, 2] },
    })
    const margin = (key: string) =>
      keyLabel(key)
        .closest<HTMLElement>('.jer-component')!
        .parentElement!.closest<HTMLElement>('.jer-collection-component')!.style.marginLeft
    // The static arguments' own row adds no indent; the operator's node does
    // its own, as the call does
    expect(margin('name')).toBe('0px')
    expect(margin('values')).toBe('1em')
    expect(container.querySelectorAll('.ft-node')).toHaveLength(2)
  })

  it("shows a dynamic call's parameters row with its key", () => {
    editor({ fragment: 'greet', parameters: '$data.form' })
    expect(keyLabel('parameters')).toBeInTheDocument()
  })

  it('is its header alone with no arguments', () => {
    const { container } = editor({ fragment: 'today' })
    expect(displayBar(container)).toBeInTheDocument()
    expect(container.querySelectorAll('.ft-node .jer-key-text')).toHaveLength(0)
  })

  it('renders in a shorthand payload, without the `$name` key', () => {
    const { container } = editor({ $not: { fragment: 'greet', parameters: { name: 'Ada' } } })
    expect(within(displayBar(container)).getByRole('button', { name: 'greet' })).toBeVisible()
    expect(() => keyLabel('$not')).toThrow()
  })

  describe('when broken', () => {
    it('shows an unknown name as an error, with the message', () => {
      const { container } = editor({ fragment: 'greeet' })
      const bar = within(displayBar(container))
      expect(bar.queryByRole('button', { name: 'greeet' })).not.toBeInTheDocument()
      expect(bar.getByText('greeet')).toHaveStyle({ color: 'rgb(192, 57, 43)' })
      expect(bar.getByText(/names no registered fragment/)).toBeInTheDocument()
      expect(container.querySelector('.ft-display-name')).toHaveTextContent(/^Fragment$/)
    })

    it('shows "invalid node" for a name that is not a string', () => {
      const { container } = editor({ fragment: 42 })
      expect(within(displayBar(container)).getByText('invalid node')).toBeInTheDocument()
    })
  })

  it('summarises itself when collapsed', () => {
    editor({ call: { fragment: 'greet', parameters: { name: 'Ada' } } }, { collapse: 1 })
    expect(screen.getByText('Fragment: greet')).toBeInTheDocument()
  })
})
