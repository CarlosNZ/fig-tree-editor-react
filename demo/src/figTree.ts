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

// A new instance for each set of options. The operators can only be given at
// construction, and replacing the instance is how a fragment is removed, since
// `updateOptions()` merges fragments. It throws on invalid options, such as a
// malformed fragment definition.
export const buildFigTree = (options: DemoOptions) => new FigTree({ ...options, operators })
