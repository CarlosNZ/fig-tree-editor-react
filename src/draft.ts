import {
  isFigTreeError,
  type FigTree,
  type FragmentDefinition,
  type Issue,
} from 'fig-tree-evaluator'
import { isWithin, type Path } from './paths'

// A fragment definition being authored, registered on an instance derived
// from the host's (fig-tree's `with()`), so the host's own is never changed
// (fragment-editor-design.md, "Evaluation" and "Validation"). It is
// registered under a temporary name, never its own, so no registered fragment
// calling it is checked against the draft's declarations.

// A name nothing registered on the instance claims: a fragment, an operator
// or an alias. Registration refuses a name another claims, which would hide
// every other issue the draft has.
export const draftName = (figTree: FigTree) => {
  const taken = new Set([
    ...figTree.getFragments().map(({ name }) => name),
    ...figTree.getOperators().flatMap(({ name, alias }) => (alias ? [name, alias] : [name])),
  ])
  let name = DRAFT_NAME
  for (let count = 2; taken.has(name); count++) name = `${DRAFT_NAME}${count}`
  return name
}

const DRAFT_NAME = 'fragmentDraft'

// The issues registration finds in the definition outside its body, at their
// paths in the definition. The body's own are left out, since `validate()`
// reports them, with its warnings, at the body's paths.
export const declarationIssues = (figTree: FigTree, definition: FragmentDefinition): Issue[] => {
  const name = draftName(figTree)
  const at: Path = ['fragments', name]
  try {
    figTree.with({ fragments: { [name]: definition } })
    return []
  } catch (thrown) {
    if (!isFigTreeError(thrown)) throw thrown
    return (thrown.issues ?? [])
      .filter(({ path }) => isWithin(path, at) && !isWithin(path, [...at, 'expression']))
      .map((issue) => ({ ...issue, path: issue.path.slice(at.length) }))
  }
}
