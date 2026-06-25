// Common functionality for FigTree Node components

import React, { useEffect, useState } from 'react'
import { OperatorProps } from './Operator'
import { JsonData, NodeData, assign, toPathString } from 'json-edit-react'
import { getAliases } from './helpers'
import { EvaluatorNode, isObject } from 'fig-tree-evaluator'

interface Input {
  componentProps: OperatorProps
  // The node object itself. The custom node is anchored on the operator/fragment
  // object, so `value` IS the expression node (not the operator/fragment key's
  // string value as before).
  value: JsonData
  nodeData: NodeData
  // Live read of the full tree, used by `buildOnEdit` to compute the new data
  // for an edit at an arbitrary path.
  getLatestData: () => JsonData
  // json-edit-react's editing session for this node: `isEditing` drives the
  // toolbar, `closeEditing` ends the session (✓/✗ both just close, since the
  // toolbar's edits are written live).
  isEditing: boolean
  closeEditing: () => void
}

/**
 * Writes `newValue` to any path in the tree: reads the live data, swaps in the
 * new value at `path` with `assign`, then validates and persists via
 * `updateExpression`. Shared by `useCommon` and the Shorthand nodes (which
 * don't use `useCommon`).
 */
export const buildOnEdit =
  (getLatestData: () => JsonData, updateExpression: (data: EvaluatorNode) => void) =>
  (newValue: unknown, path: (string | number)[]) => {
    // `assign` is a no-op on an empty path, so replace the root explicitly
    const newData =
      path.length === 0 ? newValue : assign(getLatestData() as any, path, newValue)
    updateExpression(newData as EvaluatorNode)
  }

/**
 * Removes the operator/fragment key row from a node's rendered children. The
 * object-anchored component represents that key in its header (DisplayBar /
 * selectors), so showing the raw `operator: "+"` / `fragment: "x"` row too would
 * be redundant. Other properties (values/args/input/parameters/fallback…) pass
 * through untouched. Elements created via `keyValueArray.map` carry the data key
 * as their React `key`, so we filter on that.
 */
export const filterChildren = (children: React.ReactNode): React.ReactNode => {
  if (!Array.isArray(children)) return children
  return children.filter(
    (child) =>
      !(React.isValidElement(child) && (child.key === 'operator' || child.key === 'fragment'))
  )
}

export const useCommon = ({
  componentProps,
  value,
  nodeData,
  getLatestData,
  isEditing,
  closeEditing,
}: Input) => {
  const {
    evaluateNode,
    topLevelAliases,
    operatorDisplay,
    figTreeData,
    addTopLevelFallback,
    updateExpression,
    justSwitchedTo,
  } = componentProps
  const [loading, setLoading] = useState(false)

  // The custom node is the object itself, so its own path is the expression path.
  const expressionPath = nodeData.path
  const pathString = toPathString(nodeData.path)

  const onEdit = buildOnEdit(getLatestData, updateExpression)

  // When a NodeTypeSelector switch lands on this path, auto-open this node's
  // operator/fragment/function picker (the freshly-switched node mounts here).
  // The flag is consumed once, then cleared.
  const startOpen = justSwitchedTo?.current === pathString
  useEffect(() => {
    if (justSwitchedTo?.current === pathString) justSwitchedTo.current = null
  }, [])

  // Enter/Escape both just close the toolbar (edits are written live, so there's
  // no buffer to commit or revert).
  const listenForSubmit = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') closeEditing()
  }

  /**
   * If `addTopLevelFallback` is specified, the fallback value will be applied
   * to top-level nodes that do not already have a fallback defined. The
   * top-level expression object is the root node (`level === 0`).
   */
  const maybeInsertFallback = <T,>(expression: T): T | (T & { fallback?: EvaluatorNode }) => {
    if (
      addTopLevelFallback !== undefined &&
      nodeData.level === 0 &&
      isObject(expression) &&
      !('fallback' in expression)
    ) {
      return { ...expression, fallback: addTopLevelFallback }
    }
    return expression
  }

  useEffect(() => {
    if (isEditing) {
      window.addEventListener('keydown', listenForSubmit)
    } else window.removeEventListener('keydown', listenForSubmit)
    return () => window.removeEventListener('keydown', listenForSubmit)
  }, [isEditing])

  const aliases = {
    ...topLevelAliases,
    ...getAliases(value as EvaluatorNode, figTreeData.allNonAliases),
  }

  const evaluate = async (e: React.MouseEvent) => {
    setLoading(true)
    await evaluateNode({ ...(value as object), ...aliases }, e)
    setLoading(false)
  }

  return {
    expressionPath,
    evaluate,
    loading,
    operatorDisplay,
    maybeInsertFallback,
    onEdit,
    startOpen,
  }
}
