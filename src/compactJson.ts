// A value as compact JSON, as `JSON.stringify` writes it with no spacing,
// cut at `limit` characters with "…". It stops writing at the limit, so a
// large value, such as a whole API response, costs no more than a short one,
// and a value that refers to itself ends there too. A value JSON has no form
// for, at the top, is written as JavaScript would print it.
export const compactJson = (value: unknown, limit: number): string => {
  let written = ''
  const full = () => written.length > limit
  const write = (text: string) => {
    if (!full()) written += text
  }

  const visit = (part: unknown): void => {
    if (full()) return
    if (part === null || typeof part === 'boolean') return write(String(part))
    if (typeof part === 'number') return write(JSON.stringify(part))
    if (typeof part === 'bigint') return write(String(part))
    // Only as much of a long string as could show
    if (typeof part === 'string')
      return write(JSON.stringify(part.length > limit ? part.slice(0, limit) : part))
    if (Array.isArray(part)) {
      write('[')
      for (let index = 0; index < part.length && !full(); index++) {
        if (index > 0) write(',')
        if (absent(part[index])) write('null')
        else visit(part[index])
      }
      return write(']')
    }
    if (typeof part === 'object') {
      const json = (part as { toJSON?: () => unknown }).toJSON
      if (typeof json === 'function') return visit(json.call(part))
      write('{')
      let first = true
      for (const key in part) {
        if (full()) break
        const entry = (part as Record<string, unknown>)[key]
        if (!Object.prototype.hasOwnProperty.call(part, key) || absent(entry)) continue
        if (!first) write(',')
        first = false
        write(`${JSON.stringify(key)}:`)
        visit(entry)
      }
      return write('}')
    }
    write('null')
  }

  if (absent(value)) return String(value)
  visit(value)
  return full() ? `${written.slice(0, limit)}…` : written
}

// What JSON leaves out of an object, and writes as null in an array
const absent = (value: unknown) =>
  value === undefined || typeof value === 'function' || typeof value === 'symbol'
