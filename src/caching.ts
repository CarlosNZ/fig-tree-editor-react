import { type FragmentInfo, type OperatorInfo } from 'fig-tree-evaluator'
import { type Classification, type RowKind } from './classify'
import { isWithin, type Path } from './paths'

// Where the result cache applies (design, topic 4, "Caching"), as fig-tree
// has it: an operator caches where its definition declares `cache` and the
// host hasn't turned it off with `noCache`, a fragment call where its body
// caches, and `noCache: true` on a node turns caching off for the node and
// everything inside it.

export interface CacheContext {
  classification: Classification
  operators: readonly OperatorInfo[]
  fragments: readonly FragmentInfo[]
}

type Registry = Pick<CacheContext, 'operators' | 'fragments'>

// For a node that caches, or would but for a `noCache`, whether its cache is
// in force: no `noCache` on it or above it, nor the host's on its operator.
// Undefined for any other node.
export const cacheStatus = (
  path: Path,
  kind: RowKind | undefined,
  { classification, operators, fragments }: CacheContext
): 'active' | 'disabled' | undefined => {
  if (kind?.kind === 'operator') {
    const operator = operators.find(({ name }) => name === kind.operator)
    if (operator?.cache !== true) return undefined
    if (operator.hostNoCache === true) return 'disabled'
  } else if (kind?.kind === 'fragment') {
    if (fragments.find(({ name }) => name === kind.name)?.caches !== true) return undefined
  } else return undefined
  return noCacheOver(path, classification, true) ? 'disabled' : 'active'
}

// Whether `noCache` on the node at `path` would do something, as
// `validate()`'s dead and redundant warnings judge it: no node above it has
// one, and it or something beneath it caches
export const takesNoCache = (path: Path, context: CacheContext) => {
  if (noCacheOver(path, context.classification, false)) return false
  for (const { kind, slot } of context.classification.values())
    if (slot !== undefined && isWithin(slot.path, path) && mayCache(kind, context)) return true
  return false
}

// Whether a node holding the one at `path` has `noCache`, or the node itself
// does, where `self` counts
const noCacheOver = (path: Path, classification: Classification, self: boolean) => {
  for (const { slot } of classification.values()) {
    const owner = slot?.ownerPath
    if (slot?.role !== 'modifier' || slot.parameter !== 'noCache' || owner == null) continue
    if (isWithin(path, owner) && (self || owner.length < path.length)) return true
  }
  return false
}

// A caching operator the host hasn't turned off, or a call to a fragment
// whose body caches. One the editor can't read, malformed or naming nothing
// registered, may cache, as `validate()` has it, so that a `noCache` on it
// isn't called dead.
const mayCache = (kind: RowKind | undefined, { operators, fragments }: Registry) => {
  if (kind?.kind === 'operator') {
    const operator = operators.find(({ name }) => name === kind.operator)
    if (operator === undefined || kind.malformed !== undefined) return true
    return operator.cache && operator.hostNoCache !== true
  }
  if (kind?.kind === 'fragment') {
    const fragment = fragments.find(({ name }) => name === kind.name)
    return fragment === undefined || kind.malformed !== undefined || fragment.caches
  }
  return false
}
