import { render, screen } from '@testing-library/react'
import { FigTree } from 'fig-tree-evaluator'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'

const figTree = new FigTree()

const styleSheets = () => document.head.querySelectorAll('style[data-fig-tree-editor-styles]')

describe('FigTreeEditor', () => {
  it('renders the expression as JSON', () => {
    render(
      <FigTreeEditor
        figTree={figTree}
        expression={{ title: 'Hello', count: 2 }}
        setExpression={vi.fn()}
      />
    )
    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('"Hello"')).toBeInTheDocument()
  })

  it('injects its stylesheet once, however many editors mount', () => {
    render(
      <>
        <FigTreeEditor figTree={figTree} expression={1} setExpression={vi.fn()} />
        <FigTreeEditor figTree={figTree} expression={2} setExpression={vi.fn()} />
      </>
    )
    expect(styleSheets()).toHaveLength(1)
    expect(styleSheets()[0]?.textContent).toContain('.ft-select')
  })

  it("adds the host's class name to its own", () => {
    const { container } = render(
      <FigTreeEditor figTree={figTree} expression={1} setExpression={vi.fn()} className="host" />
    )
    expect(container.querySelector('.ft-editor.host')).toBeInTheDocument()
  })

  it('hides array indexes, which the host can show', () => {
    const { rerender } = render(
      <FigTreeEditor figTree={figTree} expression={['a', 'b']} setExpression={vi.fn()} />
    )
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    rerender(
      <FigTreeEditor
        figTree={figTree}
        expression={['a', 'b']}
        setExpression={vi.fn()}
        showArrayIndexes
      />
    )
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it("applies the host's json-edit-react theme", () => {
    render(
      <FigTreeEditor
        figTree={figTree}
        expression={{ title: 'Hello' }}
        setExpression={vi.fn()}
        theme={{ property: 'rgb(1, 2, 3)' }}
      />
    )
    expect(screen.getByText('title')).toHaveStyle({ color: 'rgb(1, 2, 3)' })
  })

  it('refuses the json-edit-react props the editor replaces, by type', () => {
    // Never rendered: the file's typecheck (`pnpm typecheck`) is the test
    const refused = () => (
      <>
        {/* @ts-expect-error `data` is the editor's `expression` */}
        <FigTreeEditor figTree={figTree} expression={1} setExpression={vi.fn()} data={1} />
        {/* @ts-expect-error `setData` is the editor's `setExpression` */}
        <FigTreeEditor figTree={figTree} expression={1} setExpression={vi.fn()} setData={vi.fn()} />
        <FigTreeEditor
          figTree={figTree}
          expression={1}
          setExpression={vi.fn()}
          // @ts-expect-error the editor builds each row's type options
          allowTypeSelection
        />
        <FigTreeEditor
          figTree={figTree}
          expression={1}
          setExpression={vi.fn()}
          // @ts-expect-error the editor offers each node's parameters
          newKeyOptions={['a']}
        />
        {/* @ts-expect-error the editor gives every new value */}
        <FigTreeEditor figTree={figTree} expression={1} setExpression={vi.fn()} defaultValue={1} />
        <FigTreeEditor
          figTree={figTree}
          expression={1}
          setExpression={vi.fn()}
          // @ts-expect-error the editor's own definitions
          customNodeDefinitions={[]}
        />
      </>
    )
    expect(refused).toBeTypeOf('function')
  })

  describe('validation', () => {
    const issues = () => screen.queryAllByRole('listitem')

    it('lists nothing for a valid expression', () => {
      render(
        <FigTreeEditor figTree={figTree} expression={{ $plus: [1, 2] }} setExpression={vi.fn()} />
      )
      expect(issues()).toHaveLength(0)
    })

    it('lists each issue with its severity, path and message', () => {
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ $plus: [1, '$vars.missing', '$typo'] }}
          setExpression={vi.fn()}
        />
      )
      expect(issues()).toHaveLength(2)
      const [error, warning] = issues()
      expect(error).toHaveClass('ft-issue-error')
      expect(error).toHaveTextContent('$plus[1]')
      expect(error).toHaveTextContent("no var 'missing' is declared in scope")
      expect(warning).toHaveClass('ft-issue-warning')
      expect(warning).toHaveTextContent('$plus[2]')
    })

    it('labels an issue at the root', () => {
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ operator: 'plus' }}
          setExpression={vi.fn()}
        />
      )
      expect(issues()[0]).toHaveTextContent("(root)'plus' requires 'values'")
    })

    it('revalidates when the expression changes', () => {
      const { rerender } = render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ operator: 'plus' }}
          setExpression={vi.fn()}
        />
      )
      expect(issues()).toHaveLength(1)
      rerender(
        <FigTreeEditor figTree={figTree} expression={{ $plus: [1, 2] }} setExpression={vi.fn()} />
      )
      expect(issues()).toHaveLength(0)
    })
  })
})
