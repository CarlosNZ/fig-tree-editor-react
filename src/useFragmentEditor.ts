import { useState } from 'react'
import { useUndo } from '@json-edit-react/utils'
import {
  deepEqual,
  isFigTreeError,
  type FigTree,
  type FragmentDefinition,
  type Issue,
} from 'fig-tree-evaluator'
import { type SetExpressionOptions } from './FigTreeEditor'
import { type FragmentSelectProps } from './FragmentSelect'
import { isWithin } from './paths'
import { strings } from './strings'

// The state and logic behind authoring fragments (fragment-editor-design.md,
// "Authoring state"). The host lays out the picker, the two editors and its
// own Save button; this holds what they show, and builds their props.
//
// It holds the fragments, since an instance never gives back a fragment's
// body, so whatever loads one into the editors must keep the definitions
// itself. They are registered on the instance on the first render, and from
// then on this is the only thing that changes the instance's fragments.
//
// It holds the draft too: the definition being edited, its name, whether it
// is the fragment registered under that name, and its undo history, which
// covers the definition only, since a rename is a save, not an edit.

export type Fragments = Record<string, FragmentDefinition>

// A draft as the hook keeps it, which a host stores whole, as JSON, to
// restore it through `initialDraft`
export interface FragmentDraft {
  definition: FragmentDefinition
  name?: string
  registered: boolean // whether it is the fragment registered under `name`
  // The definition as it was started, loaded or last saved, with any values
  // the expression editor has filled in since: what an edit is told from
  baseline: FragmentDefinition
}

export interface UseFragmentEditorOptions {
  figTree: FigTree
  initialFragments?: Fragments // the definitions to start with
  initialDraft?: FragmentDraft
  // Called with the whole record after each change that registers, for the
  // host to persist it
  onFragmentsChange?: (fragments: Fragments) => void
  // Whether to discard a draft's unsaved edits, to pick another fragment
  confirmDiscard?: () => boolean | Promise<boolean>
}

export const useFragmentEditor = ({
  figTree,
  initialFragments = {},
  initialDraft,
  onFragmentsChange,
  confirmDiscard = defaultConfirmDiscard,
}: UseFragmentEditorOptions) => {
  // Registered in the initialiser, so they are on the instance before any
  // editor below the host renders. Registering the same record twice, as
  // React's strict mode does, leaves the instance as once does.
  const [fragments, setFragmentsState] = useState(() => {
    const registered = figTree.getFragments().map(({ name }) => name)
    figTree.updateOptions({ fragments: replacing(registered, initialFragments) })
    return initialFragments
  })
  const [draft, setDraft] = useState(() => restoreDraft(initialDraft, initialFragments))
  // A refused save's or rename's issues, until the next change
  const [saveIssues, setSaveIssues] = useState<Issue[]>([])
  const history = useUndo(draft.definition, (definition: FragmentDefinition) =>
    setDraft((previous) => ({ ...previous, definition }))
  )

  const { definition, name, registered, baseline } = draft
  const canSave = name !== undefined && (!registered || !deepEqual(definition, baseline))

  const updateFragments = (next: Fragments) => {
    setFragmentsState(next)
    onFragmentsChange?.(next)
  }

  // A new draft, with no history behind it
  const replaceDraft = (next: FragmentDraft) => {
    history.reset(next.definition)
    setDraft(next)
    setSaveIssues([])
  }

  // Registers an update to the instance's fragments, or keeps the issues it
  // is refused with, for `name`'s definition editor
  const register = (update: Record<string, FragmentDefinition | null>, name: string) => {
    try {
      figTree.updateOptions({ fragments: update })
      setSaveIssues([])
      return true
    } catch (thrown) {
      setSaveIssues(refusalIssues(thrown, name))
      return false
    }
  }

  // An autoUpdate is the editor filling in values, not an edit, so it is
  // recorded in place, and in the baseline where nothing is edited yet
  const setFragmentDefinition = (next: FragmentDefinition, options?: SetExpressionOptions) => {
    if (deepEqual(next, definition)) return
    setSaveIssues([])
    if (!options?.autoUpdate) return history.set(next)
    setDraft((previous) => ({
      ...previous,
      definition: next,
      baseline: deepEqual(previous.definition, previous.baseline) ? next : previous.baseline,
    }))
  }

  const save = () => {
    if (!canSave || name === undefined || !register({ [name]: definition }, name)) return
    updateFragments({ ...fragments, [name]: definition })
    setDraft((previous) => ({ ...previous, registered: true, baseline: definition }))
  }

  // A registered fragment's rename saves at once, moving its saved version to
  // the new name and leaving the draft's edits unsaved, so there is only ever
  // one name. It can't be left unnamed. A draft never registered is only
  // named, and Save registers it.
  const setFragmentName = (next: string | undefined) => {
    if (next === name) return
    if (!registered || name === undefined) {
      setDraft((previous) => ({ ...previous, name: next }))
      return setSaveIssues([])
    }
    if (next === undefined) return
    const saved = fragments[name]
    if (!register({ [name]: null, [next]: saved }, next)) return
    // In the order the instance's merge leaves them
    const { [name]: _renamed, ...rest } = fragments
    updateFragments({ ...rest, [next]: saved })
    setDraft((previous) => ({ ...previous, name: next }))
  }

  const select = async (next: string) => {
    if (registered && next === name) return
    const loaded = fragments[next]
    if (loaded === undefined) return
    if (hasUnsavedEdits(draft) && !(await confirmDiscard())) return
    replaceDraft({ definition: loaded, name: next, registered: true, baseline: loaded })
  }

  // The host's switch to fragment mode: a new, unnamed fragment with the
  // expression as its body, unless the draft has edits not yet saved
  const startFromExpression = (expression: unknown) => {
    if (hasUnsavedEdits(draft)) return
    const started = { expression }
    replaceDraft({ definition: started, registered: false, baseline: started })
  }

  // Replaces the fragments whole, for a host's own fragments editor. It
  // throws where the instance refuses them, leaving everything as it was. A
  // draft whose fragment is gone is no longer registered, and one with no
  // edits takes a new version of its fragment.
  const setFragments = (next: Fragments) => {
    figTree.updateOptions({ fragments: replacing(Object.keys(fragments), next) })
    updateFragments(next)
    if (!registered || name === undefined) return
    const saved = next[name]
    if (saved === undefined) setDraft((previous) => ({ ...previous, registered: false }))
    else if (!deepEqual(saved, fragments[name]) && !hasUnsavedEdits(draft))
      replaceDraft({ definition: saved, name, registered: true, baseline: saved })
  }

  const selectProps: FragmentSelectProps = {
    figTree,
    selected: registered ? (name ?? null) : null,
    onSelect: (next) => void select(next),
  }

  return {
    selectProps,
    editorProps: { fragmentDefinition: definition, setFragmentDefinition, fragmentName: name },
    definitionProps: {
      definition,
      setDefinition: setFragmentDefinition,
      fragmentName: name,
      setFragmentName,
      saveIssues,
    },
    canSave,
    save,
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    startFromExpression,
    draft,
    fragments,
    setFragments,
  }
}

const defaultConfirmDiscard = () => window.confirm(strings.FT_CONFIRM_DISCARD)

// What leaving the draft would lose: its edits, or a name given to a draft
// never registered
const hasUnsavedEdits = ({ definition, name, registered, baseline }: FragmentDraft) =>
  !deepEqual(definition, baseline) || (!registered && name !== undefined)

// The draft to start with: the host's, still registered only where its
// fragment is, or an empty one
const restoreDraft = (draft: FragmentDraft | undefined, fragments: Fragments): FragmentDraft => {
  if (draft === undefined) {
    const empty = { expression: null }
    return { definition: empty, registered: false, baseline: empty }
  }
  const registered = draft.registered && draft.name !== undefined && draft.name in fragments
  return { ...draft, registered }
}

// An update to the instance's fragments that leaves them `next`: each of
// `previous` that `next` doesn't have is null, which removes it
const replacing = (previous: string[], next: Fragments) => ({
  ...Object.fromEntries(previous.map((name) => [name, null])),
  ...next,
})

// The issues a registration of `name` was refused with, for its definition
// editor, which already shows the draft's own: those inside the body come
// from `validate()`, and those in the declarations from registering it under
// a temporary name. So only the rest are kept, such as a fragment calling
// this one that the change breaks, or the name itself, each on the root row.
// Where none is left, the refusal is said in a line of its own.
const refusalIssues = (thrown: unknown, name: string): Issue[] => {
  if (!isFigTreeError(thrown))
    return [refusal(thrown instanceof Error ? thrown.message : String(thrown))]
  const own = ['fragments', name]
  const issues = thrown.issues ?? []
  const rest = issues
    .filter(({ path }) => !(isWithin(path, own) && path.length > own.length))
    .map((issue) => ({ ...issue, path: [] }))
  if (rest.length > 0) return rest
  return [refusal(issues.length > 0 ? strings.FT_SAVE_REFUSED : thrown.message)]
}

const refusal = (message: string): Issue => ({
  severity: 'error',
  code: 'invalid-options',
  message,
  path: [],
})
