import { fireEvent, render, screen } from '@testing-library/react'
import { type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTree, coreOperators } from 'fig-tree-evaluator'
import { FigTreeEditor } from '../src'

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

const area = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.ft-message-container')
const lines = () => screen.queryAllByRole('listitem')
const header = () => screen.getByRole('button', { name: /^Messages/ })

describe('the messages area', () => {
  it('shows nothing for a valid expression', () => {
    const { container } = editor({ $plus: [1, 2] })
    expect(area(container)).toBeNull()
  })

  it('lists each issue with its severity, the row it marks and its message', () => {
    editor({ $plus: [1, '$vars.missing', '$typo'] })
    expect(lines()).toHaveLength(2)
    const [error, warning] = lines()
    expect(error).toHaveTextContent('error$plus[1]')
    expect(error).toHaveTextContent("no var 'missing' is declared in scope")
    expect(warning).toHaveTextContent('warning$plus[2]')
  })

  it('lists hints, which no row shows', () => {
    editor({ $buildString: ['Hi %1 %3', 'Ada', 'Lovelace'] })
    expect(lines().map((line) => line.firstChild!.textContent)).toEqual([
      'warning',
      'warning',
      'hint',
    ])
    expect(lines()[2]).toHaveTextContent('the tokens skip a number')
  })

  it('lists in tree order', () => {
    editor({ age: { operator: 'if', condition: true, thn: 1 }, rounded: { $round: [[1]] } })
    expect(lines().map((line) => line.querySelector('code')!.textContent)).toEqual([
      'age',
      'age.thn',
      'rounded.$round[0]',
    ])
  })

  it('labels an issue at the root', () => {
    editor({ operator: 'plsu' })
    expect(lines()[0]).toHaveTextContent("(root)'plsu' names no registered operator")
  })

  it('follows the expression', () => {
    const { container, rerender } = editor({ operator: 'plsu' })
    expect(lines()).toHaveLength(1)
    rerender(
      <FigTreeEditor figTree={figTree} expression={{ $plus: [1, 2] }} setExpression={vi.fn()} />
    )
    expect(area(container)).toBeNull()
  })

  it('counts each severity in its header', () => {
    editor({ greeting: { $buildString: ['Hi %1 %3', 'Ada', 'Lovelace'] }, x: { $upper: 5 } })
    const counts = [...header().querySelectorAll('.ft-severity')].map((pill) => pill.textContent)
    expect(counts).toEqual(['1 error', '2 warnings', '1 hint'])
  })

  it('folds away from its header, and opens again', () => {
    editor({ operator: 'plsu' })
    expect(header()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header())
    expect(header()).toHaveAttribute('aria-expanded', 'false')
    expect(lines()).toHaveLength(0)
    fireEvent.click(header())
    expect(lines()).toHaveLength(1)
  })

  it('scrolls beyond the maximum height, 15em by default', () => {
    const { container, unmount } = editor({ operator: 'plsu' })
    // Read from the element's own style, as jsdom computes no `em`
    expect(container.querySelector<HTMLElement>('.ft-messages-list')!.style.maxHeight).toBe('15em')
    unmount()
    const { container: other } = editor({ operator: 'plsu' }, { messagesMaxHeight: 120 })
    expect(other.querySelector('.ft-messages-list')).toHaveStyle({ maxHeight: '120px' })
  })

  it('is hidden by a maximum height of 0, header and all', () => {
    const { container } = editor({ operator: 'plsu' }, { messagesMaxHeight: 0 })
    expect(area(container)).toBeNull()
  })

  it("colours each severity from the editor's theme", () => {
    editor(
      { greeting: { $buildString: ['Hi %1 %3', 'Ada', 'Lovelace'] } },
      { editorTheme: { warning: 'rgb(1, 2, 3)', hint: 'rgb(4, 5, 6)' } }
    )
    const [warning, , hint] = lines().map((line) => line.firstChild as HTMLElement)
    expect(warning).toHaveStyle({ backgroundColor: 'rgb(1, 2, 3)' })
    expect(hint).toHaveStyle({ backgroundColor: 'rgb(4, 5, 6)' })
  })
})

describe("the editor's outer container", () => {
  const outer = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.ft-outer-container')!

  it('takes the width the host gives the editor, and the tree fills it', () => {
    const { container } = editor({ operator: 'plsu' }, { minWidth: '90%', maxWidth: 800 })
    expect(outer(container)).toHaveStyle({ minWidth: '90%', maxWidth: '800px' })
    const tree = container.querySelector('.jer-editor-container')
    expect(tree).toHaveStyle({ minWidth: '0px', maxWidth: '100%' })
    expect(tree!.parentElement).toBe(outer(container))
    expect(outer(container).lastElementChild).toBe(area(container))
  })

  it("carries the host's id, so a host can reach one instance's parts", () => {
    const { container } = editor({ operator: 'plsu' }, { id: 'rules' })
    expect(outer(container)).toHaveAttribute('id', 'rules')
    expect(container.querySelectorAll('#rules')).toHaveLength(1)
    expect(container.querySelector('#rules > .jer-editor-container')).not.toBeNull()
    expect(container.querySelector('#rules > .ft-message-container')).not.toBeNull()
  })

  it("takes json-edit-react's own sizes where the host gives none", () => {
    const { container } = editor({ $plus: [1, 2] }, { baseFontSize: 14 })
    // Read from the element's own style, as jsdom computes no `min()`
    const { style } = outer(container)
    expect([style.minWidth, style.maxWidth, style.fontSize]).toEqual([
      '250px',
      'min(600px, 90vw)',
      '14px',
    ])
  })
})
