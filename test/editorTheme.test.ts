import { FigTree } from 'fig-tree-evaluator'
import { type NodeData, type Theme } from 'json-edit-react'
import { describe, expect, it } from 'vitest'
import { attachIssues } from '../src/attachIssues'
import { classify } from '../src/classify'
import {
  defaultEditorTheme,
  layerTheme,
  mergeEditorTheme,
  type ThemeContext,
} from '../src/editorTheme'
import { valueAt } from '../src/paths'

const figTree = new FigTree({
  fragments: {
    greet: {
      expression: { $plus: ['Hello ', '$params.name'] },
      parameters: { name: { type: 'string' } },
    },
  },
})
const registry = { operators: figTree.getOperators(), fragments: figTree.getFragments() }

const contextFor = (expression: unknown): ThemeContext => {
  const classification = classify(expression, registry)
  return {
    classification,
    issues: attachIssues(figTree.validate(expression).issues, classification),
    editorTheme: defaultEditorTheme,
    indent: 2,
  }
}

const empty = contextFor(null)

// The editor's layer for an expression, and one of its style functions
// applied to a row
const style = (
  expression: unknown,
  element:
    | 'bracket'
    | 'collectionInner'
    | 'collection'
    | 'property'
    | 'valueRow'
    | 'headerRow'
    | 'iconCollection',
  path: (string | number)[],
  collapsed = false
) => {
  const { styles } = layerTheme(undefined, contextFor(expression)) as Theme
  const styleFunction = styles[element] as (nodeData: NodeData) => unknown
  const parentData = path.length > 0 ? valueAt(expression, path.slice(0, -1)) : null
  return styleFunction({
    path,
    value: valueAt(expression, path),
    parentData,
    collapsed,
  } as NodeData)
}

describe('editor theme', () => {
  it("merges the host's values over the defaults", () => {
    expect(mergeEditorTheme({ refData: 'purple' })).toEqual({
      ...defaultEditorTheme,
      refData: 'purple',
    })
    expect(mergeEditorTheme()).toEqual(defaultEditorTheme)
  })

  it("layers the host's json-edit-react theme over the editor's", () => {
    const host = { string: 'red' }
    const [editorLayer, ...rest] = layerTheme([host, { number: 'blue' }], empty) as unknown[]
    expect(editorLayer).toHaveProperty('styles')
    expect(rest).toEqual([host, { number: 'blue' }])
    const [alone, hostLayer] = layerTheme(host, empty) as unknown[]
    expect(alone).toHaveProperty('styles')
    expect(hostLayer).toBe(host)
    expect(layerTheme(undefined, empty)).toHaveProperty('styles')
  })

  describe('operator nodes', () => {
    const node = { total: { operator: 'plus', values: [1, 2] } }

    it("hide a node's brackets, except around its collapsed summary", () => {
      expect(style(node, 'bracket', ['total'])).toEqual({ display: 'none' })
      expect(style(node, 'bracket', ['total'], true)).toBeNull()
      expect(style(node, 'bracket', ['total', 'values'])).toBeNull()
    })

    it('draw a border around a node', () => {
      expect(style(node, 'collectionInner', ['total'])).toMatchObject({
        borderColor: defaultEditorTheme.nodeBorder,
      })
      expect(style(node, 'collectionInner', [])).toBeNull()
    })

    it('draw an error border and stripe around a broken node', () => {
      for (const broken of [{ operator: 'flibble' }, { operator: 42 }]) {
        expect(style({ total: broken }, 'collectionInner', ['total'])).toMatchObject({
          borderColor: defaultEditorTheme.error,
          borderLeftWidth: '0.3em',
        })
      }
      // Missing a parameter, the node is still well-formed
      expect(style({ total: { operator: 'if' } }, 'collectionInner', ['total'])).toMatchObject({
        borderColor: defaultEditorTheme.nodeBorder,
      })
    })
  })

  describe('fragment calls', () => {
    const call = { total: { fragment: 'greet', parameters: { name: 'Ada' } } }

    it('hide their brackets and draw their border as operator nodes do', () => {
      expect(style(call, 'bracket', ['total'])).toEqual({ display: 'none' })
      expect(style(call, 'bracket', ['total'], true)).toBeNull()
      expect(style(call, 'collectionInner', ['total'])).toMatchObject({
        borderColor: defaultEditorTheme.nodeBorder,
      })
      expect(style({ total: { fragment: 'nope' } }, 'collectionInner', ['total'])).toMatchObject({
        borderColor: defaultEditorTheme.error,
        borderLeftWidth: '0.3em',
      })
    })
  })

  describe('shorthand nodes', () => {
    it('hide their brackets, and draw a dashed border', () => {
      for (const node of [{ $plus: [1, 2] }, { $greet: { name: 'Ada' } }]) {
        expect(style({ total: node }, 'bracket', ['total'])).toEqual({ display: 'none' })
        expect(style({ total: node }, 'bracket', ['total'], true)).toBeNull()
        expect(style({ total: node }, 'collectionInner', ['total'])).toMatchObject({
          borderStyle: 'dashed',
          borderColor: defaultEditorTheme.shorthandBorder,
        })
        expect(style({ total: node }, 'collectionInner', ['total'], true)).toBeNull()
      }
      expect(style({ total: { operator: 'plus' } }, 'collectionInner', ['total'])).toMatchObject({
        borderStyle: 'solid',
      })
    })

    it("draw a broken node's border dashed, in the error colour, with the stripe", () => {
      for (const broken of [{ $plus: [1], extra: 2 }, { $greet: '$data.x' }]) {
        expect(style({ total: broken }, 'collectionInner', ['total'])).toMatchObject({
          borderStyle: 'dashed',
          borderColor: defaultEditorTheme.error,
          borderLeftWidth: '0.3em',
        })
      }
    })
  })

  describe('flattened payloads', () => {
    it("take out their row's indent, and only theirs", () => {
      const call = { fragment: 'greet', parameters: { name: 'Ada' } }
      expect(style(call, 'collection', ['parameters'])).toEqual({ marginLeft: 0 })
      expect(style({ ...call, parameters: '$data.form' }, 'collection', ['parameters'])).toBeNull()
      expect(style({ $if: { condition: true, then: 1 } }, 'collection', ['$if'])).toEqual({
        marginLeft: 0,
      })
      expect(style({ $plus: [1, 2] }, 'collection', ['$plus'])).toBeNull()
      expect(style({ total: { operator: 'plus' } }, 'collection', ['total'])).toBeNull()
    })
  })

  describe('modifier keys', () => {
    const modifier = { color: defaultEditorTheme.modifierKey, fontStyle: 'italic' }

    it('mark fallback and useCache, on any node', () => {
      const node = { operator: 'plus', values: [1], fallback: 0, useCache: false }
      expect(style(node, 'property', ['fallback'])).toEqual(modifier)
      expect(style(node, 'property', ['useCache'])).toEqual(modifier)
      expect(style({ $plus: [1], fallback: { $minus: [2] } }, 'property', ['fallback'])).toEqual(
        modifier
      )
      expect(style(node, 'property', ['values'])).toBeNull()
    })

    it('mark a comment that holds something other than a note', () => {
      const node = { '//': { ticket: 123 }, operator: 'plus', values: [1] }
      expect(style(node, 'property', ['//'])).toEqual(modifier)
      expect(style(node, 'property', ['//', 'ticket'])).toBeNull()
    })

    it('leave plain data and quoted content alone', () => {
      expect(style({ fallback: 1 }, 'property', ['fallback'])).toBeNull()
      const quoted = { operator: 'literal', value: { fallback: 1, vars: { a: 1 } } }
      expect(style(quoted, 'property', ['value', 'fallback'])).toBeNull()
      expect(style(quoted, 'property', ['value', 'vars'])).toBeNull()
    })
  })

  describe('comments', () => {
    const note = {
      borderLeft: `2px solid color-mix(in srgb, ${defaultEditorTheme.comment} 45%, transparent)`,
      background: `color-mix(in srgb, ${defaultEditorTheme.comment} 6%, transparent)`,
    }

    it("draw a string comment's row as a note, wherever a comment can be", () => {
      for (const holder of [
        { '//': 'A note', $plus: [1] },
        { '//': 'A note', operator: 'plus', values: [1] },
        { '//': 'A note', title: '$data.t' },
        { $plus: ['$vars.n'], vars: { '//': 'A note', n: 1 } },
      ]) {
        const at = '//' in holder ? ['//'] : ['vars', '//']
        expect(style(holder, 'valueRow', at)).toMatchObject(note)
      }
      expect(style({ '//': 'A note', title: 'x' }, 'valueRow', ['title'])).toBeNull()
    })

    it('draw a comment of lines as one block, its header row at the top right', () => {
      const node = { '//': ['One', 'Two'], $plus: [1] }
      expect(style(node, 'collection', ['//'])).toMatchObject(note)
      expect(style(node, 'collectionInner', ['//'])).toEqual({ marginLeft: '-1em' })
      expect(style(node, 'headerRow', ['//'])).toEqual({ float: 'right', minHeight: 0, zIndex: 1 })
      expect(style(node, 'iconCollection', ['//'])).toEqual({ display: 'none' })
      expect(style(node, 'bracket', ['//'])).toEqual({ display: 'none' })
      // Its lines sit on the block, with no block of their own
      expect(style(node, 'valueRow', ['//', 0])).toBeNull()
      expect(style(node, 'headerRow', ['$plus'])).toBeNull()
    })

    it('give a collapsed comment of lines its chevron and brackets back', () => {
      const node = { '//': ['One', 'Two'], $plus: [1] }
      expect(style(node, 'headerRow', ['//'], true)).toBeNull()
      expect(style(node, 'iconCollection', ['//'], true)).toBeNull()
      expect(style(node, 'bracket', ['//'], true)).toBeNull()
    })

    it('leave another value, and quoted content, unstyled', () => {
      const other = { '//': { ticket: 123 }, $plus: [1] }
      expect(style(other, 'collection', ['//'])).toBeNull()
      expect(style(other, 'valueRow', ['//', 'ticket'])).toBeNull()
      const quoted = { operator: 'literal', value: { '//': 'Data', lines: { '//': ['a'] } } }
      expect(style(quoted, 'valueRow', ['value', '//'])).toBeNull()
      expect(style(quoted, 'collection', ['value', 'lines', '//'])).toBeNull()
    })
  })

  describe('vars blocks', () => {
    const block = {
      borderLeft: `2px solid ${defaultEditorTheme.varsBlock}`,
      background: `color-mix(in srgb, ${defaultEditorTheme.varsBlock} 7%, transparent)`,
    }

    it('colour the vars key, and draw the rule and tint down the block', () => {
      for (const holder of [
        { operator: 'plus', values: ['$vars.n'], vars: { n: 1 } },
        { $plus: ['$vars.n'], vars: { n: 1 } },
        { fragment: 'greet', parameters: { name: '$vars.n' }, vars: { n: 'Ada' } },
        { title: '$vars.n', vars: { n: 'Ada' } },
      ]) {
        expect(style(holder, 'property', ['vars'])).toEqual({ color: defaultEditorTheme.refVars })
        expect(style(holder, 'collection', ['vars'])).toMatchObject(block)
      }
    })

    it("take the host's colours", () => {
      const context = {
        ...contextFor({ $plus: ['$vars.n'], vars: { n: 1 } }),
        editorTheme: mergeEditorTheme({ refVars: 'teal', varsBlock: 'navy' }),
      }
      const { styles } = layerTheme(undefined, context) as Theme
      const at = (element: 'property' | 'collection') =>
        (styles[element] as (nodeData: NodeData) => unknown)({ path: ['vars'] } as NodeData)
      expect(at('property')).toEqual({ color: 'teal' })
      expect(at('collection')).toMatchObject({ borderLeft: '2px solid navy' })
    })

    it("leave a var's own key and a malformed block unstyled", () => {
      const node = { $plus: ['$vars.n'], vars: { n: 1 } }
      expect(style(node, 'property', ['vars', 'n'])).toBeNull()
      expect(style(node, 'collection', ['vars', 'n'])).toBeNull()
      for (const malformed of [
        { $plus: [1], vars: [1] },
        { $plus: [1], vars: 'x' },
      ]) {
        expect(style(malformed, 'property', ['vars'])).toBeNull()
        expect(style(malformed, 'collection', ['vars'])).toBeNull()
      }
    })
  })
})
