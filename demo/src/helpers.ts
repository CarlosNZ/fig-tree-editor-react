import { buildFigTree, defaultOptions, type DemoOptions } from './figTree'

// Every key the demo stores is prefixed, so that what the v2 playground left
// in the same origin's storage is never read as v3
const STORAGE_PREFIX = 'v3:'

export const getLocalStorage = (key: string) => {
  try {
    const value = localStorage.getItem(STORAGE_PREFIX + key)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

export const setLocalStorage = (key: string, value: unknown) => {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
}

// The saved options, if FigTree accepts them, else the defaults
export const getInitOptions = (): DemoOptions => {
  const saved = getLocalStorage('options') as DemoOptions | null
  if (!saved) return defaultOptions
  try {
    buildFigTree(saved)
    return saved
  } catch {
    return defaultOptions
  }
}

// Given an object, returns a new object with all keys removed whose values
// return false when passed into the 2nd parameter function. Can be use (for
// example) to remove keys with null or undefined values (the default)
// Eg. {one: 1, two: null, three: undefined} => {one: 1}
// Filters recursively, and any objects or arrays which end up empty have their key removed too.
type FilterFunction = (x: any) => boolean
export const filterObjectRecursive = (
  inputObj: object,
  filterFunction: FilterFunction = (x) =>
    !(x == null || x === '' || (x instanceof Object && Object.keys(x).length === 0))
) => {
  const filtered: [key: string, value: any][] = Object.entries(inputObj)
    .map(([key, value]) => {
      if (Array.isArray(value))
        return [
          key,
          value
            .map((e) => (e instanceof Object ? filterObjectRecursive(e, filterFunction) : e))
            .filter((e) => !(e instanceof Object && Object.keys(e).length === 0)),
        ]
      if (value instanceof Object) {
        return [key, filterObjectRecursive(value, filterFunction)]
      } else return [key, value]
    })
    .filter(([_, value]) => filterFunction(value)) as [key: string, value: any][]
  return Object.fromEntries(filtered)
}

export const truncate = (string: string, length = 200) =>
  string.length < length ? string : `${string.slice(0, length - 2).trim()}...`
