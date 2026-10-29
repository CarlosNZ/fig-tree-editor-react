import { FigTree, coreOperators, defineOperator, type OperatorCategory } from 'fig-tree-evaluator'
import {
  categoryListings as coreCategoryListings,
  fragmentColors,
} from 'fig-tree-evaluator/catalog'
import { describe, expect, it } from 'vitest'
import {
  buildDisplayData,
  darkShade,
  lightShade,
  type CategoryListingsProp,
  type OperatorListingsProp,
} from '../src/displayData'

const hostOperator = (
  name: string,
  category: OperatorCategory,
  metadata?: Record<string, unknown>
) =>
  defineOperator({
    name,
    category,
    metadata,
    parameters: { value: { type: 'any' }, other: { type: 'any' } },
    evaluate: ({ value }) => value,
  })

const displayData = (
  options: ConstructorParameters<typeof FigTree>[0] = {},
  listings: {
    operatorListings?: OperatorListingsProp
    categoryListings?: CategoryListingsProp
  } = {}
) => {
  const figTree = new FigTree(options)
  return buildDisplayData({
    operators: figTree.getOperators(),
    fragments: figTree.getFragments(),
    ...listings,
  })
}

describe('display data', () => {
  describe('operators', () => {
    it('shows a core operator by its catalog listing', () => {
      expect(displayData().operators.plus).toEqual({
        displayName: 'Plus (+)',
        description: expect.stringMatching(/^Add numbers/) as string,
        parameterDescriptions: {
          values: expect.any(String) as string,
          expect: expect.any(String) as string,
          nullValueDefault: expect.any(String) as string,
        },
        docUrl: 'https://github.com/CarlosNZ/fig-tree-evaluator',
        colors: { background: '#d7edd4', text: '#193e1e' },
        seeds: expect.objectContaining({ values: [1, 2, 3] }) as Record<string, unknown>,
      })
    })

    it('includes `literal`, which fig-tree does not register, as the catalog lists it', () => {
      const { literal } = displayData().operators
      expect(literal?.displayName).toBe('Literal')
      expect(literal?.description).toMatch(/nothing inside it is evaluated/)
    })

    it("shows a host operator by the host's listing", () => {
      const operator = hostOperator('shout', 'string')
      const { operators } = displayData(
        { operators: [coreOperators, operator] },
        {
          operatorListings: {
            shout: {
              displayName: 'Shout',
              description: 'A host operator',
              parameterDescriptions: { value: 'What to shout' },
              docUrl: 'https://example.com/shout',
              colors: { background: '#ffeecc', text: '#332200' },
              seeds: { value: 'hello' },
            },
          },
        }
      )
      expect(operators.shout).toEqual({
        displayName: 'Shout',
        description: 'A host operator',
        parameterDescriptions: { value: 'What to shout' },
        docUrl: 'https://example.com/shout',
        colors: { background: '#ffeecc', text: '#332200' },
        seeds: { value: 'hello', other: 'Replace me' },
      })
    })

    it("never reads a host operator's metadata as its listing", () => {
      const operator = hostOperator('shout', 'string', {
        displayName: 'Shout',
        seeds: { value: 'hello' },
      })
      const { displayName, seeds } = displayData({ operators: [operator] }).operators.shout
      expect(displayName).toBeUndefined()
      expect(seeds).toEqual({ value: 'Replace me', other: 'Replace me' })
    })

    it('ignores listing fields of the wrong type', () => {
      const operator = hostOperator('shout', 'string')
      const { displayName, parameterDescriptions } = displayData(
        { operators: [operator] },
        {
          operatorListings: {
            shout: { displayName: 42, parameterDescriptions: { value: 'What to shout' } },
          } as unknown as OperatorListingsProp,
        }
      ).operators.shout
      expect(displayName).toBeUndefined()
      expect(parameterDescriptions).toEqual({ value: 'What to shout' })
    })

    it('gives a host operator with no listing no display name, and shades of its category', () => {
      const operator = hostOperator('shout', 'string')
      const { string } = coreCategoryListings
      expect(displayData({ operators: [operator] }).operators.shout).toEqual({
        description: undefined,
        parameterDescriptions: {},
        docUrl: undefined,
        colors: {
          background: lightShade(string.colors.background),
          text: darkShade(string.colors.background),
        },
        seeds: { value: 'Replace me', other: 'Replace me' },
      })
    })

    it("takes a host operator's colours only as a pair", () => {
      const operator = hostOperator('shout', 'string')
      const { operators } = displayData(
        { operators: [operator] },
        {
          operatorListings: {
            shout: { colors: { text: '#332200' } },
          } as unknown as OperatorListingsProp,
        }
      )
      expect(operators.shout?.colors).toEqual({
        background: lightShade(coreCategoryListings.string.colors.background),
        text: darkShade(coreCategoryListings.string.colors.background),
      })
    })

    it("derives the shades from the host's category colour", () => {
      const operator = hostOperator('shout', 'string')
      const { operators } = displayData(
        { operators: [operator] },
        { categoryListings: { string: { colors: { background: 'tomato', text: 'white' } } } }
      )
      expect(operators.shout?.colors.background).toBe(lightShade('tomato'))
    })

    it("layers the host's listings over the rest, seeds and parameter text per parameter", () => {
      const operator = hostOperator('shout', 'string')
      const { operators } = displayData(
        { operators: [coreOperators, operator] },
        {
          operatorListings: {
            plus: { displayName: 'Add', seeds: { expect: 'number' } },
            shout: {
              displayName: 'Shout',
              description: 'Says it loudly',
              seeds: { value: 'hello', other: 'there' },
              parameterDescriptions: { value: 'What to shout', other: 'Even more' },
            },
          },
        }
      )
      expect(operators.plus?.displayName).toBe('Add')
      expect(operators.plus?.colors.background).toBe('#d7edd4')
      expect(operators.plus?.seeds).toMatchObject({ values: [1, 2, 3], expect: 'number' })
      expect(operators.shout?.displayName).toBe('Shout')
      expect(operators.shout?.description).toBe('Says it loudly')
      expect(operators.shout?.seeds).toEqual({ value: 'hello', other: 'there' })
      expect(operators.shout?.parameterDescriptions).toEqual({
        value: 'What to shout',
        other: 'Even more',
      })
    })

    it('keeps the layers beneath a field the host sets to undefined', () => {
      const { operators } = displayData(
        {},
        { operatorListings: { plus: { displayName: undefined } } }
      )
      expect(operators.plus?.displayName).toBe('Plus (+)')
    })

    it('ignores a listing for an operator that is not registered', () => {
      const { operators } = displayData(
        {},
        { operatorListings: { shout: { displayName: 'Shout' } } }
      )
      expect(operators.shout).toBeUndefined()
    })
  })

  describe('categories', () => {
    it("lists every category in the catalog's order", () => {
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

    it("relabels and reorders by the host's listings", () => {
      const { categories } = displayData(
        {},
        { categoryListings: { other: { displayName: 'Ours', order: -1 } } }
      )
      expect(categories[0]).toEqual({
        ...coreCategoryListings.other,
        category: 'other',
        displayName: 'Ours',
        order: -1,
      })
    })
  })

  describe('fragments', () => {
    it("reads each fragment's listing, every field optional, with `fragmentColors` where it gives none", () => {
      const { fragments } = displayData({
        fragments: {
          greet: {
            expression: { $plus: ['Hello ', '$params.name'] },
            parameters: { name: { type: 'string' } },
            listing: {
              displayName: 'Greeting',
              description: 'Says hello',
              parameterDescriptions: { name: 'Who to greet' },
              colors: { background: '#e8e0f8', text: '#4b2a8a' },
              seeds: { name: 'World' },
            },
          },
          plain: { expression: 1 },
        },
      })
      expect(fragments).toEqual({
        greet: {
          displayName: 'Greeting',
          description: 'Says hello',
          parameterDescriptions: { name: 'Who to greet' },
          docUrl: undefined,
          colors: { background: '#e8e0f8', text: '#4b2a8a' },
          seeds: { name: 'World' },
        },
        plain: {
          description: undefined,
          parameterDescriptions: {},
          docUrl: undefined,
          colors: fragmentColors,
          seeds: {},
        },
      })
    })

    it("layers the host's listings over a fragment's own", () => {
      const { fragments } = displayData(
        { fragments: { plain: { expression: 1 } } },
        { operatorListings: { plain: { displayName: 'Plain' } } }
      )
      expect(fragments.plain?.displayName).toBe('Plain')
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

    it.each(Object.entries(coreCategoryListings))(
      'reach 4.5:1 in the %s category',
      (_, { colors: { background } }) => {
        const ratio = contrast(mix(lightShade(background)), mix(darkShade(background)))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }
    )
  })
})
