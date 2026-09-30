import { type CustomComponentProps } from 'json-edit-react'
import { rowAt, type Classification } from './classify'
import { type Path } from './paths'

// A node's child rows without the ones its header already shows (the
// `operator` or `fragment` row). json-edit-react has no option to omit a row,
// so each node's component drops them from the `children` it's given, which
// json-edit-react keys by the child's own key.
export const withoutFilteredRows = (
  children: CustomComponentProps['children'],
  classification: Classification,
  path: Path
) =>
  Array.isArray(children)
    ? children.filter((child) => !rowAt(classification, [...path, String(child.key)])?.filtered)
    : children

// A node's child row at `key`, apart from its other rows
export const takeRow = (children: CustomComponentProps['children'], key: string) => {
  if (!Array.isArray(children)) return { row: undefined, rest: children }
  return {
    row: children.find((child) => String(child.key) === key),
    rest: children.filter((child) => String(child.key) !== key),
  }
}
