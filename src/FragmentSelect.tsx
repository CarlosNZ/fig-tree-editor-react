import { useInsertionEffect } from 'react'
import { type FigTree } from 'fig-tree-evaluator'
import { readListing } from './displayData'
import { injectStyles } from './injectStyles'
import { Select } from './Select'
import { strings } from './strings'

// The registered fragments, to pick one to edit (fragment-editor-design.md,
// "Authoring state"). The host places it, and `useFragmentEditor` gives its
// props. Each is labelled as the toolbar's fragment picker labels it: its
// display name, or its name where it has none, with its description beneath.
// The placeholder shows while the draft is not a registered fragment.

export interface FragmentSelectProps {
  figTree: FigTree
  selected: string | null // the registered fragment being edited
  onSelect: (name: string) => void
}

export const FragmentSelect = ({ figTree, selected, onSelect }: FragmentSelectProps) => {
  useInsertionEffect(() => {
    injectStyles()
  }, [])

  // Read on every render, since `updateOptions()` changes the registry
  // without changing the instance
  const options = figTree.getFragments().map(({ name, listing }) => ({
    label: readListing(listing).displayName ?? name,
    description: readListing(listing).description,
    keywords: name,
    value: name,
  }))

  return (
    <Select
      className="ft-fragment-select"
      options={options}
      selected={selected}
      search
      placeholder={strings.FT_FRAGMENT_SELECT_PLACEHOLDER}
      emptyText={strings.FT_NO_FRAGMENTS}
      setSelected={({ value }) => onSelect(value)}
    />
  )
}
