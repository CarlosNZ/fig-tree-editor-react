import { type FragmentInfo, type Issue, type OperatorInfo } from 'fig-tree-evaluator'
import { rowAt, type Classification } from './classify'
import { renameKey, updateAt, valueAt, type Path } from './paths'
import { strings } from './strings'
import { switchFragment } from './switchFragment'
import { switchOperator } from './switchOperator'

// The quick fixes the messages area offers on an issue (design, topic 7, "The
// messages area"). Each `fix` takes the whole expression and returns it fixed,
// acting at the issue's own path (the key `thn`, not the row the line marks),
// and leaves it as it is where its target has gone, since an edit committed
// just before it may have changed the tree.
//
// - Rename, where fig-tree suggests a name for an unknown key (F3), in place,
//   its value kept. Not where the suggested key is there already, which
//   renaming would overwrite.
// - Remove, on any unknown key, and on a key that doesn't belong on its node
//   (`malformed-node` at the key: a stray key beside a shorthand's `$name`, a
//   second `$name`, `useCache` on a fragment call, `parameters` on an operator
//   node). Not on a node's own `$name`, which holds its content.
// - Change to, where fig-tree suggests a registered operator or fragment for
//   an unknown one: the picker's switch on a broken node, which cleans it.
// - Rename a `$` key that names nothing, where fig-tree suggests one, which
//   makes the object a shorthand node for the fill-in step to complete.

export interface QuickFix {
  label: string
  fix: (expression: unknown) => unknown
}

export interface QuickFixContext {
  classification: Classification
  operators: readonly OperatorInfo[]
  fragments: readonly FragmentInfo[]
}

export const getQuickFixes = (
  { code, path, suggestion }: Issue,
  expression: unknown,
  { classification, operators, fragments }: QuickFixContext
): QuickFix[] => {
  const key = path.at(-1)
  const parentPath = path.slice(0, -1)
  const parent = asObject(valueAt(expression, parentPath))
  const hasKey = (name: string) => parent !== null && name in parent

  switch (code) {
    case 'unknown-node-key': {
      if (typeof key !== 'string') return []
      const rename =
        suggestion !== undefined && !hasKey(suggestion)
          ? [renameFix(parentPath, key, suggestion)]
          : []
      return [...rename, removeFix(parentPath, key)]
    }
    case 'unrecognized-identifier':
      return typeof key === 'string' && suggestion !== undefined && !hasKey(suggestion)
        ? [renameFix(parentPath, key, suggestion)]
        : []
    case 'malformed-node': {
      if (typeof key !== 'string') return []
      const node = rowAt(classification, parentPath)?.kind
      const ownName = node !== undefined && 'name' in node && key === `$${node.name}`
      return ownName ? [] : [removeFix(parentPath, key)]
    }
    case 'unknown-operator':
      return suggestion !== undefined && operators.some(({ name }) => name === suggestion)
        ? [changeFix(path, suggestion, (node) => switchOperator(node, suggestion, null, operators))]
        : []
    case 'unknown-fragment':
      return suggestion !== undefined && fragments.some(({ name }) => name === suggestion)
        ? [changeFix(path, suggestion, (node) => switchFragment(node, suggestion, null, fragments))]
        : []
    default:
      return []
  }
}

const renameFix = (objectPath: Path, from: string, to: string): QuickFix => ({
  label: strings.FT_FIX_RENAME(to),
  fix: (expression) =>
    updateAt(expression, objectPath, (object) => {
      const fields = asObject(object)
      return fields && from in fields && !(to in fields) ? renameKey(fields, from, to) : object
    }),
})

const removeFix = (objectPath: Path, key: string): QuickFix => ({
  label: strings.FT_FIX_REMOVE,
  fix: (expression) =>
    updateAt(expression, objectPath, (object) => {
      const fields = asObject(object)
      if (!fields || !(key in fields)) return object
      const { [key]: _, ...rest } = fields
      return rest
    }),
})

const changeFix = (
  nodePath: Path,
  name: string,
  change: (node: Record<string, unknown>) => Record<string, unknown>
): QuickFix => ({
  label: strings.FT_FIX_CHANGE(name),
  fix: (expression) =>
    updateAt(expression, nodePath, (node) => {
      const fields = asObject(node)
      return fields ? change(fields) : node
    }),
})

const asObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
