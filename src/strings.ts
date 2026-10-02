// A count of each severity, in the messages area's header and a collapsed
// row's summary
const countOf = (one: string, many: string) => (count: number) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`
const errors = countOf('error', 'errors')
const warnings = countOf('warning', 'warnings')
const hints = countOf('hint', 'hints')

// Every string the editor shows, in English. Each sits under the key it would
// have among json-edit-react's `translations`, and one with a variable part is
// a function of it. Operator, category and fragment names are display data
// (displayData.ts), not wording.
export const strings = {
  FT_ROOT_PATH: '(root)',
  FT_MESSAGES: 'Messages', // the messages area's header
  FT_REVEAL_ROW: 'Show in the tree', // a message's path, which reveals its row
  // The messages area's quick fixes
  FT_FIX_REMOVE: 'Remove',
  FT_FIX_RENAME: (name: string) => `Rename to ${name}`,
  FT_FIX_CHANGE: (name: string) => `Change to ${name}`,
  FT_DISMISS: 'Dismiss', // a filled-in line
  FT_DISMISS_ALL: 'Dismiss all', // every filled-in line, from the header
  FT_COUNT_ERRORS: errors,
  FT_COUNT_WARNINGS: warnings,
  FT_COUNT_HINTS: hints,
  FT_COUNT_FILLED_IN: (count: number) => `${count} added`,
  FT_SEVERITY_ERROR: 'error',
  FT_SEVERITY_WARNING: 'warning',
  FT_SEVERITY_HINT: 'hint',
  FT_FILLED_IN: 'added', // a filled-in line's label, beside the severities
  // A filled-in line: a value the editor added to an expression it was given
  FT_FILLED_IN_OPERATOR: (parameter: string, operator: string) =>
    `Added '${parameter}', which '${operator}' requires`,
  FT_FILLED_IN_FRAGMENT: (parameter: string, fragment: string) =>
    `Added '${parameter}', which fragment '${fragment}' requires`,
  FT_SELECT_NO_RESULTS: 'No results',
  FT_INVALID_NODE: 'invalid node', // an operator or fragment that isn't a string
  FT_SUMMARY_OPERATOR: (name: string) => `Operator: ${name}`, // a collapsed node
  FT_SUMMARY_FRAGMENT: (name: string) => `Fragment: ${name}`,
  FT_SUMMARY_SHORTHAND: (name: string) => `Shorthand: ${name}`, // with its `$`
  FT_SUMMARY_LITERAL: 'Literal',
  FT_SUMMARY_VARS: (count: number) => (count === 1 ? '1 var' : `${count} vars`),
  FT_ITEMS: (count: number) => (count === 1 ? '1 item' : `${count} items`), // a plain collection
  // The prompt in a ＋'s typed key, where the editor knows what the key names
  FT_KEY_NEW_VAR: 'New variable name', // a vars block
  FT_KEY_NEW_BRANCH: 'Add branch name', // `match.branches`
  FT_KEY_NEW_TOKEN: 'Add token name', // `buildString.substitutions`, as an object
  FT_KEY_NEW_QUERY: 'URL query name', // `http.query`
  FT_KEY_NEW_HEADER: 'Add header', // `http.headers`, `graphQL.headers`
  FT_KEY_NEW_GRAPHQL_VARIABLE: 'New variable', // `graphQL.variables`
  // A collapsed row's summary, then the issues on and beneath it
  FT_SUMMARY_ISSUES: (summary: string, issues: string) => `${summary} · ${issues}`,
  FT_ISSUE_COUNTS: (errorCount: number, warningCount: number) =>
    [errorCount > 0 && errors(errorCount), warningCount > 0 && warnings(warningCount)]
      .filter(Boolean)
      .join(' · '),
  FT_FLAG_MORE: (count: number) => `+${count}`, // a row's other issues, after its flag
  FT_FRAGMENT: 'Fragment', // a fragment call's header, without a display name
  FT_FRAGMENT_SUFFIX: ' · fragment', // after a fragment's display name
  FT_OPEN_TOOLBAR: 'Open toolbar', // the pencil, named apart from json-edit-react's ✎
  FT_EVALUATE: 'Evaluate', // a reference's ▶, and the root's bar
  FT_CANCEL_EVALUATION: 'Cancel evaluation', // the same, while it runs
  // Why an Evaluate is disabled
  FT_EVALUATE_BLOCKED: (count: number) =>
    count === 1 ? 'Fix the error to evaluate this' : `Fix ${count} errors to evaluate this`,
  FT_EVALUATE_NO_INPUT: "It's inside an iterator with no input to go over",
  FT_EVALUATE_NO_MAP: 'Evaluating inside an iterator needs the `map` operator',

  // A row's card after an evaluation, saying how it ran. Paths arrive in
  // backticks, shown as code.
  FT_RUN_VALUE: 'Ran',
  FT_RUN_VALUE_PER_ELEMENT: 'Ran once per element',
  FT_RUN_CACHED: (ran: string) => `${ran}, cached result`,
  FT_RUN_FAILED: 'Failed',
  FT_RUN_FALLBACK: 'Fallback used',
  FT_RUN_FALLBACK_PER_ELEMENT: 'Fallback used once per element',
  FT_RUN_CANCELLED: 'Cancelled',
  FT_RUN_SKIPPED: 'Never ran',
  FT_RUN_TIME: (ms: number) =>
    ms < 1 ? '<1ms' : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`,
  // Where a failure is from, where that isn't the row itself
  FT_RUN_FAILURE_AT: (path: string, message: string) => `At \`${path}\`: ${message}`,
  FT_RUN_FAILURE_IN_FRAGMENT: (fragment: string, path: string, message: string) =>
    `In fragment \`${fragment}\` at \`${path}\`: ${message}`,
  FT_RUN_FAILURE_AT_IN_FRAGMENT: (at: string, fragment: string, path: string, message: string) =>
    `At \`${at}\`, in fragment \`${fragment}\` at \`${path}\`: ${message}`,
  FT_RUN_FALLBACK_FAILED: (message: string) => `The fallback also failed: ${message}`,
  FT_RUN_ALSO_FAILED: (message: string) => `Also failed: ${message}`,
  FT_RUN_CAUGHT: (message: string) => `Caught: ${message}`,
  FT_RUN_NULL: (path: string, message: string) => `\`${path}\` is null: ${message}`,
  // An element's line, inside an iterator
  FT_RUN_ELEMENT_FAILED: (message: string) => `Failed: ${message}`,
  FT_RUN_ELEMENT_CAUGHT: (message: string) => `, caught: ${message}`, // after its value
  FT_RUN_MORE: (count: number) => `+${count} more`, // elements beyond those listed
  // Why a row didn't run
  FT_RUN_WHEN_NEEDED: 'Evaluated only when needed',
  FT_RUN_FALLBACK_UNUSED: 'Not needed: the node succeeded',
  FT_RUN_UNREAD: 'Never read',
  FT_RUN_RACE: 'Stopped once the answer was known',
  FT_RUN_TIMEOUT: 'Stopped by the timeout',
  FT_RUN_STOPPED: 'Stopped before it finished',
  FT_RUN_INSIDE_SKIPPED: (path: string) => `Inside \`${path}\`, which didn't run`,
  FT_RUN_INSIDE_CANCELLED: (path: string) => `Inside \`${path}\`, which was stopped`,
  FT_RUN_NOT_REACHED: 'Not reached',
  FT_RUN_NOT_EVALUATED: 'Not evaluated',

  // The conversion buttons
  FT_TO_SHORTHAND: 'To shorthand',
  FT_TO_POSITIONAL: 'To positional',
  FT_TO_FULL: 'To full',
  FT_TO_REFERENCE: 'To reference',
  FT_TO_GET_NODE: 'To get node',
  FT_TOOLBAR_CONFIRM: 'Done', // ✓, keeping the toolbar's changes
  FT_TOOLBAR_CANCEL: 'Cancel', // ✗, undoing them

  // The toolbar's node-type switch
  FT_NODE_TYPE_OPERATOR: 'Operator',
  FT_NODE_TYPE_FRAGMENT: 'Fragment',
  FT_NODE_TYPE_VALUE: 'Value',

  // The operator and fragment pickers
  FT_PICKER_PLACEHOLDER: 'Search operators, or type a symbol',
  FT_PICKER_NOT_VALID: 'Not valid here',
  FT_PICKER_NOT_VALID_REASON: (returns: string, takes: string) =>
    `Returns ${returns}; this position takes ${takes}`,
  FT_FRAGMENT_PICKER_PLACEHOLDER: 'Search fragments',
  FT_NO_FRAGMENTS: 'No fragments registered',
  FT_LITERAL_DESCRIPTION: 'Its content, as plain data: nothing inside it is evaluated',

  // The type dropdown's own entries, which json-edit-react shows as they are
  FT_TYPE_OPTION: 'Option', // a literal union's values
  FT_TYPE_DATA: 'Data',
  FT_TYPE_VARIABLE: 'Variable',
  FT_TYPE_ELEMENT: 'Element',
  FT_TYPE_PARAMETER: 'Parameter',
  FT_TYPE_OPERATOR: 'Operator',
  FT_TYPE_FRAGMENT: 'Fragment',

  // Adding parameters
  FT_ADD_PARAMETER: 'Add parameter',
  FT_ADD_GROUP_PARAMETERS: 'Parameters',
  FT_ADD_GROUP_MODIFIERS: 'Modifiers',
  FT_ADD_REQUIRED: 'required',
  FT_DYNAMIC_ARGUMENTS: 'Dynamic arguments',
  FT_DYNAMIC_ARGUMENTS_DESCRIPTION:
    'Compute the arguments with a reference or a node, in place of these',
  FT_STATIC_ARGUMENTS: 'Static arguments',
  FT_STATIC_ARGUMENTS_DESCRIPTION: 'Enter the arguments one by one, in place of this',
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
  FT_CARD_RESPELL: (keys: string, spelling: string) =>
    `${keys}-click to write it as \`${spelling}\``,
  FT_CARD_INSTANCE_SETS: (settings: string, operator: string) =>
    `This application sets ${settings} on every ${operator} node that doesn't set its own`,
}
