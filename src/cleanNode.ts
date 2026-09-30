// A node without the keys its operator or fragment doesn't declare (design,
// topic 2, "The fill-in step"). Only the editor's own structural actions
// clean (switching operator, fragment or node type, and creating a node),
// since the editor only removes what it made obsolete. It works on the node's
// own keys, and a fragment call's static arguments, never beneath them:
// everything there is already complete. The fill-in step completes and
// orders what it returns.
//
// `//` and the modifiers stay. A fragment call has no `useCache`, and a static
// `parameters` map that cleaning leaves empty goes, so a call to a fragment
// with no parameters reads `{ fragment: 'today' }`.

// Only the parameters' names are read
type Parameters = Record<string, unknown>
export type Declaration =
  | { kind: 'operator'; operator: { parameters: Parameters } }
  | { kind: 'fragment'; fragment: { parameters: Parameters } }

const OPERATOR_KEYS = ['//', 'operator', 'fallback', 'useCache', 'vars']
const FRAGMENT_KEYS = ['//', 'fragment', 'parameters', 'fallback', 'vars']

export const cleanNode = (node: Record<string, unknown>, declaration: Declaration) => {
  if (declaration.kind === 'operator') {
    const { parameters } = declaration.operator
    return pick(node, (key) => OPERATOR_KEYS.includes(key) || key in parameters)
  }
  const { parameters } = declaration.fragment
  const cleaned = pick(node, (key) => FRAGMENT_KEYS.includes(key))
  // Dynamic arguments are checked only at runtime
  const args = cleaned.parameters
  if (!isObject(args)) return cleaned
  const cleanedArgs = pick(args, (key) => key === '//' || key in parameters)
  if (cleanedArgs === args) return cleaned
  if (Object.keys(cleanedArgs).length > 0) return { ...cleaned, parameters: cleanedArgs }
  const { parameters: _emptied, ...rest } = cleaned
  return rest
}

// The same object where nothing is removed
const pick = (node: Record<string, unknown>, keep: (key: string) => boolean) =>
  Object.keys(node).every(keep)
    ? node
    : Object.fromEntries(Object.entries(node).filter(([key]) => keep(key)))

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
