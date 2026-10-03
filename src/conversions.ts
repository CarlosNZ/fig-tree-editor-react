import { type FigTree } from 'fig-tree-evaluator'
import { classifyObject, toCanonical, toGet, toShorthand } from 'fig-tree-evaluator/format'
import { strings } from './strings'

// How the editor spells every reference it writes (design, topic 8, "Defaults
// and what the pickers offer"), in `./format`'s own terms: `$data` or `$d`
export type ReferenceNames = 'canonical' | 'alias'

export interface Conversion {
  label: string
  result: unknown
  toReference?: boolean // the node itself becomes a reference
}

type Form = 'full' | 'named' | 'positional' | 'reference'

// A node's conversion button (design, topic 1, "Conversions"): one button
// steps through the forms, full to named shorthand, named to positional, and
// positional back to full. A node with no positional form (a fragment call, a
// payload with a gap) goes from named back to full. Every conversion takes
// the whole subtree, and spells its references by `referenceNames`.
//
// A `get` that can be a reference becomes one, as `toShorthand` has it by
// default, and a button that turns the node itself into a reference says so,
// and shows as readily as the pencil does, being the way to the shortest form.
// There is no button where the conversion fails, since `./format` refuses a
// node beneath, or where it gives the same form, as on a fragment call whose
// arguments are a reference.
export const nodeConversion = (
  node: unknown,
  figTree: FigTree,
  referenceNames: ReferenceNames
): Conversion | null => {
  const formOf = formReader(figTree)
  const shorthand = (args: 'named' | 'positional') =>
    toShorthand(node, figTree, { arguments: args, referenceNames })
  const full = () => ({
    label: strings.FT_TO_FULL,
    result: toCanonical(node, figTree, { referenceNames }),
  })
  try {
    switch (formOf(node)) {
      case 'full': {
        const result = shorthand('named')
        const form = formOf(result)
        if (form === 'reference')
          return { label: strings.FT_TO_REFERENCE, result, toReference: true }
        return form === 'full' ? null : { label: strings.FT_TO_SHORTHAND, result }
      }
      case 'named': {
        const result = shorthand('positional')
        const form = formOf(result)
        if (form === 'reference')
          return { label: strings.FT_TO_REFERENCE, result, toReference: true }
        return form === 'positional' ? { label: strings.FT_TO_POSITIONAL, result } : full()
      }
      case 'positional':
        return full()
      default:
        return null
    }
  } catch {
    return null
  }
}

// A reference's full `get` node, for its "To get node" button, or null where
// it has none: `$index`, and a name an `as` gives, which `toGet` can't see
export const getNodeFor = (reference: string, referenceNames: ReferenceNames) =>
  toGet(reference, { referenceNames })

// A value's form, as a conversion leaves it. `toShorthand` returns a string
// only for a `get` it has made a reference.
const formReader = (figTree: FigTree) => {
  const names = new Set<string>(['literal'])
  for (const { name, alias } of figTree.getOperators()) {
    names.add(name)
    if (alias !== undefined) names.add(alias)
  }
  for (const { name } of figTree.getFragments()) names.add(name)
  const recognizes = (name: string) => names.has(name)

  return (value: unknown): Form | undefined => {
    if (typeof value === 'string') return 'reference'
    if (!isObject(value)) return undefined
    const classified = classifyObject(value, recognizes)
    if (classified.kind === 'operator' || classified.kind === 'fragment') return 'full'
    if (classified.kind !== 'shorthand') return undefined
    const payload = value[classified.key]
    return isObject(payload) && classifyObject(payload, recognizes).kind === 'plain'
      ? 'named'
      : 'positional'
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
