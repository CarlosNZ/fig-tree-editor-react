// Every string the editor shows, in English. Each sits under the key it would
// have among json-edit-react's `translations`, and one with a variable part is
// a function of it. Operator, category and fragment names are display data
// (displayData.ts), not wording.
export const strings = {
  FT_ROOT_PATH: '(root)',
  FT_SEVERITY_ERROR: 'error',
  FT_SEVERITY_WARNING: 'warning',
  FT_SEVERITY_HINT: 'hint',
  FT_SELECT_NO_RESULTS: 'No results',
  FT_INVALID_NODE: 'invalid node', // an operator or fragment that isn't a string
  FT_SUMMARY_OPERATOR: (name: string) => `Operator: ${name}`, // a collapsed node
  FT_OPEN_TOOLBAR: 'Open toolbar', // the pencil, named apart from json-edit-react's ✎
  FT_TOOLBAR_CONFIRM: 'Done', // ✓, keeping the toolbar's changes
  FT_TOOLBAR_CANCEL: 'Cancel', // ✗, undoing them
}
