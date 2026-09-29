import { useRef } from 'react'
import { deepEqual } from 'fig-tree-evaluator'

// The value, keeping the identity it had on an earlier render while its
// content is unchanged. So a value derived on every render (from the
// expression, or from a registry that `updateOptions()` changes in place)
// reaches memoised consumers only when it changes.
export const useStableValue = <T>(value: T): T => {
  const stable = useRef(value)
  if (!deepEqual(stable.current, value)) stable.current = value
  return stable.current
}
