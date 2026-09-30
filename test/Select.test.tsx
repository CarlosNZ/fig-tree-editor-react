import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select, type OptionGroup, type SelectOption } from '../src/Select'

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

  describe('with groups', () => {
    const groups: OptionGroup<string>[] = [
      {
        label: 'Arithmetic',
        options: [
          { label: 'Plus (+)', value: 'plus', keywords: 'plus +' },
          { label: 'Multiply (*)', value: 'multiply', keywords: 'multiply *' },
        ],
      },
      {
        label: 'Comparison',
        options: [
          { label: 'Greater than (>)', value: 'greaterThan', keywords: 'greaterThan >' },
          { label: 'Equal (=)', value: 'equal', keywords: 'equal =', disabled: true },
          { label: 'Not equal (!=)', value: 'notEqual', keywords: 'notEqual !=' },
        ],
      },
    ]
    const setupGroups = (props: Partial<Parameters<typeof Select<string>>[0]> = {}) =>
      setup({ options: undefined, optionGroups: groups, ...props })
    const highlighted = () =>
      [...document.querySelectorAll('.ft-select-highlighted')].map((element) => element.textContent)

    it('moves through the options in display order, across groups', async () => {
      const { user, setSelected } = setupGroups()
      await user.click(screen.getByText('Pick one'))
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
      expect(highlighted()).toEqual(['Greater than (>)'])
      await user.keyboard('{Enter}')
      expect(setSelected).toHaveBeenCalledWith(groups[1].options[0])
    })

    it("doesn't choose a group heading", async () => {
      const { user, setSelected } = setupGroups()
      await user.click(screen.getByText('Pick one'))
      await user.click(screen.getByText('Arithmetic'))
      expect(setSelected).not.toHaveBeenCalled()
      expect(screen.getByText('Plus (+)')).toBeInTheDocument()
    })

    it('shows a disabled option, but skips it and ignores a click on it', async () => {
      const { user, setSelected } = setupGroups()
      await user.click(screen.getByText('Pick one'))
      await user.click(screen.getByText('Equal (=)'))
      expect(setSelected).not.toHaveBeenCalled()
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
      expect(highlighted()).toEqual(['Not equal (!=)'])
      await user.keyboard('{ArrowUp}')
      expect(highlighted()).toEqual(['Greater than (>)'])
    })

    it('highlights the first match that can be chosen after each keystroke', async () => {
      const { user, setSelected } = setupGroups()
      await user.click(screen.getByText('Pick one'))
      await user.keyboard('=')
      // `Equal (=)` matches first, but is disabled
      expect(highlighted()).toEqual(['Not equal (!=)'])
      await user.keyboard('{Backspace}*{Enter}')
      expect(setSelected).toHaveBeenCalledWith(groups[0].options[1])
    })

    it('highlights nothing when it opens, so Enter chooses nothing', async () => {
      const { user, setSelected } = setupGroups({ selected: 'plus' })
      await user.click(screen.getByText('Plus (+)'))
      expect(highlighted()).toEqual([])
      await user.keyboard('{Enter}')
      expect(setSelected).not.toHaveBeenCalled()
    })

    it('opens on the option it is told to highlight', async () => {
      const { user, setSelected } = setupGroups({ highlighted: 'multiply', startOpen: true })
      expect(highlighted()).toEqual(['Multiply (*)'])
      await user.keyboard('{Enter}')
      expect(setSelected).toHaveBeenCalledWith(groups[0].options[1])
    })

    it('searches the keywords and the group labels, as well as the labels', async () => {
      const { user } = setupGroups()
      await user.click(screen.getByText('Pick one'))
      await user.keyboard('greatert')
      expect(screen.getByText('Greater than (>)')).toBeInTheDocument()
      expect(screen.queryByText('Plus (+)')).not.toBeInTheDocument()
      await user.clear(screen.getByRole('textbox'))
      await user.keyboard('compar')
      expect(screen.getByText('Not equal (!=)')).toBeInTheDocument()
      expect(screen.queryByText('Plus (+)')).not.toBeInTheDocument()
      await user.clear(screen.getByRole('textbox'))
      await user.keyboard('gt')
      expect(screen.getByText('No results')).toBeInTheDocument()
    })

    it("shows the selected option's label when closed, without its hint", async () => {
      const hinted = [{ label: 'Plus (+)', hint: 'select again', value: 'plus' }]
      const { user } = setup({ options: hinted, selected: 'plus' })
      expect(screen.getByText('Plus (+)')).toHaveTextContent(/^Plus \(\+\)$/)
      await user.click(screen.getByText('Plus (+)'))
      expect(screen.getByText('select again')).toBeInTheDocument()
      // The hint isn't searched
      await user.keyboard('again')
      expect(screen.getByText('No results')).toBeInTheDocument()
    })
  })

  it('shows a group without a label under no heading', async () => {
    const { user } = setup({
      options: undefined,
      optionGroups: [
        { options: [options[0]] },
        { label: 'Not valid here', options: [{ ...options[1], disabled: true }] },
      ],
    })
    await user.click(screen.getByText('Pick one'))
    const headings = [...document.querySelectorAll('.ft-select-group-label')]
    expect(headings.map((heading) => heading.textContent)).toEqual(['Not valid here'])
    expect(screen.getByText('Addition')).toBeInTheDocument()
  })

  it('shows its own empty text when it has no options, and "No results" when none match', async () => {
    const { user } = setup({ options: [], emptyText: 'Nothing registered' })
    await user.click(screen.getByText('Pick one'))
    expect(screen.getByText('Nothing registered')).toBeInTheDocument()
    await user.keyboard('x')
    expect(screen.getByText('Nothing registered')).toBeInTheDocument()
  })

  it('shows "No results" where it has options but none match', async () => {
    const { user } = setup({ emptyText: 'Nothing registered' })
    await user.click(screen.getByText('Pick one'))
    await user.keyboard('zzz')
    expect(screen.getByText('No results')).toBeInTheDocument()
  })

  it('marks the closed trigger as a list with a chevron, kept out of its label', () => {
    setup({ selected: '+' })
    const trigger = screen.getByText('Addition').closest('.ft-select-trigger')!
    expect(trigger.querySelector('.ft-select-chevron svg')).toBeInTheDocument()
    expect(trigger.querySelector('.ft-select-chevron')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Addition')).toHaveClass('ft-select-trigger-label')
  })

  it('keeps the closed width when it opens', async () => {
    const { user } = setup()
    const trigger = screen.getByText('Pick one').closest<HTMLElement>('.ft-select-trigger')!
    trigger.getBoundingClientRect = () => ({ width: 123 }) as DOMRect
    await user.click(trigger)
    expect(screen.getByRole('textbox')).toHaveStyle({ width: '123px' })
  })

  describe('without search', () => {
    it('keeps showing the current value while open, and lists every option', async () => {
      const { user } = setup({ search: false, selected: '-' })
      await user.click(screen.getByText('Subtraction'))
      const trigger = document.querySelector('.ft-select-trigger')!
      expect(trigger).toHaveTextContent('Subtraction')
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(screen.queryByRole('textbox')).toBeNull()
      const listed = [...document.querySelectorAll('.ft-select-option-title')].map(
        (option) => option.textContent
      )
      expect(listed).toEqual(['Addition', 'Subtraction', 'Multiplication'])
      expect(document.querySelector('.ft-select-selected')).toHaveTextContent('Subtraction')
    })

    it('takes the keys on its trigger, and closes when the trigger is clicked again', async () => {
      const { user, setSelected } = setup({ search: false })
      await user.click(screen.getByText('Pick one'))
      expect(document.querySelector('.ft-select-trigger')).toHaveFocus()
      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
      expect(setSelected).toHaveBeenCalledWith(options[1])
      await user.click(screen.getByText('Pick one'))
      await user.click(screen.getByText('Pick one'))
      expect(screen.queryByText('Addition')).toBeNull()
    })
  })

  it('opens from the keyboard, keeping the key from what surrounds it', async () => {
    const outer = vi.fn()
    const setSelected = vi.fn()
    render(
      <div onKeyDown={outer}>
        <Select
          options={options}
          selected={null}
          setSelected={setSelected}
          placeholder="Pick one"
          className="test"
          search
        />
      </div>
    )
    const user = userEvent.setup()
    screen.getByText('Pick one').closest<HTMLElement>('.ft-select-trigger')!.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('Addition')).toBeInTheDocument()
    expect(outer).not.toHaveBeenCalled()
  })
})
