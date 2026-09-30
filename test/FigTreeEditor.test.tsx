import { fireEvent, render, screen } from '@testing-library/react'
import { FigTree } from 'fig-tree-evaluator'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'
import { keyLabel } from './queries'

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
        {/* @ts-expect-error dragging is disabled until json-edit-react's J4 */}
        <FigTreeEditor figTree={figTree} expression={1} setExpression={vi.fn()} allowDrag />
      </>
    )
    expect(refused).toBeTypeOf('function')
  })

  describe('the fill-in step', () => {
    const incomplete = { operator: 'if', condition: true }
    const complete = { operator: 'if', condition: true, then: 'The condition is true' }

    it('writes nothing for an expression that needs nothing', () => {
      const setExpression = vi.fn()
      const { rerender } = render(
        <FigTreeEditor figTree={figTree} expression={complete} setExpression={setExpression} />
      )
      rerender(
        <FigTreeEditor figTree={figTree} expression={complete} setExpression={setExpression} />
      )
      expect(setExpression).not.toHaveBeenCalled()
    })

    it('fills in an expression that arrives incomplete, and marks the write', () => {
      const setExpression = vi.fn()
      render(
        <FigTreeEditor figTree={figTree} expression={incomplete} setExpression={setExpression} />
      )
      expect(setExpression).toHaveBeenCalledExactlyOnceWith(complete, { autoUpdate: true })
      expect(screen.getByText('"The condition is true"')).toBeInTheDocument()
    })

    it('writes once, however often it re-renders before the host applies it', () => {
      const setExpression = vi.fn()
      const { rerender } = render(
        <FigTreeEditor figTree={figTree} expression={incomplete} setExpression={setExpression} />
      )
      rerender(<FigTreeEditor figTree={figTree} expression={incomplete} setExpression={vi.fn()} />)
      expect(setExpression).toHaveBeenCalledOnce()
      const applied = vi.fn()
      rerender(<FigTreeEditor figTree={figTree} expression={complete} setExpression={applied} />)
      expect(applied).not.toHaveBeenCalled()
    })

    it('completes an edit before it reaches the host, unmarked', () => {
      const setExpression = vi.fn()
      render(
        <FigTreeEditor figTree={figTree} expression={{ a: 1 }} setExpression={setExpression} />
      )
      fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: JSON.stringify({ a: incomplete }) },
      })
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
      expect(setExpression).toHaveBeenCalledExactlyOnceWith({ a: complete })
    })
  })

  describe('adding', () => {
    // The last Add button is the innermost collection's
    const addToLast = () => fireEvent.click(screen.getAllByRole('button', { name: 'Add' }).at(-1)!)

    // json-edit-react's key selector, opened by the root's ＋
    const keyOptions = () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])
      const select = screen.getByRole('combobox')
      const options = [...select.querySelectorAll('option')].map(({ value }) => value)
      return { select, options: options.filter((value) => value !== '') }
    }

    it("leaves a full operator node's adding to its toolbar", () => {
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ operator: 'round', value: 3.14 }}
          setExpression={vi.fn()}
        />
      )
      expect(screen.queryAllByRole('button', { name: 'Add' })).toEqual([])
    })

    it('offers a shorthand node its modifiers by name, and starts the one chosen', () => {
      const setExpression = vi.fn()
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ $plus: [1, 2] }}
          setExpression={setExpression}
        />
      )
      const { select, options } = keyOptions()
      expect(options).toEqual(['//', 'fallback', 'useCache', 'vars'])
      fireEvent.change(select, { target: { value: 'fallback' } })
      expect(setExpression).toHaveBeenCalledExactlyOnceWith({ $plus: [1, 2], fallback: null })
    })

    it('starts a free-typed key as anything', () => {
      const setExpression = vi.fn()
      render(
        <FigTreeEditor figTree={figTree} expression={{ a: 1 }} setExpression={setExpression} />
      )
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'b' } })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      expect(setExpression).toHaveBeenCalledExactlyOnceWith({ a: 1, b: 'Replace me' })
    })

    it("starts an array's new element by the element rule", () => {
      const setExpression = vi.fn()
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ $min: ['apple', 'pear'] }}
          setExpression={setExpression}
        />
      )
      addToLast()
      expect(setExpression).toHaveBeenCalledExactlyOnceWith({
        $min: ['apple', 'pear', 'Replace me'],
      })
    })

    it('starts an element of an array parameter from its seed', () => {
      const setExpression = vi.fn()
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ operator: 'join', values: ['$data.a'] }}
          setExpression={setExpression}
        />
      )
      addToLast()
      expect(setExpression).toHaveBeenCalledExactlyOnceWith({
        operator: 'join',
        values: ['$data.a', 'Bravo'],
      })
    })
  })

  describe('guards', () => {
    const buttons = (name: string) => screen.queryAllByRole('button', { name })

    it('blocks deleting a required parameter, and allows an optional one', () => {
      const setExpression = vi.fn()
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ operator: 'round', value: 3.14, decimals: 2 }}
          setExpression={setExpression}
        />
      )
      expect(buttons('Delete')).toHaveLength(1)
      fireEvent.click(buttons('Delete')[0])
      expect(setExpression).toHaveBeenCalledExactlyOnceWith({ operator: 'round', value: 3.14 })
    })

    it('holds an array parameter at its fixed length', () => {
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ operator: 'lessThan', values: [1, 2] }}
          setExpression={vi.fn()}
        />
      )
      expect(buttons('Add')).toEqual([])
      expect(buttons('Delete')).toEqual([])
    })

    it("applies the host's filter as well", () => {
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ operator: 'round', value: 3.14, decimals: 2 }}
          setExpression={vi.fn()}
          allowDelete={({ key }) => key !== 'decimals'}
        />
      )
      expect(buttons('Delete')).toEqual([])
    })

    it("renames a payload's optional parameter, but not a required one", () => {
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ $round: { value: 3.14, decimals: 2 } }}
          setExpression={vi.fn()}
        />
      )
      fireEvent.doubleClick(keyLabel('value'))
      expect(screen.queryByDisplayValue('value')).toBeNull()
      fireEvent.doubleClick(keyLabel('decimals'))
      expect(screen.getByDisplayValue('decimals')).toBeInTheDocument()
    })
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
          expression={{ operator: 'plsu' }}
          setExpression={vi.fn()}
        />
      )
      expect(issues()[0]).toHaveTextContent("(root)'plsu' names no registered operator")
    })

    it('revalidates when the expression changes', () => {
      const { rerender } = render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ operator: 'plsu' }}
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
