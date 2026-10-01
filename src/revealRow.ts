import { toPathString, type CollapseState } from 'json-edit-react'
import { type Path } from './paths'

// Revealing a row (design, topic 7, "The messages area"): it and its collapsed
// ancestors open, through json-edit-react's handle (a value row has nothing to
// open, and json-edit-react ignores it), then, once the opening has settled,
// the row scrolls to the middle of the window, clear of anything fixed at its
// edges, unless it is in view already, so revealing rows one after another
// doesn't move the page under the pointer.
//
// json-edit-react's rows carry no mark of their path, so the row is found by
// the editor's own components, which mark theirs (`rowMark`). Every row with
// an error or a warning has one, and any other, such as a plain value with a
// hint, reveals the nearest ancestor that has one.

const ROW_PATH = 'data-ft-path'

export const rowMark = (path: Path) => ({ [ROW_PATH]: toPathString(path) })

export const revealRow = (
  container: HTMLElement,
  path: Path,
  collapse: (states: CollapseState[]) => void
) => {
  collapse(
    [...path, null].map((_, length) => ({
      path: path.slice(0, length),
      collapsed: false,
      includeChildren: false,
    }))
  )
  whenSettled(
    () => findRow(container, path),
    (line) => {
      if (!inView(line)) line.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  )
}

// The line of the row, or of its nearest marked ancestor: a value row's line,
// a collection's header line, a node's header; the whole editor where nothing
// is marked
const findRow = (container: HTMLElement, path: Path) => {
  const marked = new Map(
    [...container.querySelectorAll<HTMLElement>(`[${ROW_PATH}]`)].map((element) => [
      element.getAttribute(ROW_PATH),
      element,
    ])
  )
  for (let length = path.length; length >= 0; length--) {
    const element = marked.get(toPathString(path.slice(0, length)))
    if (element) return lineOf(element)
  }
  return container
}

const inView = (element: HTMLElement) => {
  const { top, bottom } = element.getBoundingClientRect()
  return top >= 0 && bottom <= window.innerHeight
}

const lineOf = (element: HTMLElement) =>
  element.closest<HTMLElement>('.jer-value-main-row') ??
  (element.classList.contains('ft-flag-line')
    ? element
        .closest('.jer-collection-component')
        ?.querySelector<HTMLElement>(':scope > .jer-collection-header-row')
    : (element.firstElementChild as HTMLElement | null)) ??
  element

// Acts once the row has stopped moving, as the rows above it finish opening,
// or after a second at most. A row that appears only as its ancestors open is
// found as it does.
const whenSettled = (find: () => HTMLElement, act: (element: HTMLElement) => void) => {
  let last: number | undefined
  let still = 0
  let frames = 0
  const step = () => {
    const element = find()
    const { top } = element.getBoundingClientRect()
    still = top === last ? still + 1 : 0
    last = top
    if (still >= SETTLED_FRAMES || ++frames > MAX_FRAMES) act(element)
    else requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

const SETTLED_FRAMES = 2
const MAX_FRAMES = 60
