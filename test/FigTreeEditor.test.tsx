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
})
