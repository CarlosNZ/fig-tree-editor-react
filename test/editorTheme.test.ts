import { describe, expect, it } from 'vitest'
import { defaultEditorTheme, layerTheme, mergeEditorTheme } from '../src/editorTheme'

describe('editor theme', () => {
  it("merges the host's values over the defaults", () => {
    expect(mergeEditorTheme({ refData: 'purple' })).toEqual({
      ...defaultEditorTheme,
      refData: 'purple',
    })
    expect(mergeEditorTheme()).toEqual(defaultEditorTheme)
  })

  it("layers the host's json-edit-react theme over the editor's", () => {
    const host = { string: 'red' }
    const [editorLayer, ...rest] = layerTheme([host, { number: 'blue' }]) as unknown[]
    expect(editorLayer).toHaveProperty('styles')
    expect(rest).toEqual([host, { number: 'blue' }])
    expect(layerTheme(host)).toEqual([editorLayer, host])
    expect(layerTheme(undefined)).toBe(editorLayer)
  })
})
