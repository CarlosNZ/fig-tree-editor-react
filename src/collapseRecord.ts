import { toPathString } from 'json-edit-react'
import { canonicalPath, type Classification } from './classify'
import { type Path } from './paths'

// The author's collapse toggles, by each row's canonical path (plan, 8.4),
// so a row that mounts again at another path after a conversion opens or
// closes as it was. The editor's collapse filter reads it before the host's
// `collapse`, and json-edit-react asks the filter only as a row mounts, so
// rows already on screen keep their own state. A toggle with json-edit-react's
// collapse modifier (`includeChildren`) covers the row's whole subtree.
export interface CollapseRecord {
  rows: Map<string, Toggle> // a row's own toggle
  subtrees: Map<string, Toggle> // a row's and everything beneath it
}

interface Toggle {
  path: Path // canonical
  collapsed: boolean
}

export const emptyCollapseRecord = (): CollapseRecord => ({ rows: new Map(), subtrees: new Map() })

export const recordToggle = (
  record: CollapseRecord,
  path: Path,
  collapsed: boolean,
  includeChildren: boolean
) => {
  const toggle = { path, collapsed }
  if (!includeChildren) {
    record.rows.set(toPathString(path), toggle)
    return
  }
  // It replaces every toggle beneath it
  for (const toggles of [record.rows, record.subtrees])
    for (const [key, { path: other }] of toggles) if (isWithin(other, path)) toggles.delete(key)
  record.subtrees.set(toPathString(path), toggle)
}

// Whether the row at a canonical path was left collapsed, where it or a row
// above it was toggled
export const recordedState = (record: CollapseRecord, path: Path): boolean | undefined => {
  const own = record.rows.get(toPathString(path))
  if (own !== undefined) return own.collapsed
  for (let length = path.length; length >= 0; length--) {
    const subtree = record.subtrees.get(toPathString(path.slice(0, length)))
    if (subtree !== undefined) return subtree.collapsed
  }
  return undefined
}

// Drops the toggles of rows no longer in the tree, so the record holds only
// the current tree's. Every collection counts by its canonical path, quoted
// content's included.
export const pruneCollapseRecord = (
  record: CollapseRecord,
  expression: unknown,
  classification: Classification
) => {
  if (record.rows.size === 0 && record.subtrees.size === 0) return
  const present = new Set<string>()
  const collect = (value: unknown, path: Path) => {
    if (typeof value !== 'object' || value === null) return
    present.add(toPathString(canonicalPath(classification, path)))
    if (Array.isArray(value)) value.forEach((element, index) => collect(element, [...path, index]))
    else for (const key in value) collect((value as Record<string, unknown>)[key], [...path, key])
  }
  collect(expression, [])
  for (const toggles of [record.rows, record.subtrees])
    for (const key of toggles.keys()) if (!present.has(key)) toggles.delete(key)
}

export const clearCollapseRecord = (record: CollapseRecord) => {
  record.rows.clear()
  record.subtrees.clear()
}

const isWithin = (path: Path, prefix: Path) =>
  prefix.length <= path.length && prefix.every((key, index) => path[index] === key)
