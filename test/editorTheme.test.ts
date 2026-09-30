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
  }
}

const empty = contextFor(null)

// The editor's layer for an expression, and one of its style functions
// applied to a row
const style = (
  expression: unknown,
  element: 'bracket' | 'collectionInner' | 'collection',
  path: (string | number)[],
  collapsed = false
) => {
  const { styles } = layerTheme(undefined, contextFor(expression)) as Theme
  const styleFunction = styles[element] as (nodeData: NodeData) => unknown
  return styleFunction({ path, value: valueAt(expression, path), collapsed } as NodeData)
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
})
