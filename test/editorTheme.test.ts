import { FigTree } from 'fig-tree-evaluator'
import { toPathString, type NodeData, type Theme } from 'json-edit-react'
import { describe, expect, it } from 'vitest'
import { attachIssues, rollUpIssues } from '../src/attachIssues'
import { classify } from '../src/classify'
import {
  defaultEditorTheme,
  layerTheme,
  mergeEditorTheme,
  type FilledInMarker,
  type ThemeContext,
} from '../src/editorTheme'
import { valueAt } from '../src/paths'
import { type RowRun, type RunMarks } from '../src/runMarks'

const figTree = new FigTree({
  fragments: {
    greet: {
      expression: { $plus: ['Hello ', '$params.name'] },
      parameters: { name: { type: 'string' } },
    },
  },
})
const registry = { operators: figTree.getOperators(), fragments: figTree.getFragments() }

const contextFor = (
  expression: unknown,
  filledIn: FilledInMarker | null = null,
  run: RunMarks | null = null
): ThemeContext => {
  const classification = classify(expression, registry)
  const { issues } = figTree.validate(expression)
  return {
    classification,
    issues: attachIssues(issues, classification),
    rollUp: rollUpIssues(issues, classification),
    editorTheme: defaultEditorTheme,
    indent: 2,
    filledIn,
    run,
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
    | 'iconCollection'
    | 'itemCount',
  path: (string | number)[],
  collapsed = false,
  filledIn: FilledInMarker | null = null,
  run: RunMarks | null = null
) => {
  const { styles } = layerTheme(undefined, contextFor(expression, filledIn, run)) as Theme
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

    it("draw a border around a node, pulled back as far as other collections' rows", () => {
      expect(style(node, 'collectionInner', ['total'])).toMatchObject({
        borderColor: defaultEditorTheme.nodeBorder,
        marginLeft: '-1em',
      })
      expect(style(node, 'collectionInner', [])).toEqual({ marginLeft: '-1em' })
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
        expect(style({ total: node }, 'collectionInner', ['total'], true)).toEqual({
          marginLeft: '-1em',
        })
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
      // The row's margin cancels the pull on its rows
      const call = { fragment: 'greet', parameters: { name: 'Ada' } }
      expect(style(call, 'collection', ['parameters'])).toEqual({ marginLeft: '1em' })
      expect(style(call, 'collectionInner', ['parameters'])).toEqual({ marginLeft: '-1em' })
      expect(style({ ...call, parameters: '$data.form' }, 'collection', ['parameters'])).toBeNull()
      expect(style({ $if: { condition: true, then: 1 } }, 'collection', ['$if'])).toEqual({
        marginLeft: '1em',
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
      // A malformed block takes only its error's tint
      for (const malformed of [
        { $plus: [1], vars: [1] },
        { $plus: [1], vars: 'x' },
      ]) {
        expect(style(malformed, 'property', ['vars'])).toBeNull()
        expect(style(malformed, 'collection', ['vars'])).not.toHaveProperty('borderLeft')
      }
    })
  })

  describe('issues', () => {
    const tint: unknown = expect.objectContaining({
      background: `color-mix(in srgb, ${defaultEditorTheme.error} 9%, transparent)`,
      boxShadow: `inset 3px 0 0 ${defaultEditorTheme.error}`,
    })

    it('tints a value row with an error', () => {
      const expression = { operator: 'if', condition: true, thn: 1, else: 2 }
      expect(style(expression, 'valueRow', ['thn'])).toEqual(tint)
      expect(style(expression, 'valueRow', ['else'])).toBeNull()
    })

    it("tints a plain collection's whole block with an error, its chevron included", () => {
      const expression = { operator: 'round', value: [1, 2] }
      const block = style(expression, 'collection', ['value'])
      expect(block).toEqual(tint)
      // Out past the chevron, as a vars block's rule is, then padded back
      expect(block).toEqual(
        expect.objectContaining({ marginLeft: 'calc(1em - 1.35em)', paddingLeft: '1.35em' })
      )
      expect(style(expression, 'headerRow', ['value'])).toBeNull()
      expect(style({ $plus: [1, true] }, 'collection', ['$plus'])).toEqual(tint)
    })

    it('tints a row with only a warning fainter, without the stripe', () => {
      const warning = style({ style: { $colour: 'red' } }, 'valueRow', ['style', '$colour'])
      expect(warning).toEqual(
        expect.objectContaining({
          background: `color-mix(in srgb, ${defaultEditorTheme.warning} 10%, transparent)`,
        })
      )
      expect(warning).not.toHaveProperty('boxShadow')
    })

    it("doesn't tint a node, whose header carries its flag", () => {
      const expression = { age: { operator: 'if', condition: true, thn: 1 } }
      expect(style(expression, 'collection', ['age'])).toBeNull()
    })

    it("colours a collapsed row's summary by the most severe issue beneath it", () => {
      const both = { a: { operator: 'round', value: [1] }, b: { $colour: 'red' } }
      expect(style(both, 'itemCount', [], true)).toEqual({
        color: defaultEditorTheme.error,
        fontWeight: 600,
      })
      expect(style(both, 'itemCount', ['b'], true)).toEqual({
        color: `color-mix(in srgb, ${defaultEditorTheme.warning}, black 35%)`,
        fontWeight: 600,
      })
      expect(style({ a: [1] }, 'itemCount', ['a'], true)).toBeNull()
    })

    it("leaves an open row's summary alone", () => {
      expect(style({ a: { operator: 'round', value: [1] } }, 'itemCount', ['a'])).toBeNull()
    })
  })

  describe('the filled-in marker', () => {
    const marked = (fading: boolean, ...rows: (string | number)[][]): FilledInMarker => ({
      rows: rows.map(toPathString),
      fading,
    })
    const highlight = `color-mix(in srgb, ${defaultEditorTheme.filledIn} 40%, transparent)`
    const fade = 'background-color 1000ms ease-out'
    const expression = { operator: 'if', condition: true, then: 'Yes', thn: 1 }

    it("highlights a value row, in its tint's shape, and leaves the others", () => {
      const markers = marked(false, ['then'])
      expect(style(expression, 'valueRow', ['then'], false, markers)).toEqual({
        background: highlight,
        marginLeft: '-0.4em',
        paddingLeft: '0.4em',
        borderRadius: '0.25em',
      })
      expect(style(expression, 'valueRow', ['condition'], false, markers)).toBeNull()
    })

    it("fades back to the row's own style", () => {
      expect(style(expression, 'valueRow', ['then'], false, marked(true, ['then']))).toEqual({
        marginLeft: '-0.4em',
        paddingLeft: '0.4em',
        borderRadius: '0.25em',
        transition: fade,
      })
      // Over a tint, which it covers, then fades to
      const tinted = style(expression, 'valueRow', ['thn'], false, marked(false, ['thn']))
      expect(tinted).toEqual(expect.objectContaining({ background: highlight }))
      expect(style(expression, 'valueRow', ['thn'], false, marked(true, ['thn']))).toEqual(
        expect.objectContaining({
          background: `color-mix(in srgb, ${defaultEditorTheme.error} 9%, transparent)`,
          transition: fade,
        })
      )
    })

    it("highlights a plain collection's whole block, without a tint's padding below", () => {
      const plus = { operator: 'plus', values: [1, 2, 3] }
      expect(style(plus, 'collection', ['values'], false, marked(false, ['values']))).toEqual({
        background: highlight,
        marginLeft: 'calc(1em - 1.35em)',
        paddingLeft: '1.35em',
        borderRadius: '0.25em',
      })
    })

    it("doesn't highlight a node", () => {
      const nested = { x: { operator: 'plus', values: [1] } }
      expect(style(nested, 'collection', ['x'], false, marked(false, ['x']))).toBeNull()
    })
  })

  describe('how a run went', () => {
    // Marks with each row's status, as an evaluation leaves them
    const ran = (...rows: [(string | number)[], RowRun['status']][]): RunMarks =>
      new Map(
        rows.map(([path, status]) => [
          toPathString(path),
          { path, status, runs: [], perElement: false, nulls: [] },
        ])
      )
    // The border's width and padding, which a run leaves as they are
    const unmoved = { borderWidth: '2px', padding: '0.5em' }

    it('colours the border of a node by how it ran, and leaves the others', () => {
      const expression = {
        a: { operator: 'plus', values: [1] },
        b: { operator: 'plus', values: [2] },
      }
      const marks = ran([['a'], 'failed'])
      expect(style(expression, 'collectionInner', ['a'], false, null, marks)).toMatchObject({
        borderStyle: 'solid',
        borderColor: defaultEditorTheme.runFailed,
        ...unmoved,
      })
      expect(style(expression, 'collectionInner', ['b'], false, null, marks)).toMatchObject({
        borderColor: defaultEditorTheme.nodeBorder,
        ...unmoved,
      })
    })

    it("keeps a shorthand node's border dashed", () => {
      const expression = { a: { $plus: [1, 2] } }
      expect(
        style(expression, 'collectionInner', ['a'], false, null, ran([['a'], 'skipped']))
      ).toMatchObject({
        borderStyle: 'dashed',
        borderColor: defaultEditorTheme.runSkipped,
        ...unmoved,
      })
    })

    it("colours a collapsed node's summary by how it ran, over its issues", () => {
      // An unread var's warning, which colours the summary without a run
      const expression = { a: { operator: 'plus', values: [1], vars: { v: 1 } }, b: [1] }
      const marks = ran([['a'], 'fallback'], [['b'], 'value'])
      expect(style(expression, 'itemCount', ['a'], true, null, marks)).toEqual({
        color: defaultEditorTheme.runFallback,
        fontWeight: 600,
      })
      expect(style(expression, 'itemCount', ['a'], true)).toMatchObject({ fontWeight: 600 })
      expect(style(expression, 'itemCount', ['a'], true)).not.toMatchObject({
        color: defaultEditorTheme.runFallback,
      })
      expect(style(expression, 'itemCount', ['a'], false, null, marks)).toBeNull()
      // Plain data isn't marked
      expect(style(expression, 'itemCount', ['b'], true, null, marks)).toBeNull()
    })
  })
})
