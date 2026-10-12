import { act, renderHook } from '@testing-library/react'
import { FigTree, coreOperators, type FragmentDefinition } from 'fig-tree-evaluator'
import { describe, expect, it, vi } from 'vitest'
import { useFragmentEditor, type UseFragmentEditorOptions } from '../src'
import { strings } from '../src/strings'

const greet: FragmentDefinition = {
  expression: { operator: 'plus', values: ['Hello, ', '$params.name'] },
  parameters: { name: { type: 'string' } },
}
const shout: FragmentDefinition = {
  expression: { operator: 'plus', values: ['$params.text', '!'] },
  parameters: { text: { type: 'string' } },
}

// A fresh instance each time, since the hook registers on it
const setup = (options: Partial<UseFragmentEditorOptions> = {}) => {
  const figTree = new FigTree({ operators: coreOperators })
  const hook = renderHook(() =>
    useFragmentEditor({ figTree, initialFragments: { greet, shout }, ...options })
  )
  const registered = () => figTree.getFragments().map(({ name }) => name)
  return { figTree, registered, ...hook }
}

describe('useFragmentEditor', () => {
  it('registers the initial fragments in place of those on the instance', () => {
    const figTree = new FigTree({ operators: coreOperators, fragments: { old: shout } })
    renderHook(() => useFragmentEditor({ figTree, initialFragments: { greet } }))
    expect(figTree.getFragments().map(({ name }) => name)).toEqual(['greet'])
  })

  it('starts a fragment from an expression, which saves once named', () => {
    const onFragmentsChange = vi.fn()
    const { result, registered } = setup({ onFragmentsChange })
    act(() => result.current.startFromExpression({ operator: 'plus', values: [1, 2] }))
    expect(result.current.draft.definition).toEqual({
      expression: { operator: 'plus', values: [1, 2] },
      parameters: {},
      description: strings.FT_DESCRIPTION_SEED,
      samples: {},
      metadata: {},
    })
    expect(result.current.selectProps.selected).toBeNull()
    expect(result.current.canSave).toBe(false)

    act(() => result.current.definitionProps.setFragmentName('three'))
    expect(result.current.canSave).toBe(true)
    expect(registered()).not.toContain('three')

    act(() => result.current.save())
    expect(registered()).toContain('three')
    expect(result.current.selectProps.selected).toBe('three')
    expect(result.current.canSave).toBe(false)
    expect(onFragmentsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ three: expect.anything() })
    )
  })

  it("loads a picked fragment with Save off until it's edited, and off again on undoing", () => {
    const { result } = setup()
    act(() => result.current.selectProps.onSelect('greet'))
    expect(result.current.draft.definition).toEqual(greet)
    expect(result.current.editorProps.fragmentName).toBe('greet')
    expect(result.current.canSave).toBe(false)

    act(() => result.current.definitionProps.setDefinition({ ...greet, description: 'Hi' }))
    expect(result.current.canSave).toBe(true)
    act(() => result.current.undo())
    expect(result.current.canSave).toBe(false)
  })

  it("doesn't count the editor filling in values as an edit", () => {
    const { result } = setup()
    act(() => result.current.selectProps.onSelect('greet'))
    const filled = {
      ...greet,
      expression: { operator: 'plus', values: ['Hello, ', '$params.name'], type: 'string' },
    }
    act(() => result.current.editorProps.setFragmentDefinition(filled, { autoUpdate: true }))
    expect(result.current.draft.definition).toEqual(filled)
    expect(result.current.canSave).toBe(false)
    expect(result.current.canUndo).toBe(false)
  })

  it('asks before picking another fragment over unsaved edits, and clears the history', async () => {
    const confirmDiscard = vi.fn(() => false)
    const { result } = setup({ confirmDiscard })
    act(() => result.current.selectProps.onSelect('greet'))
    act(() => result.current.definitionProps.setDefinition({ ...greet, description: 'Hi' }))

    await act(() => Promise.resolve(result.current.selectProps.onSelect('shout')))
    expect(confirmDiscard).toHaveBeenCalledOnce()
    expect(result.current.editorProps.fragmentName).toBe('greet')

    confirmDiscard.mockReturnValue(true)
    await act(() => Promise.resolve(result.current.selectProps.onSelect('shout')))
    expect(result.current.draft.definition).toEqual(shout)
    expect(result.current.canUndo).toBe(false)
  })

  it('keeps a draft with unsaved edits on starting from an expression, but replaces one without', () => {
    const { result } = setup()
    act(() => result.current.startFromExpression(1))
    act(() => result.current.startFromExpression(2))
    expect(result.current.draft.definition.expression).toBe(2)

    const { definition } = result.current.draft
    act(() => result.current.editorProps.setFragmentDefinition({ ...definition, expression: 3 }))
    act(() => result.current.startFromExpression(4))
    expect(result.current.draft.definition.expression).toBe(3)
  })

  it('discards a registered fragment back to its saved version', () => {
    const { result } = setup()
    act(() => result.current.selectProps.onSelect('greet'))
    expect(result.current.hasUnsavedEdits).toBe(false)
    act(() => result.current.definitionProps.setDefinition({ ...greet, description: 'Hi' }))
    expect(result.current.hasUnsavedEdits).toBe(true)

    act(() => result.current.discard())
    expect(result.current.draft).toEqual({
      definition: greet,
      name: 'greet',
      registered: true,
      baseline: greet,
    })
    expect(result.current.hasUnsavedEdits).toBe(false)
    expect(result.current.canUndo).toBe(false)
  })

  it('discards a draft never registered, so the next start takes the expression', () => {
    const { result } = setup()
    act(() => result.current.startFromExpression(1))
    act(() => result.current.definitionProps.setFragmentName('one'))
    expect(result.current.hasUnsavedEdits).toBe(true)

    act(() => result.current.discard())
    expect(result.current.draft.name).toBeUndefined()
    expect(result.current.hasUnsavedEdits).toBe(false)
    act(() => result.current.startFromExpression(2))
    expect(result.current.draft.definition.expression).toBe(2)
  })

  it("renames a registered fragment at once, leaving the draft's edits unsaved", () => {
    const { result, figTree, registered } = setup()
    act(() => result.current.selectProps.onSelect('greet'))
    act(() => result.current.definitionProps.setDefinition({ ...greet, description: 'Hi' }))
    act(() => result.current.definitionProps.setFragmentName('hello'))

    expect(registered()).toEqual(['shout', 'hello'])
    expect(figTree.getFragments().find(({ name }) => name === 'hello')?.description).toBeUndefined()
    expect(Object.keys(result.current.fragments)).toEqual(['shout', 'hello'])
    expect(result.current.selectProps.selected).toBe('hello')
    expect(result.current.canSave).toBe(true)
  })

  it("doesn't leave a registered fragment unnamed", () => {
    const { result } = setup()
    act(() => result.current.selectProps.onSelect('greet'))
    act(() => result.current.definitionProps.setFragmentName(undefined))
    expect(result.current.definitionProps.fragmentName).toBe('greet')
  })

  it('lists a refused save in the definition editor, and registers nothing', () => {
    const { result, registered } = setup()
    act(() => result.current.startFromExpression({ operator: 'flibble' }))
    act(() => result.current.definitionProps.setFragmentName('broken'))
    act(() => result.current.save())
    expect(registered()).not.toContain('broken')
    expect(result.current.selectProps.selected).toBeNull()
    expect(result.current.definitionProps.saveIssues).toEqual([
      expect.objectContaining({ message: strings.FT_SAVE_REFUSED, path: [] }),
    ])
  })

  it('replaces the fragments whole, unregistering a draft whose fragment is gone', () => {
    const { result, registered } = setup()
    act(() => result.current.selectProps.onSelect('greet'))
    act(() => result.current.setFragments({ shout }))
    expect(registered()).toEqual(['shout'])
    expect(result.current.selectProps.selected).toBeNull()
    expect(result.current.canSave).toBe(true)
  })
})
