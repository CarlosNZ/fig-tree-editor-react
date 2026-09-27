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
        expression={{ $plus: [1, 2], '//': 'Adds two numbers' }}
        setExpression={vi.fn()}
      />
    )
    expect(screen.getByText('$plus')).toBeInTheDocument()
    expect(screen.getByText('"Adds two numbers"')).toBeInTheDocument()
  })

  it('injects its stylesheet once, however many editors mount', () => {
    render(
      <>
        <FigTreeEditor figTree={figTree} expression={1} setExpression={vi.fn()} />
        <FigTreeEditor figTree={figTree} expression={2} setExpression={vi.fn()} />
      </>
    )
    expect(styleSheets()).toHaveLength(1)
    expect(styleSheets()[0]?.textContent).toContain('.ft-editor')
  })

  it("adds the host's class name to its own", () => {
    const { container } = render(
      <FigTreeEditor figTree={figTree} expression={1} setExpression={vi.fn()} className="host" />
    )
    expect(container.querySelector('.ft-editor.host')).toBeInTheDocument()
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
