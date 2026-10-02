import { fireEvent, render, screen } from '@testing-library/react'
import { FigTree } from 'fig-tree-evaluator'
import { type CustomTextDefinitions } from 'json-edit-react'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'
import { figTree as demoFigTree } from './fixtures'
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

  it('indents by 3, which the host can change, and lays its own rows out by the same', () => {
    const expression = { a: { b: 1 }, vars: { n: 1 } }
    // A collection row's margin, json-edit-react's or the editor's own
    const margin = (key: string) =>
      keyLabel(key).closest<HTMLElement>('.jer-collection-component')!.style.marginLeft
    const { rerender } = render(
      <FigTreeEditor figTree={figTree} expression={expression} setExpression={vi.fn()} />
    )
    expect(margin('a')).toBe('1.5em')
    expect(margin('vars')).toContain('1.5em')
    rerender(
      <FigTreeEditor figTree={figTree} expression={expression} setExpression={vi.fn()} indent={4} />
    )
    expect(margin('a')).toBe('2em')
    expect(margin('vars')).toContain('2em')
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
      const { unmount } = render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ $plus: [1, 2] }}
          setExpression={setExpression}
        />
      )
      const { select, options } = keyOptions()
      expect(options).toEqual(['//', 'fallback', 'vars'])
      fireEvent.change(select, { target: { value: 'fallback' } })
      expect(setExpression).toHaveBeenCalledExactlyOnceWith({ $plus: [1, 2], fallback: null })
      unmount()

      // `noCache` where the node caches, the demo's registry having the HTTP
      // operators
      const request = { $http: 'https://example.com' }
      render(
        <FigTreeEditor figTree={demoFigTree} expression={request} setExpression={setExpression} />
      )
      const cached = keyOptions()
      expect(cached.options).toEqual(['//', 'fallback', 'noCache', 'vars'])
      fireEvent.change(cached.select, { target: { value: 'noCache' } })
      expect(setExpression).toHaveBeenLastCalledWith({ ...request, noCache: true })
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

    it('prompts for what a typed key names, where the editor knows', () => {
      const prompt = (expression: unknown, customText?: CustomTextDefinitions) => {
        // The demo's registry, which has the HTTP operators
        const { unmount } = render(
          <FigTreeEditor
            figTree={demoFigTree}
            expression={expression}
            setExpression={vi.fn()}
            customText={customText}
          />
        )
        addToLast()
        const { placeholder } = screen.getByRole<HTMLInputElement>('textbox')
        unmount()
        return placeholder
      }
      expect(prompt({ $plus: [1], vars: { n: 1 } })).toBe('New variable name')
      expect(prompt({ operator: 'match', value: 'a', branches: { a: 1 } })).toBe('Add branch name')
      expect(prompt({ $match: ['a', { a: 1 }] })).toBe('Add branch name')
      expect(prompt({ operator: 'buildString', template: '{{a}}', substitutions: { a: 1 } })).toBe(
        'Add token name'
      )
      expect(prompt({ operator: 'http', url: 'u', query: { a: 1 } })).toBe('URL query name')
      expect(prompt({ operator: 'http', url: 'u', headers: { a: 'b' } })).toBe('Add header')
      expect(prompt({ operator: 'graphQL', query: 'q', headers: { a: 'b' } })).toBe('Add header')
      expect(prompt({ operator: 'graphQL', query: 'q', variables: { a: 1 } })).toBe('New variable')

      // Elsewhere, json-edit-react's own, or the host's
      const body = { operator: 'http', url: 'u', body: { a: 1 } }
      expect(prompt(body)).toBe('Enter new key')
      const hostText = { KEY_NEW: () => 'Name it' }
      expect(prompt(body, hostText)).toBe('Name it')
      expect(prompt({ $plus: [1], vars: { n: 1 } }, hostText)).toBe('New variable name')
    })

    it('starts vars on an evaluated plain object as an empty block', () => {
      const typeKey = (key: string) => {
        fireEvent.change(screen.getByRole('textbox'), { target: { value: key } })
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      }
      const setExpression = vi.fn()
      const { unmount } = render(
        <FigTreeEditor figTree={figTree} expression={{ a: 1 }} setExpression={setExpression} />
      )
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      typeKey('vars')
      expect(setExpression).toHaveBeenCalledExactlyOnceWith({ a: 1, vars: {} })
      unmount()

      // A var called `vars`, and a key in quoted content, start as anything
      for (const [expression, added] of [
        [
          { $plus: [1], vars: { n: 1 } },
          { $plus: [1], vars: { n: 1, vars: 'Replace me' } },
        ],
        [
          { operator: 'literal', value: { a: 1 } },
          { operator: 'literal', value: { a: 1, vars: 'Replace me' } },
        ],
      ]) {
        const set = vi.fn()
        const { unmount } = render(
          <FigTreeEditor figTree={figTree} expression={expression} setExpression={set} />
        )
        addToLast()
        typeKey('vars')
        expect(set).toHaveBeenCalledExactlyOnceWith(added)
        unmount()
      }
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

  describe('vars blocks', () => {
    it('summarise a collapsed block by its vars, leaving out a comment', () => {
      const collapseVars = ({ key }: { key: unknown }) => key === 'vars'
      const { unmount } = render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ $plus: ['$vars.a', '$vars.b'], vars: { '//': 'Two', a: 1, b: 2 } }}
          setExpression={vi.fn()}
          collapse={collapseVars}
        />
      )
      expect(screen.getByText('2 vars')).toBeInTheDocument()
      unmount()
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ title: '$vars.a', vars: { a: 1 } }}
          setExpression={vi.fn()}
          collapse={collapseVars}
        />
      )
      expect(screen.getByText('1 var')).toBeInTheDocument()
    })

    it('take the vars colour on the key, and the rule down the block', () => {
      render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ $plus: ['$vars.a'], vars: { a: 1 } }}
          setExpression={vi.fn()}
          editorTheme={{ refVars: 'rgb(1, 2, 3)', varsBlock: 'rgb(4, 5, 6)' }}
        />
      )
      expect(keyLabel('vars')).toHaveStyle({ color: 'rgb(1, 2, 3)' })
      expect(keyLabel('vars').closest('.jer-collection-component')).toHaveStyle({
        borderLeft: '2px solid rgb(4, 5, 6)',
      })
    })
  })
})
