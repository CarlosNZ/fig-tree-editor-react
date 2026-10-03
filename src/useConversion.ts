import { useMemo } from 'react'
import { nodeConversion } from './conversions'
import { type ComponentConfig } from './customNodeDefinitions'

// A node's conversion, as its DisplayBar's button: none where the node is
// broken or can't be edited, so the button shows only where converting is
// allowed and succeeds. It commits with the component's `setValue`, as every
// other change to the node does.
export const useConversion = (
  value: unknown,
  { figTree, classification, referenceNames }: ComponentConfig,
  enabled: boolean,
  setValue: (value: unknown) => void
) => {
  const conversion = useMemo(
    () => (enabled ? nodeConversion(value, figTree, referenceNames) : null),
    // The classification follows the registry, which `updateOptions()` can
    // change without changing the instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, enabled, figTree, referenceNames, classification]
  )
  return conversion
    ? {
        label: conversion.label,
        toReference: conversion.toReference,
        onConvert: () => setValue(conversion.result),
      }
    : undefined
}
