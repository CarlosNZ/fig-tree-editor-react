import { FigTree, coreOperators, defineOperator, type OperatorCategory } from 'fig-tree-evaluator'
import { categoryHints as coreCategoryHints } from 'fig-tree-evaluator/editor-hints'
import { describe, expect, it } from 'vitest'
import {
  buildDisplayData,
  darkShade,
  lightShade,
  type CategoryHintsProp,
  type OperatorHintsProp,
} from '../src/displayData'

const hostOperator = (
  name: string,
  category: OperatorCategory,
  metadata?: Record<string, unknown>
) =>
  defineOperator({
    name,
    category,
    description: 'A host operator',
    metadata,
    parameters: { value: { type: 'any' }, other: { type: 'any' } },
    evaluate: ({ value }) => value,
  })

const displayData = (
  options: ConstructorParameters<typeof FigTree>[0] = {},
  hints: { operatorHints?: OperatorHintsProp; categoryHints?: CategoryHintsProp } = {}
) => {
  const figTree = new FigTree(options)
  return buildDisplayData({
    operators: figTree.getOperators(),
    fragments: figTree.getFragments(),
    ...hints,
  })
}

describe('display data', () => {
  describe('operators', () => {
    it('shows a core operator by its editor hints', () => {
      expect(displayData().operators.plus).toEqual({
        displayName: 'Plus (+)',
        description: expect.stringMatching(/^Add numbers/) as string,
        docUrl: 'https://github.com/CarlosNZ/fig-tree-evaluator',
        backgroundColor: '#d7edd4',
        textColor: '#193e1e',
        seeds: { values: [1, 2, 3] },
      })
    })

    it('includes `literal`, which fig-tree does not register', () => {
      expect(displayData().operators.literal?.displayName).toBe('Literal')
    })

    it("reads a host operator's metadata as its hints", () => {
      const operator = hostOperator('shout', 'string', {
        displayName: 'Shout',
        description: 'A host operator',
        docUrl: 'https://example.com/shout',
        backgroundColor: '#ffeecc',
        textColor: '#332200',
        seeds: { value: 'hello' },
      })
      expect(displayData({ operators: [coreOperators, operator] }).operators.shout).toEqual({
        displayName: 'Shout',
        description: 'A host operator',
        docUrl: 'https://example.com/shout',
        backgroundColor: '#ffeecc',
        textColor: '#332200',
        seeds: { value: 'hello' },
      })
    })

    it('ignores metadata fields of the wrong type', () => {
      const operator = hostOperator('shout', 'string', { displayName: 42, seeds: ['hello'] })
      const { displayName, seeds } = displayData({ operators: [operator] }).operators.shout
      expect(displayName).toBe('shout')
      expect(seeds).toEqual({})
    })

    it('shows a host operator with no hints by its name, in shades of its category', () => {
      const operator = hostOperator('shout', 'string')
      const { string } = coreCategoryHints
      expect(displayData({ operators: [operator] }).operators.shout).toEqual({
        displayName: 'shout',
        description: 'A host operator',
        docUrl: undefined,
        backgroundColor: lightShade(string.backgroundColor),
        textColor: darkShade(string.backgroundColor),
        seeds: {},
      })
    })

    it("derives the shades from the host's category colour", () => {
      const operator = hostOperator('shout', 'string')
      const { operators } = displayData(
        { operators: [operator] },
        { categoryHints: { string: { backgroundColor: 'tomato' } } }
      )
      expect(operators.shout?.backgroundColor).toBe(lightShade('tomato'))
    })

    it("layers the host's hints over the rest, seeds per parameter", () => {
      const operator = hostOperator('shout', 'string', {
        displayName: 'Shout',
        seeds: { value: 'hello', other: 'world' },
      })
      const { operators } = displayData(
        { operators: [coreOperators, operator] },
        {
          operatorHints: {
            plus: { displayName: 'Add', seeds: { expect: 'number' } },
            shout: { seeds: { other: 'there' } },
          },
        }
      )
      expect(operators.plus?.displayName).toBe('Add')
      expect(operators.plus?.backgroundColor).toBe('#d7edd4')
      expect(operators.plus?.seeds).toEqual({ values: [1, 2, 3], expect: 'number' })
      expect(operators.shout?.displayName).toBe('Shout')
      expect(operators.shout?.seeds).toEqual({ value: 'hello', other: 'there' })
    })

    it('keeps the layers beneath a hint the host sets to undefined', () => {
      const { operators } = displayData({}, { operatorHints: { plus: { displayName: undefined } } })
      expect(operators.plus?.displayName).toBe('Plus (+)')
    })

    it('ignores hints for an operator that is not registered', () => {
      const { operators } = displayData({}, { operatorHints: { shout: { displayName: 'Shout' } } })
      expect(operators.shout).toBeUndefined()
    })
  })

  describe('categories', () => {
    it("lists every category in editor-hints' order", () => {
      expect(displayData().categories.map(({ category }) => category)).toEqual([
        'logic',
        'comparison',
        'math',
        'string',
        'array',
        'data',
        'io',
        'other',
      ])
    })

    it("relabels and reorders by the host's hints", () => {
      const { categories } = displayData(
        {},
        { categoryHints: { other: { displayName: 'Ours', order: -1 } } }
      )
      expect(categories[0]).toEqual({
        ...coreCategoryHints.other,
        category: 'other',
        displayName: 'Ours',
        order: -1,
      })
    })
  })

  describe('fragments', () => {
    it("reads each fragment's hints from its metadata, every field optional, and its description", () => {
      const { fragments } = displayData({
        fragments: {
          greet: {
            expression: { $plus: ['Hello ', '$params.name'] },
            parameters: { name: { type: 'string' } },
            description: 'Says hello',
            metadata: { displayName: 'Greeting', seeds: { name: 'World' } },
          },
          plain: { expression: 1 },
        },
      })
      expect(fragments).toEqual({
        greet: { displayName: 'Greeting', description: 'Says hello', seeds: { name: 'World' } },
        plain: { seeds: {} },
      })
    })
  })

  describe("a host operator's derived colours", () => {
    // The sRGB mixes that `lightShade` and `darkShade` ask of the browser
    const mix = (css: string): number[] => {
      const match = /^color-mix\(in srgb, (#\w{6})(?: (\d+)%)?, (white|black)(?: (\d+)%)?\)$/.exec(
        css
      )
      if (!match) throw new Error(`Not a colour mix: ${css}`)
      const [, hex, first, other, second] = match
      const colour = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      const share = first ? Number(first) / 100 : 1 - Number(second) / 100
      const base = other === 'white' ? 255 : 0
      return colour.map((channel) => channel * share + base * (1 - share))
    }
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((channel) => {
        const c = channel / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: number[], b: number[]) => {
      const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (lighter + 0.05) / (darker + 0.05)
    }

    it.each(Object.entries(coreCategoryHints))(
      'reach 4.5:1 in the %s category',
      (_, { backgroundColor }) => {
        const ratio = contrast(mix(lightShade(backgroundColor)), mix(darkShade(backgroundColor)))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }
    )
  })
})
