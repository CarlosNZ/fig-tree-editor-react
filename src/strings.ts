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

  // The operator picker
  FT_PICKER_PLACEHOLDER: 'Search operators, or type a symbol',
  FT_PICKER_NOT_VALID: 'Not valid here',
  FT_PICKER_NOT_VALID_REASON: (returns: string, takes: string) =>
    `Returns ${returns}; this position takes ${takes}`,
  FT_PICKER_TOGGLE_HINT: (name: string) => `⇄ select again to write as ${name}`,
  FT_LITERAL_DESCRIPTION: 'Its content, as plain data: nothing inside it is evaluated',

  // Adding parameters
  FT_ADD_PARAMETER: 'Add parameter',
  FT_ADD_GROUP_PARAMETERS: 'Parameters',
  FT_ADD_GROUP_MODIFIERS: 'Modifiers',
  FT_ADD_REQUIRED: 'required',
  FT_ARGUMENTS: "The fragment's arguments",
  FT_MODIFIER_COMMENT: 'A note, never evaluated',
  FT_MODIFIER_FALLBACK: 'The value to use if this node fails',
  FT_MODIFIER_USE_CACHE: "Cache this node's result",
  FT_MODIFIER_VARS: 'Named values for this node and everything inside it',
  FT_NEW_COMMENT: 'Comment...', // a new `//`

  // What a type admits, in words
  FT_TYPE_ANY: 'anything',
  FT_TYPE_STRING: 'a string',
  FT_TYPE_NUMBER: 'a number',
  FT_TYPE_INTEGER: 'an integer',
  FT_TYPE_BOOLEAN: 'a boolean',
  FT_TYPE_ARRAY: 'an array',
  FT_TYPE_OBJECT: 'an object',
  FT_TYPE_NULL: 'null',
  FT_TYPE_ONE_OF: (values: string) => `one of ${values}`,
  FT_LIST_OR: 'or', // the last two items of a list of choices
}
