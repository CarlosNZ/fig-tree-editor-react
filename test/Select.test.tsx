import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select, type SelectOption } from '../src/Select'

const options: SelectOption<string>[] = [
  { label: 'Addition', value: '+' },
  { label: 'Subtraction', value: '-' },
  { label: 'Multiplication', value: '*' },
]

const setup = (props: Partial<Parameters<typeof Select<string>>[0]> = {}) => {
  const setSelected = vi.fn()
  render(
    <Select
      options={options}
      selected={null}
      setSelected={setSelected}
      placeholder="Pick one"
      className="test"
      search
      {...props}
    />
  )
  return { setSelected, user: userEvent.setup() }
}

describe('Select', () => {
  it('shows the placeholder until opened', async () => {
    const { user } = setup()
    expect(screen.getByText('Pick one')).toBeInTheDocument()
    expect(screen.queryByText('Addition')).not.toBeInTheDocument()

    await user.click(screen.getByText('Pick one'))
    expect(screen.getByText('Addition')).toBeInTheDocument()
  })

  it('filters options by the search text', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Pick one'))
    await user.keyboard('tion')
    expect(screen.getByText('Addition')).toBeInTheDocument()
    expect(screen.getByText('Multiplication')).toBeInTheDocument()

    await user.keyboard('{Backspace>4/}mul')
    expect(screen.queryByText('Addition')).not.toBeInTheDocument()
    expect(screen.getByText('Multiplication')).toBeInTheDocument()
  })

  it('selects the highlighted option with the keyboard, and closes', async () => {
    const { user, setSelected } = setup()
    await user.click(screen.getByText('Pick one'))
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(setSelected).toHaveBeenCalledWith(options[1])
    expect(screen.queryByText('Addition')).not.toBeInTheDocument()
  })

  it('closes on Escape without selecting', async () => {
    const { user, setSelected } = setup()
    await user.click(screen.getByText('Pick one'))
    await user.keyboard('{Escape}')
    expect(setSelected).not.toHaveBeenCalled()
    expect(screen.queryByText('Addition')).not.toBeInTheDocument()
  })
})
