import { type CustomComponentProps } from 'json-edit-react'
import { rowAt, type RowKind } from './classify'
import { type ComponentConfig, type DefinitionName } from './customNodeDefinitions'
import { type DisplayData } from './displayData'

// TO-DO: replace with each kind's own component (plan, Phases 5 to 9).
//
// A stand-in for every definition's component, so the classification can be
// checked on real expressions: json-edit-react's own rendering inside a thin
// border, with a small label naming the definition in the same colour. The
// label is positioned absolutely, so the tree lays out as it would without
// it. Its text is temporary, so it isn't among the editor's strings.

const COLOURS: Record<DefinitionName, string> = {
  operator: '#2563eb',
  fragment: '#9333ea',
  shorthand: '#0891b2',
  literal: '#65a30d',
  reference: '#db2777',
  container: '#ea580c',
  comment: '#6b7280',
  commentLine: '#6b7280',
  flattened: '#ca8a04',
  unlabelled: '#059669',
}

export const Placeholder = ({
  componentProps,
  nodeData,
  children,
  originalNode,
  getStyles,
}: CustomComponentProps<ComponentConfig>) => {
  const { classification, displayData, definition, unlabelled } = componentProps!
  const kind = rowAt(classification, nodeData.path)?.kind
  const colour = COLOURS[definition]
  const isLeaf = children === undefined

  // The rows a node's header already shows (the `operator` or `fragment`
  // row) are dropped, as each node's own component will drop them
  const shown = Array.isArray(children)
    ? children.filter(
        (child) => !rowAt(classification, [...nodeData.path, String(child.key)])?.filtered
      )
    : children

  return (
    <div
      data-kind={definition}
      style={{
        position: 'relative',
        display: isLeaf ? 'inline-block' : 'block',
        border: `1px solid ${colour}`,
        borderRadius: '0.25em',
        padding: isLeaf ? '0 0.2em' : '0.3em 0',
      }}
    >
      <span
        style={{
          position: 'absolute',
          // A flattened payload's box starts where its node's does, so its
          // label goes on the bottom edge, clear of the node's
          ...(definition === 'flattened'
            ? { bottom: 0, transform: 'translateY(50%)' }
            : { top: 0, transform: 'translateY(-50%)' }),
          right: '0.4em',
          padding: '0 0.25em',
          fontFamily: 'sans-serif',
          fontSize: '0.6rem',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          color: colour,
          backgroundColor: getStyles('container', nodeData).backgroundColor,
        }}
      >
        {label(definition, kind, displayData)}
        {unlabelled && ' · unlabelled'}
      </span>
      {isLeaf ? originalNode : shown}
    </div>
  )
}

const label = (definition: DefinitionName, kind: RowKind | undefined, display: DisplayData) => {
  switch (kind?.kind) {
    case 'operator': {
      const name = kind.operator === null ? null : display.operators[kind.operator]?.displayName
      const written = kind.form === 'shorthand' ? `$${kind.name}` : (kind.name ?? 'invalid')
      const state = kind.malformed ? ' · malformed' : kind.operator === null ? ' · unknown' : ''
      return `${kind.form === 'shorthand' ? 'Shorthand' : 'Operator'} · ${written}${
        name ? ` (${name})` : ''
      }${state}`
    }
    case 'fragment': {
      const name = kind.name === null ? null : display.fragments[kind.name]?.displayName
      const written = kind.form === 'shorthand' ? `$${kind.name}` : (kind.name ?? 'invalid')
      const state = kind.malformed ? ' · malformed' : !kind.registered ? ' · unknown' : ''
      return `${kind.form === 'shorthand' ? 'Shorthand fragment' : 'Fragment'} · ${written}${
        name ? ` (${name})` : ''
      } · ${kind.arguments} arguments${state}`
    }
    case 'literal':
      return `Literal · ${kind.form}`
    case 'reference':
      return `Reference · ${kind.binding ? `${kind.namespace} as ${kind.binding}` : kind.namespace}${
        kind.invalid ? ' · invalid' : ''
      }`
    default:
      return LABELS[definition]
  }
}

const LABELS: Record<DefinitionName, string> = {
  operator: 'Operator',
  fragment: 'Fragment',
  shorthand: 'Shorthand',
  literal: 'Literal',
  reference: 'Reference',
  container: 'Container',
  comment: 'Comment',
  commentLine: 'Comment line',
  flattened: 'Flattened payload',
  unlabelled: 'Unlabelled',
}
