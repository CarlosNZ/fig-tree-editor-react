// A node path for display: keys joined by dots, array indices in brackets, and
// a key that would read ambiguously (empty, or holding a dot or bracket)
// quoted in brackets. `[]`, the root, is the empty string.
export const displayPath = (path: readonly (string | number)[]) =>
  path
    .map((segment, index) => {
      if (typeof segment === 'number') return `[${segment}]`
      if (segment === '' || /[.[\]]/.test(segment)) return `[${JSON.stringify(segment)}]`
      return index === 0 ? segment : `.${segment}`
    })
    .join('')
