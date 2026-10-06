import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTree, coreOperators } from 'fig-tree-evaluator'
import { FigTreeEditor, type EditorStatus } from '../src'

const figTree = new FigTree({ operators: [coreOperators] })

// A host holding the expression, in StrictMode, keeping every status it is
// given
const host = (initial: unknown, props: Partial<ComponentProps<typeof FigTreeEditor>> = {}) => {
  const statuses: EditorStatus[] = []
  const written: unknown[] = []
  const Host = () => {
    const [expression, setExpression] = useState(initial)
    return (
      <FigTreeEditor
        figTree={figTree}
        expression={expression}
        setExpression={(next) => {
          written.push(next)
          setExpression(next)
        }}
        collapse={false}
        onStatusChange={(status) => statuses.push(status)}
        {...props}
      />
    )
  }
  const { container } = render(<Host />, { wrapper: StrictMode })
  const latest = () => statuses[statuses.length - 1]
  return { container, statuses, written, latest, user: userEvent.setup() }
}

// Each message as [kind, row, message, fix labels]
const summary = ({ messages }: EditorStatus) =>
  messages.map(({ kind, row, message, fixes }) => [kind, row, message, fixes.map((f) => f.label)])

describe('the status', () => {
  it('is reported as the editor mounts', () => {
    const { statuses } = host({ operator: 'if', condition: true, thn: 'Adult' })
    expect(statuses).toHaveLength(1)
    const [status] = statuses
    expect(status).toMatchObject({
      valid: false,
      counts: { errors: 1, warnings: 0, filledIn: 0 },
      editing: false,
    })
    expect(summary(status)).toEqual([
      [
        'issue',
        ['thn'],
        "'thn' is not a parameter of 'if' — did you mean 'then'?",
        ['Rename to then', 'Remove'],
      ],
    ])
    expect(status.messages[0]).toHaveProperty('issue.code', 'unknown-node-key')
  })

  it('is reported again only when its content changes', () => {
    const onStatusChange = vi.fn()
    const props = { figTree, setExpression: vi.fn(), onStatusChange }
    const { rerender } = render(<FigTreeEditor {...props} expression={{ $plus: [1, 2] }} />)
    rerender(<FigTreeEditor {...props} expression={{ $plus: [1, 2] }} />)
    expect(onStatusChange).toHaveBeenCalledTimes(1)
    rerender(<FigTreeEditor {...props} expression={{ $plus: [1, true] }} />)
    expect(onStatusChange).toHaveBeenCalledTimes(2)
    expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ valid: false }))
  })

  it('lists the values filled in from the first, and counts them, though valid', () => {
    const { statuses } = host({ operator: 'if', condition: true })
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toMatchObject({ valid: true, counts: { errors: 0, filledIn: 1 } })
    expect(summary(statuses[0])).toEqual([
      ['filledIn', ['then'], "Added 'then', which 'if' requires", ['Dismiss']],
    ])
  })

  it("gives fixes whose apply does what the area's button does", () => {
    const { latest, written } = host({ operator: 'if', condition: true, thn: 'Adult' })
    const rename = latest().messages[0].fixes[0]
    act(() => rename.apply())
    expect(written[written.length - 1]).toEqual({ operator: 'if', condition: true, then: 'Adult' })
    expect(latest()).toMatchObject({ valid: true, messages: [] })
  })

  it('gives Dismiss, which dismisses a filled-in line', () => {
    const { latest } = host({ operator: 'if', condition: true })
    act(() => latest().messages[0].fixes[0].apply())
    expect(latest().counts.filledIn).toBe(0)
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  describe('coverage', () => {
    // A division by data can fail at every stage of fig-tree's analysis
    const divide = { $divide: ['$data.a', '$data.b'] }
    // Each distinct path the findings start at
    const paths = (findings: { path: unknown }[]) =>
      [...new Set(findings.map(({ path }) => JSON.stringify(path)))].map(
        (path) => JSON.parse(path) as unknown
      )
    // The analysis is async, so its result comes in a later status
    const settled = async (latest: () => EditorStatus) => {
      await waitFor(() => expect(latest().coverage).not.toBeNull())
      return latest().coverage!
    }

    it('lists the failures with no fallback, and those a fallback catches', async () => {
      const { latest } = host({ a: divide, b: { ...divide, fallback: 0 }, c: 'x' })
      const { uncovered, covered } = await settled(latest)
      expect(uncovered.length).toBeGreaterThan(0)
      expect(paths(uncovered)).toEqual([['a']])
      expect(covered.length).toBeGreaterThan(0)
      expect(paths(covered.map(({ coveredBy }) => ({ path: coveredBy })))).toEqual([['b']])
    })

    it('is at the root, for a root node with no fallback', async () => {
      const { latest } = host(divide)
      expect(paths((await settled(latest)).uncovered)).toEqual([[]])
    })

    it('is null until the analysis settles', () => {
      const { statuses } = host(divide)
      expect(statuses[0]).toMatchObject({ valid: true, coverage: null })
    })

    it('is null while there are errors', async () => {
      const { latest } = host({ a: { $plus: [1, true] } })
      // Long enough for an analysis to have settled, had one run
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(latest()).toMatchObject({ valid: false, coverage: null })
    })

    it('is reported again when it alone changes', async () => {
      const onStatusChange = vi.fn<(status: EditorStatus) => void>()
      const props = { figTree, setExpression: vi.fn(), onStatusChange }
      const { rerender } = render(<FigTreeEditor {...props} expression={divide} />)
      await waitFor(() =>
        expect(onStatusChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ coverage: expect.objectContaining({ covered: [] }) })
        )
      )
      rerender(<FigTreeEditor {...props} expression={{ ...divide, fallback: 0 }} />)
      await waitFor(() =>
        expect(onStatusChange).toHaveBeenLastCalledWith(
          expect.objectContaining({
            valid: true,
            messages: [],
            coverage: expect.objectContaining({ uncovered: [] }),
          })
        )
      )
    })

    it('takes the analysis options', async () => {
      // Overflow counts only under strict numbers
      const product = { $multiply: [{ $length: '$data.s' }, 2] }
      const overflows = (coverage: { uncovered: { path: unknown[]; code: string }[] }) =>
        coverage.uncovered.some(
          ({ path, code }) => code === 'non-finite-result' && path.length === 0
        )
      const ordinary = host(product)
      expect(overflows(await settled(ordinary.latest))).toBe(false)
      const strict = host(product, { coverageOptions: { numbers: 'strict' } })
      expect(overflows(await settled(strict.latest))).toBe(true)
    })

    it('drops an analysis the next change overtakes', async () => {
      const onStatusChange = vi.fn<(status: EditorStatus) => void>()
      const props = { figTree, setExpression: vi.fn(), onStatusChange }
      const { rerender } = render(<FigTreeEditor {...props} expression={divide} />)
      rerender(<FigTreeEditor {...props} expression={{ ...divide, fallback: 0 }} />)
      await waitFor(() =>
        expect(onStatusChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ coverage: expect.objectContaining({ uncovered: [] }) })
        )
      )
      // The first expression's analysis was never reported
      const reported = onStatusChange.mock.calls.map(([status]) => status.coverage)
      expect(reported.filter((coverage) => (coverage?.uncovered.length ?? 0) > 0)).toEqual([])
    })
  })

  it('goes to a host that hides the messages area', () => {
    const { container, latest } = host({ operator: 'plsu' }, { messagesMaxHeight: 0 })
    expect(container.querySelector('.ft-message-container')).toBeNull()
    expect(latest().messages).toHaveLength(1)
  })

  describe('editing', () => {
    it('is reported as an edit opens and closes', async () => {
      const { statuses, user } = host({ a: 'x' })
      // Each change of `editing`, since the coverage analysis settling
      // brings a status of its own
      const editing = () =>
        statuses
          .map(({ editing }) => editing)
          .filter((open, index, all) => index === 0 || open !== all[index - 1])
      await user.dblClick(screen.getByText('"x"'))
      await waitFor(() => expect(editing()).toEqual([false, true]))
      await user.keyboard('{Escape}')
      await waitFor(() => expect(editing()).toEqual([false, true, false]))
    })

    it("stays open through the toolbar's commit and reopen", async () => {
      const { statuses, latest, user } = host({ operator: 'plus', values: [1, 2] })
      await user.click(screen.getByRole('button', { name: 'Open toolbar' }))
      await user.click(screen.getByText('Plus (+)'))
      await user.keyboard('multiply{Enter}')
      await waitFor(() => expect(latest().editing).toBe(true))
      const opened = statuses.findIndex(({ editing }) => editing)
      expect(statuses.slice(opened).every(({ editing }) => editing)).toBe(true)
      await user.click(screen.getByRole('button', { name: 'Done' }))
      await waitFor(() => expect(latest().editing).toBe(false))
    })
  })
})
