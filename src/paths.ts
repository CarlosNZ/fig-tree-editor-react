// A row's position in the tree: object keys and array indexes from the root,
// which is `[]`.
export type Path = (string | number)[]

// A node path for display: keys joined by dots, array indices in brackets, and
// a key that would read ambiguously (empty, or holding a dot or bracket)
// quoted in brackets. `[]`, the root, is the empty string.
export const displayPath = (path: Readonly<Path>) =>
  path
    .map((segment, index) => {
      if (typeof segment === 'number') return `[${segment}]`
      if (segment === '' || /[.[\]]/.test(segment)) return `[${JSON.stringify(segment)}]`
      return index === 0 ? segment : `.${segment}`
    })
    .join('')

// The value at a path, or undefined where there is none
export const valueAt = (value: unknown, path: Readonly<Path>): unknown =>
  path.reduce<unknown>(
    (parent, key) =>
      typeof parent === 'object' && parent !== null
        ? (parent as Record<string | number, unknown>)[key]
        : undefined,
    value
  )

// The value with what is at `path` replaced by `update`'s result, copying the
// objects and arrays along the way. A path that isn't there leaves the value
// as it is.
export const updateAt = (
  value: unknown,
  path: Readonly<Path>,
  update: (current: unknown) => unknown
): unknown => {
  if (path.length === 0) return update(value)
  const [key, ...rest] = path
  if (typeof value !== 'object' || value === null || !(key in value)) return value
  const child = (value as Record<string | number, unknown>)[key]
  if (Array.isArray(value))
    return (value as unknown[]).map((element, index) =>
      index === key ? updateAt(child, rest, update) : element
    )
  return { ...value, [key]: updateAt(child, rest, update) }
}

// Whether `path` is `prefix` or a path beneath it
export const isWithin = (path: Readonly<Path>, prefix: Readonly<Path>) =>
  prefix.length <= path.length && prefix.every((key, index) => path[index] === key)

// An object with one key renamed, in its place among the others
export const renameKey = (object: Record<string, unknown>, from: string, to: string) =>
  Object.fromEntries(Object.entries(object).map(([key, value]) => [key === from ? to : key, value]))
