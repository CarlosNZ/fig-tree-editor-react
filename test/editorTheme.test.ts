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

const figTree = new FigTree()
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
  element: 'bracket' | 'collectionInner',
  path: (string | number)[],
  collapsed = false
) => {
  const { styles } = layerTheme(undefined, contextFor(expression)) as Theme
  const styleFunction = styles[element] as (nodeData: NodeData) => unknown
  return styleFunction({ path, collapsed } as NodeData)
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
})
