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
  FT_SUMMARY_FRAGMENT: (name: string) => `Fragment: ${name}`,
  FT_FRAGMENT: 'Fragment', // a fragment call's header, without a display name
  FT_FRAGMENT_SUFFIX: ' · fragment', // after a fragment's display name
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

  // The type dropdown's own entries, which json-edit-react shows as they are
  FT_TYPE_OPTION: 'Option', // a literal union's values
  FT_TYPE_DATA: 'Data',
  FT_TYPE_VARIABLE: 'Variable',
  FT_TYPE_ELEMENT: 'Element',
  FT_TYPE_PARAMETER: 'Parameter',
  FT_TYPE_OPERATOR: 'Operator',

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
  FT_LIST_AND: 'and', // the last two items of a list

  // A parameter's hover card. Names arrive in backticks, shown as code.
  FT_CARD_REQUIRED: 'required',
  FT_CARD_OPTIONAL: 'optional',
  FT_CARD_TAKES: (type: string) => `takes ${type}`,
  FT_CARD_ELEMENTS: (constraints: string) => `Elements: ${constraints}`,
  FT_CARD_EXACTLY: (length: number) => `exactly ${length}`,
  FT_CARD_ALL: (types: string) => `all ${types}`,
  FT_CARD_SHAPE: (fields: string) => `each an object with ${fields}`,
  FT_TYPES: {
    any: 'anything',
    string: 'strings',
    number: 'numbers',
    integer: 'integers',
    boolean: 'booleans',
    array: 'arrays',
    object: 'objects',
    null: 'nulls',
  },
  FT_CARD_DEFAULT: (value: string) => `Default: ${value}`,
  FT_CARD_DEFAULT_HERE: (value: string, own: string | undefined) =>
    own === undefined
      ? `Default here: ${value} (set by this application)`
      : `Default here: ${value} (set by this application; FigTree's is ${own})`,
  FT_CARD_EVALUATION_DATA: 'the evaluation data', // `get.from`'s default
  FT_CARD_EVALUATED: (when: string) => `Evaluated: ${when}`,
  FT_CARD_PER_ELEMENT: (over: string, element: string, index: string) =>
    `once for each element of ${over}, with ${element} and ${index} available`,
  FT_CARD_EVALUATION: {
    lazy: 'only when needed',
    race: 'all at once; stops as soon as the answer is known',
    lazyElements: 'each only when needed, in order',
    lazyEntries: 'only the matching entry',
    structural: "a name, not an expression, so it can't be computed",
  },
  FT_CARD_IF_NULL: (what: string) => `If null: ${what}`,
  FT_CARD_NULL_FALSE: 'counts as false',
  FT_CARD_NULL_ELEMENT_FALSE: 'a null element counts as false',
  FT_CARD_NULL_UNSET: "means 'not set', so the default applies",
  FT_CARD_NULL_UNSET_ONLY: "means 'not set'", // an optional parameter with no default
  FT_CARD_NULL_PROPAGATES: 'the result is null',
  FT_CARD_NULL_VALUE: 'null is used as a value',
  FT_CARD_NULL_ERROR: 'an error',
  FT_CARD_NULL_ELEMENT_PROPAGATES: 'a null element makes the result null',
  FT_CARD_NULL_ELEMENTS_ACCEPTED: 'null elements are accepted',
  FT_CARD_UNLESS: (what: string, replacement: string) => `${what} unless ${replacement} is set`,
  FT_CARD_NULL_CONDITIONAL: (selector: string, cases: string, then: string, otherwise: string) =>
    `if ${selector} is ${cases}, ${then}; otherwise ${otherwise}`,
  FT_CARD_REPLACES: (targets: string) => `Used in place of a null in ${targets}`,
  FT_CARD_INSTANCE_SETS: (settings: string, operator: string) =>
    `This application sets ${settings} on every ${operator} node that doesn't set its own`,
}
