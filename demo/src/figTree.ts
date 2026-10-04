import {
  FigTree,
  PostgresConnection,
  coreOperators,
  httpOperators,
  sqlOperators,
  type FigTreeOptions,
} from 'fig-tree-evaluator'
// @ts-expect-error No declaration
import { PostgresInterface } from './postgresInterface.js'
import { evaluatorConfig } from './data/evaluatorConfig'

// The options the demo lets you change, from its Configuration panel and per
// demo. They're plain data, so they can be kept in local storage.
export type DemoOptions = Pick<
  FigTreeOptions,
  | 'fragments'
  | 'http'
  | 'graphQL'
  | 'operatorDefaults'
  | 'cache'
  | 'runtimeTypeCheck'
  | 'strictDataPaths'
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

type OperatorDefaults = NonNullable<DemoOptions['operatorDefaults']>

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

const DEFAULT_CACHE_SIZE = 50

// The result cache's store, so the Configuration panel can show how many
// entries it holds, which FigTree doesn't report. FigTree's `maxSize` bounds
// only its built-in store, so this one evicts the least recently used entry
// itself. An entry that has expired still counts until FigTree next looks it
// up and deletes it.
export class CacheStore {
  private readonly entries = new Map<string, unknown>()

  constructor(private readonly maxSize: number) {}

  get size() {
    return this.entries.size
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
    if (this.entries.size > this.maxSize) this.entries.delete(this.entries.keys().next().value!)
  }

  delete(key: string) {
    this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }
}

// A new instance for each set of options, with its own cache store. The
// operators can only be given at construction, and replacing the instance is
// how a fragment is removed, since `updateOptions()` merges fragments. It
// throws on invalid options, such as a malformed fragment definition.
export const buildFigTree = (options: DemoOptions) => {
  const cacheStore = new CacheStore(options.cache?.maxSize ?? DEFAULT_CACHE_SIZE)
  const figTree = new FigTree({
    ...options,
    cache: { ...options.cache, store: cacheStore },
    operators,
  })
  return { figTree, cacheStore }
}
