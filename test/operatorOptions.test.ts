import { FigTree } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { buildDisplayData } from '../src/displayData'
import { operatorOptions, type PickerContext } from '../src/operatorOptions'
import { registry } from './fixtures'

const core = new FigTree()
const coreRegistry = { operators: core.getOperators(), fragments: core.getFragments() }

const groupsAt = (
  admits: PickerContext['admits'],
  current: PickerContext['current'] = null,
  { operators, fragments } = coreRegistry
) =>
  operatorOptions({
    operators,
    displayData: buildDisplayData({ operators, fragments }),
    admits,
    current,
  })

const labels = (groups: ReturnType<typeof groupsAt>) => groups.map(({ label }) => label)
const group = (groups: ReturnType<typeof groupsAt>, label: string) =>
  groups.find((entry) => entry.label === label)!.options

describe('operatorOptions', () => {
  it('groups the operators by category, in order, with literal last in Data & objects', () => {
    const groups = groupsAt('any')
    expect(labels(groups)).toEqual([
      'Logic & control',
      'Comparison',
      'Arithmetic & math',
      'Strings',
      'Arrays & iteration',
      'Data & objects',
      'Other',
    ])
    expect(group(groups, 'Data & objects').at(-1)).toMatchObject({
      label: 'Literal',
      value: 'literal',
    })
    expect(groups.flatMap(({ options }) => options)).toHaveLength(41)
  })

  it('labels each entry by its display name, and keeps its names as keywords', () => {
    const plus = group(groupsAt('any'), 'Arithmetic & math').find(({ value }) => value === 'plus')
    expect(plus).toMatchObject({
      label: 'Plus (+)',
      keywords: 'plus +',
      description: expect.stringMatching(/^Add numbers/) as string,
      disabled: false,
    })
  })

  it("moves the operators that can't fit to Not valid here, with the reason", () => {
    const groups = groupsAt(['number', 'null'])
    const notValid = group(groups, 'Not valid here')
    expect(notValid).toHaveLength(20)
    expect(notValid.every(({ disabled }) => disabled)).toBe(true)
    expect(labels(groups)).not.toContain('Comparison')
    expect(notValid.find(({ value }) => value === 'upper')?.description).toBe(
      'Returns a string; this position takes a number or null'
    )
    // It can return null, which the position admits
    expect(group(groups, 'Strings').map(({ value }) => value)).toContain('regex')
  })

  it('keeps the current operator in its group where it can choose it', () => {
    const strings = group(groupsAt(['number', 'null'], 'upper'), 'Strings')
    expect(strings.find(({ value }) => value === 'upper')).toMatchObject({ disabled: false })
  })

  it("puts a host's operator in its own category", () => {
    const other = group(groupsAt('any', null, registry), 'Other').map(({ value }) => value)
    expect(other).toContain('reverse')
  })
})
