// Common functionality for FigTree Node components

import React, { useEffect, useRef, useState } from 'react'
import { type OperatorProps } from './Operator'
import {
  type AssignInput,
  type JsonData,
  type NodeData,
  assign,
  toPathString,
  useKeyboardListener,
} from 'json-edit-react'
import { getAliases } from './helpers'
import { type EvaluatorNode, isObject } from 'fig-tree-evaluator'

interface Input {
  componentProps: OperatorProps
  // The node object itself. The custom node is anchored on the
  // operator/fragment object, so `value` IS the expression node (not the
  // operator/fragment key's string value as before).
  value: JsonData
  nodeData: NodeData
  // Live read of the full tree, used by `buildOnEdit` to compute the new data
  // for an edit at an arbitrary path.
  getLatestData: () => JsonData
  // json-edit-react's editing session for this node. `isEditing` drives the
  // toolbar; `setIsEditing`/`handleCancel` open/close the session. `useCommon`
  // wraps these as `startEditing`/`closeEditing` to also set/clear
  // `displayBarEditPath` (which selects this node's toolbar variant).
  isEditing: boolean
  setIsEditing: (value: boolean) => void
  handleCancel: () => void
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
      path.length === 0 ? newValue : assign(getLatestData() as AssignInput, path, newValue)
    updateExpression(newData as EvaluatorNode)
  }

/**
 * Removes the operator/fragment key row from a node's rendered children. The
 * object-anchored component represents that key in its header (DisplayBar /
 * selectors), so showing the raw `operator: "+"` / `fragment: "x"` row too
 * would be redundant. Other properties (values/args/input/parameters/fallback…)
 * pass through untouched. Elements created via `keyValueArray.map` carry the
 * data key as their React `key`, so we filter on that.
 */
export const filterChildren = (children: React.ReactNode): React.ReactNode => {
  if (!Array.isArray(children)) return children
  return (children as React.ReactNode[]).filter(
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
  setIsEditing,
  handleCancel,
}: Input) => {
  const {
    evaluateNode,
    topLevelAliases,
    operatorDisplay,
    figTreeData,
    addTopLevelFallback,
    updateExpression,
    justSwitchedTo,
    displayBarEditPath,
    setDisplayBarEditPath,
  } = componentProps
  const [loading, setLoading] = useState(false)

  // The custom node is the object itself, so its own path is the expression path.
  const expressionPath = nodeData.path
  const pathString = toPathString(nodeData.path)

  const onEdit = buildOnEdit(getLatestData, updateExpression)

  // Edit via the DisplayBar pencil: mark this path as display-bar-edited (which
  // selects this node's `showOnEdit` toolbar variant), then open the session.
  const startEditing = () => {
    setDisplayBarEditPath(pathString)
    setIsEditing(true)
  }
  // Close (✓/✗/Esc): clear the mark first so a subsequent edit-tools edit of
  // this node opens raw JSON, then end the session. Edits are written live, so
  // there's nothing to commit/revert here.
  const closeEditing = () => {
    setDisplayBarEditPath(null)
    handleCancel()
  }

  // Safety net for when a display-bar edit ends WITHOUT `closeEditing` — e.g.
  // displaced by opening another node. Clear our mark (guarded to this path so
  // we never clobber another node's just-set mark) so a later edit-tools edit
  // here opens raw JSON rather than the toolbar.
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !isEditing && displayBarEditPath === pathString)
      setDisplayBarEditPath(null)
    wasEditing.current = isEditing
    // Intentionally keyed on the `isEditing` transition; the other values are
    // read only during that transition (always current) or are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  // When a NodeTypeSelector switch lands on this path, auto-open this node's
  // operator/fragment/function picker (the freshly-switched node mounts here).
  // The flag is consumed once, then cleared.
  const startOpen = justSwitchedTo?.current === pathString
  useEffect(() => {
    if (justSwitchedTo?.current === pathString) justSwitchedTo.current = null
    // Consume the "just switched to this path" flag once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Enter/Escape close the toolbar (edits are written live — nothing to
  // commit/revert). `useKeyboardListener` (from json-edit-react) attaches the
  // listener while editing and always invokes the latest handler.
  const listenForSubmit = (e: unknown) => {
    const { key } = e as KeyboardEvent
    if (key === 'Enter' || key === 'Escape') closeEditing()
  }
  useKeyboardListener(isEditing, listenForSubmit)

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
    startEditing,
    closeEditing,
  }
}
