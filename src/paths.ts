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
