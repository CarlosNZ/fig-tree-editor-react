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
  'fragments' | 'http' | 'graphQL' | 'useCache' | 'cache' | 'runtimeTypeCheck' | 'strictDataPaths'
>

export const defaultOptions: DemoOptions = {
  fragments: evaluatorConfig.fragments,
  useCache: true,
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

// A new instance for each set of options. The operators can only be given at
// construction, and replacing the instance is how a fragment is removed, since
// `updateOptions()` merges fragments. It throws on invalid options, such as a
// malformed fragment definition.
export const buildFigTree = (options: DemoOptions) => new FigTree({ ...options, operators })
