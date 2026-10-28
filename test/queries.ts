// A row's key label, found by its name, whether or not it carries a hover
// card (which repeats the name, so the label's text alone can't find it)
export const keyLabel = (name: string) => {
  const [label] = keyLabels(name)
  if (label === undefined) throw new Error(`No key label for ${name}`)
  return label
}

// Every row's key label with the name, in the tree's order
export const keyLabels = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('.jer-key-text')].filter(
    (element) =>
      (element.querySelector('.ft-hover-card-anchor')?.firstChild ?? element.firstChild)
        ?.textContent === name
  )
