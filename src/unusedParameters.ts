import { type FigTree, type FragmentDefinition, type Issue } from 'fig-tree-evaluator'
import { strings } from './strings'

// A warning on each declared parameter the body never reads, at its
// declaration (fragment-editor-design.md, "Parameters"). fig-tree reports
// none, so the editor works it out from the names `getDependencies()` finds
// the body reading, in every form a read takes. A body whose reads can't be
// listed (a bare `$params`, or a computed path from it) may read any of
// them, so then none is reported.
export const UNUSED_PARAM = 'unused-param'

export const unusedParameters = (
  figTree: Pick<FigTree, 'getDependencies'>,
  { expression, parameters = {} }: FragmentDefinition
): Issue[] => {
  const { names, dynamic } = figTree.getDependencies(expression).params
  if (dynamic) return []
  return Object.keys(parameters)
    .filter((name) => !names.includes(name))
    .map((name) => ({
      severity: 'warning',
      code: UNUSED_PARAM,
      message: strings.FT_UNUSED_PARAMETER(name),
      path: ['parameters', name],
    }))
}
