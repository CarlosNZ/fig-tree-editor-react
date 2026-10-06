import {
  FigTree,
  PostgresConnection,
  coreOperators,
  httpOperators,
  sqlOperators,
  type FallbackCoverageOptions,
  type FigTreeOptions,
  type OptionsUpdate,
} from 'fig-tree-evaluator'
// @ts-expect-error No declaration
import { PostgresInterface } from './postgresInterface.js'
import { evaluatorConfig } from './data/evaluatorConfig'
import { getLocalStorage } from './helpers'

// The options the demo lets you change, from its Configuration panel and per
// demo: the instance's, and the editor's coverage analysis's, which aren't the
// instance's. They're plain data, so they can be kept in local storage.
export type DemoOptions = {
  coverage?: Pick<FallbackCoverageOptions, 'numbers'>
} & Pick<
  FigTreeOptions,
  | 'fragments'
  | 'http'
  | 'graphQL'
  | 'operatorDefaults'
  | 'cache'
  | 'strictDataPaths'
  | 'timeout'
  | 'maxDepth'
  | 'maxNodes'
>

export const defaultOptions: DemoOptions = {
  fragments: evaluatorConfig.fragments,
  cache: { maxSize: 50, maxTime: 1800 },
}

// Every operator the demo can use: the core set, HTTP over the browser's
// fetch, SQL through the local Postgres bridge (src/express/server.js), and
// the demo's own custom operators
const operators = [
  coreOperators,
  httpOperators(),
  sqlOperators(new PostgresConnection(new PostgresInterface())),
  evaluatorConfig.customOperators,
]

// The operators that cache, the requests: what the Configuration panel's
// "Use cache?" turns off, each by name, since FigTree has no one switch
const cachingOperators = operators
  .flat()
  .filter(({ cache }) => cache)
  .map(({ name }) => name)

export type OperatorDefaults = NonNullable<DemoOptions['operatorDefaults']>

// Whether the options leave caching on: some operator that caches isn't
// turned off
export const usesCache = ({ operatorDefaults }: DemoOptions) =>
  cachingOperators.some((name) => operatorDefaults?.[name]?.noCache !== true)

// The operator defaults with caching on or off for every operator that
// caches, keeping whatever else they set
export const setCaching = (defaults: OperatorDefaults = {}, on: boolean): OperatorDefaults => {
  const result = { ...defaults }
  for (const name of cachingOperators) {
    const rest = Object.fromEntries(
      Object.entries(result[name] ?? {}).filter(([key]) => key !== 'noCache')
    )
    if (!on) result[name] = { ...rest, noCache: true }
    else if (Object.keys(rest).length > 0) result[name] = rest
    else delete result[name]
  }
  return result
}

// What FigTree finds wrong with these operator defaults, if anything: an
// operator or parameter it doesn't have, or a value of the wrong type
export const checkOperatorDefaults = (operatorDefaults: OperatorDefaults) => {
  try {
    new FigTree({ operators, operatorDefaults })
    return undefined
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

// FigTree's own defaults, which the Configuration panel's empty fields mean
const DEFAULT_CACHE_SIZE = 50
const DEFAULT_CACHE_TIME = 1800

// The result cache's store, so the Configuration panel can show how many
// entries it holds, which FigTree doesn't report. FigTree's `maxSize` bounds
// only its built-in store, so this one evicts the least recently used entry
// itself. An entry that has expired still counts until FigTree next looks it
// up and deletes it.
export class CacheStore {
  private readonly entries = new Map<string, unknown>()

  constructor(private maxSize: number) {}

  get size() {
    return this.entries.size
  }

  // Changes the bound, evicting the least recently used entries past a shrink
  resize(maxSize: number) {
    this.maxSize = maxSize
    while (this.entries.size > this.maxSize) this.evictOldest()
  }

  get(key: string) {
    if (!this.entries.has(key)) return undefined
    const value = this.entries.get(key)
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: unknown) {
    this.entries.delete(key)
    this.entries.set(key, value)
    if (this.entries.size > this.maxSize) this.evictOldest()
  }

  delete(key: string) {
    this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }

  private evictOldest() {
    this.entries.delete(this.entries.keys().next().value!)
  }
}

// The one instance, for as long as the page is open, so its result cache
// outlives every change of options. The operators can only be given here;
// everything else goes through `applyOptions`.
export const cacheStore = new CacheStore(DEFAULT_CACHE_SIZE)
export const figTree = new FigTree({ operators, cache: { store: cacheStore } })

// The update that makes the instance's options `options`, given that they're
// `previous`. `updateOptions()` merges what it's given into what the instance
// has, and removes what's `null`, so each setting `options` leaves out is
// given as null, and FigTree's default applies. The cache keeps the demo's
// own defaults, and its store.
const prepareOptions = (previous: DemoOptions, options: DemoOptions): OptionsUpdate => ({
  fragments: replacing(previous.fragments, options.fragments),
  http: replacing(previous.http, options.http),
  graphQL: replacing(previous.graphQL, options.graphQL),
  operatorDefaults: replacing(previous.operatorDefaults, options.operatorDefaults),
  cache: {
    maxSize: options.cache?.maxSize ?? DEFAULT_CACHE_SIZE,
    maxTime: options.cache?.maxTime ?? DEFAULT_CACHE_TIME,
  },
  strictDataPaths: options.strictDataPaths ?? null,
  timeout: options.timeout ?? null,
  maxDepth: options.maxDepth ?? null,
  maxNodes: options.maxNodes ?? null,
})

// A block of options as an update over `previous`: each key `previous` has
// and `next` doesn't is null, which removes it
const replacing = <Block extends object>(previous?: Block, next?: Block) => ({
  ...Object.fromEntries(Object.keys(previous ?? {}).map((key) => [key, null])),
  ...next,
})

let applied: DemoOptions = {}

// Makes `options` the instance's options. It throws on invalid options, such
// as a malformed fragment definition, leaving the instance as it was.
export const applyOptions = (options: DemoOptions) => {
  figTree.updateOptions(prepareOptions(applied, options))
  // FigTree checks `maxSize`, but bounds only its built-in store
  cacheStore.resize(options.cache?.maxSize ?? DEFAULT_CACHE_SIZE)
  applied = options
}

// The saved options if FigTree accepts them, else the defaults, applied to the
// instance
export const initialOptions = ((): DemoOptions => {
  const saved = getLocalStorage('options') as DemoOptions | null
  if (saved)
    try {
      applyOptions(saved)
      return saved
    } catch {
      // Not valid, so the defaults
    }
  applyOptions(defaultOptions)
  return defaultOptions
})()
