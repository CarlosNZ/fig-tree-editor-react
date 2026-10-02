import { fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode, useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTree, coreOperators, httpOperators } from 'fig-tree-evaluator'
import { FigTreeEditor } from '../src'
import { keyLabel } from './queries'

// The core and HTTP operators, with one fragment carrying `FragmentHints` and
// one without
const fragments = {
  getCapital: {
    expression: { $plus: ['Capital of ', '$params.country'] },
    parameters: { country: { type: 'string' as const } },
    description: "Gets a country's capital city",
    metadata: { displayName: 'Capital city', backgroundColor: 'black', textColor: 'white' },
  },
  greet: {
    expression: { $plus: ['Hello ', '$params.name'] },
    parameters: { name: { type: 'string' as const } },
  },
}
const figTree = new FigTree({ operators: [coreOperators, httpOperators()], fragments })

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

// A host holding the expression, so each commit comes back as the editor's
// next expression, in StrictMode
const host = (initial: unknown, props: Partial<ComponentProps<typeof FigTreeEditor>> = {}) => {
  const written: unknown[] = []
  const Host = () => {
    const [expression, setExpression] = useState(initial)
    return (
      <FigTreeEditor
        figTree={figTree}
        expression={expression}
        setExpression={(next) => {
          written.push(next)
          setExpression(next)
        }}
        collapse={false}
        {...props}
      />
    )
  }
  const { container } = render(<Host />, { wrapper: StrictMode })
  return { container, written }
}
const latest = (written: unknown[]) => written[written.length - 1]

const displayBar = (container: HTMLElement, index = 0) =>
  container.querySelectorAll<HTMLElement>('.ft-display-bar')[index]
// What sits on the button's line
const onLine = (container: HTMLElement) =>
  displayBar(container).querySelector<HTMLElement>('.ft-display-bar-value')

const description = (name: string) =>
  figTree.getOperators().find((operator) => operator.name === name)!.description

describe('the shorthand node', () => {
  it("shows the name as written, with its `$`, and the operator's display name and card", () => {
    const { container } = editor({ $if: { condition: true, then: 'Yes' } })
    const bar = displayBar(container)
    expect(bar).toHaveClass('ft-shorthand')
    expect(within(bar).getByRole('button', { name: '$if' })).toBeInTheDocument()
    expect(bar.querySelector('.ft-display-name')).toHaveTextContent('Conditional (?)')
    // The stylesheet hides the card until hovered
    expect(within(bar).getByRole('tooltip', { hidden: true })).toHaveTextContent(description('if'))
  })

  it('shows an alias as written', () => {
    const { container } = editor({ '$+': [1, 2] })
    expect(within(displayBar(container)).getByRole('button', { name: '$+' })).toBeInTheDocument()
  })

  it("has no toolbar, and opens as raw JSON from json-edit-react's edit button", () => {
    const { container } = editor({ $plus: [1, 2] })
    expect(screen.queryByRole('button', { name: 'Open toolbar' })).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(JSON.parse(screen.getByRole<HTMLTextAreaElement>('textbox').value)).toEqual({
      $plus: [1, 2],
    })
    expect(container.querySelector('.ft-toolbar')).not.toBeInTheDocument()
  })

  describe('its rows', () => {
    it("shows a named payload's rows beneath the header, as the node's own", () => {
      const { container } = editor({ $if: { condition: true, then: 'Yes' } })
      expect(keyLabel('condition')).toBeInTheDocument()
      expect(() => keyLabel('$if')).toThrow()
      expect(onLine(container)).toBeNull()
    })

    it('keeps an argument list beneath the header, with its brackets and edit tools', () => {
      const { container } = editor({ $plus: [1, 2] })
      expect(onLine(container)).toBeNull()
      expect(() => keyLabel('$plus')).toThrow()
      const list = container.querySelectorAll('.jer-collection-header-row')[1]
      expect(list).toHaveTextContent('[')
      expect(within(list as HTMLElement).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })

    it("puts a single plain value or reference on the button's line", () => {
      const plain = editor({ $not: true })
      expect(within(onLine(plain.container)!).getByText('true')).toBeInTheDocument()
      expect(() => keyLabel('$not')).toThrow()
      // Its own row, with its own edit tools
      expect(
        within(onLine(plain.container)!).getByRole('button', { name: 'Edit' })
      ).toBeInTheDocument()
      plain.unmount()
      const reference = editor({ $not: '$data.x' })
      expect(within(onLine(reference.container)!).getByText(/\$data\.x/)).toBeInTheDocument()
    })

    it('puts a single node beneath the header, and the modifiers beneath the value', () => {
      const nested = editor({ $not: { $greaterThan: ['$data.age', 18] } })
      expect(onLine(nested.container)).toBeNull()
      expect(nested.container.querySelectorAll('.ft-display-bar')).toHaveLength(2)
      nested.unmount()
      const { container } = editor({ $http: 'https://example.com', fallback: null })
      expect(within(onLine(container)!).getByText(/https:\/\/example\.com/)).toBeInTheDocument()
      expect(displayBar(container)).not.toContainElement(keyLabel('fallback'))
    })
  })

  describe('as a fragment call', () => {
    it("shows the fragment's hints, as a full call does", () => {
      const { container } = editor({ $getCapital: { country: 'NZ' } })
      const bar = displayBar(container)
      expect(within(bar).getByRole('button', { name: '$getCapital' })).toHaveStyle({
        backgroundColor: 'rgb(0, 0, 0)',
        color: 'rgb(255, 255, 255)',
      })
      expect(bar.querySelector('.ft-display-name')).toHaveTextContent('Capital city · fragment')
      expect(within(bar).getByRole('tooltip', { hidden: true })).toHaveTextContent(
        "Gets a country's capital city"
      )
      expect(keyLabel('country')).toBeInTheDocument()
    })

    it('shows "Fragment" alone, in the editor\'s colours, where it has no hints', () => {
      const { container } = editor({ $greet: { name: 'Ada' } })
      const bar = displayBar(container)
      expect(within(bar).getByRole('button', { name: '$greet' })).toHaveStyle({
        backgroundColor: 'rgb(71, 119, 153)',
      })
      expect(bar.querySelector('.ft-display-name')).toHaveTextContent(/^Fragment$/)
    })
  })

  it("adds the host's defaults to the card, unless the payload sets them", () => {
    const instance = new FigTree({
      operators: [coreOperators, httpOperators()],
      operatorDefaults: { http: { timeout: 5000 } },
    })
    const line = 'This application sets timeout: 5000 on every http node'
    const positional = editor({ $http: 'https://example.com' }, { figTree: instance })
    expect(
      within(displayBar(positional.container)).getByRole('tooltip', { hidden: true })
    ).toHaveTextContent(line)
    positional.unmount()
    const named = editor(
      { $http: { url: 'https://example.com', timeout: 1 } },
      { figTree: instance }
    )
    expect(
      within(displayBar(named.container)).getByRole('tooltip', { hidden: true })
    ).not.toHaveTextContent(line)
  })

  it('says on the card whether the cache is in force, where the node caches', () => {
    const card = (container: HTMLElement) =>
      within(displayBar(container)).getByRole('tooltip', { hidden: true })
    const request = editor({ $http: 'https://example.com' })
    expect(card(request.container)).toHaveTextContent('Cache: active')
    request.unmount()
    const off = editor({ $http: 'https://example.com', noCache: true })
    expect(card(off.container)).toHaveTextContent('Cache: disabled')
  })

  describe('its spelling', () => {
    const button = (container: HTMLElement, name: string) =>
      within(displayBar(container)).getByRole('button', { name })

    it('switches between name and alias on a Cmd- or Ctrl-click, keeping its keys in place', () => {
      const { container, written } = host({ $plus: [1, 2], fallback: 0 })
      fireEvent.click(button(container, '$plus'), { metaKey: true })
      expect(latest(written)).toEqual({ '$+': [1, 2], fallback: 0 })
      expect(Object.keys(latest(written) as object)).toEqual(['$+', 'fallback'])
      fireEvent.click(button(container, '$+'), { ctrlKey: true })
      expect(latest(written)).toEqual({ $plus: [1, 2], fallback: 0 })
    })

    it('says so on the card, and does nothing for a fragment or where editing is off', () => {
      const plus = editor({ $plus: [1, 2] })
      expect(plus.container.querySelector('.ft-hover-card-note')).toHaveTextContent(
        /^Cmd\/Ctrl-click to write it as \$\+$/
      )
      plus.unmount()
      const call = host({ $greet: { name: 'Ada' } })
      fireEvent.click(button(call.container, '$greet'), { metaKey: true })
      expect(call.written).toEqual([])
      expect(call.container.querySelector('.ft-hover-card-note')).toBeNull()
      const locked = host({ $plus: [1] }, { allowEdit: false })
      fireEvent.click(button(locked.container, '$plus'), { metaKey: true })
      expect(locked.written).toEqual([])
    })
  })

  describe('when broken', () => {
    it.each([
      [{ $plus: [1], extra: 2 }, '$plus', /'extra' may not sit beside/],
      [{ $plus: 1, $minus: 2 }, '$plus', /'\$minus' may not sit beside/],
      [{ $greet: '$data.x' }, '$greet', /no single-value or positional form/],
      [{ $greet: { name: 'Ada' }, noCache: false }, '$greet', /'noCache' takes only the literal/],
    ])('shows %j as an error, with the message and no button', (expression, name, message) => {
      const { container } = editor(expression)
      const bar = within(displayBar(container))
      expect(bar.queryByRole('button', { name })).not.toBeInTheDocument()
      expect(bar.getByText(name)).toHaveStyle({ color: 'rgb(192, 57, 43)' })
      expect(bar.getByText(message)).toBeInTheDocument()
      // Every row goes beneath, since the line holds the message
      expect(onLine(container)).toBeNull()
    })

    it('is not broken when only missing something', () => {
      const { container } = editor({ $if: ['$data.x'] })
      expect(within(displayBar(container)).getByRole('button', { name: '$if' })).toBeVisible()
    })
  })

  describe('its conversion button', () => {
    const convertButton = (label: string) => screen.getByRole('button', { name: label })

    it('steps through the forms, each commit converting the node where it stands', () => {
      const { written } = host({ x: { $if: { condition: true, then: 'Yes', else: 'No' } } })
      fireEvent.click(convertButton('To positional'))
      expect(latest(written)).toEqual({ x: { $if: [true, 'Yes', 'No'] } })
      fireEvent.click(convertButton('To full'))
      expect(latest(written)).toEqual({
        x: { operator: 'if', condition: true, then: 'Yes', else: 'No' },
      })
      fireEvent.click(convertButton('To shorthand'))
      expect(latest(written)).toEqual({ x: { $if: { condition: true, then: 'Yes', else: 'No' } } })
    })

    it('goes from named back to full where there is no positional form', () => {
      // `from` has no position, and `default` no reference form
      editor({ $get: { path: 'a', from: '$data.x', default: 0 } })
      expect(convertButton('To full')).toBeInTheDocument()
    })

    it('shows only where converting is allowed and succeeds', () => {
      const locked = editor({ $plus: [1, 2] }, { allowEdit: false })
      expect(screen.queryByRole('button', { name: 'To full' })).not.toBeInTheDocument()
      locked.unmount()
      const broken = editor({ $plus: [1], extra: 2 })
      expect(screen.queryByRole('button', { name: 'To full' })).not.toBeInTheDocument()
      broken.unmount()
      // `./format` refuses the node beneath, so neither has a button
      editor({ $not: { operator: 'flibble' } })
      expect(screen.queryByRole('button', { name: /^To / })).not.toBeInTheDocument()
    })
  })

  it('summarises itself when collapsed, as written', () => {
    editor({ a: { $if: { condition: true, then: 1 } }, b: { '$+': [1, 2] } }, { collapse: 1 })
    expect(screen.getByText('Shorthand: $if')).toBeInTheDocument()
    expect(screen.getByText('Shorthand: $+')).toBeInTheDocument()
  })
})
