import { type CustomComponentProps } from 'json-edit-react'
import { brokenIssue, issuesAt } from './attachIssues'
import { rowAt, type RowKind } from './classify'
import { type ComponentConfig } from './customNodeDefinitions'
import { DisplayBar, type HeaderDisplay } from './DisplayBar'
import { type FragmentDisplay } from './displayData'
import { type EditorTheme } from './editorTheme'
import { withoutFilteredRows } from './nodeRows'
import { strings } from './strings'

type FragmentKind = Extract<RowKind, { kind: 'fragment' }>

// A full fragment call (design, topic 1, "Full fragment calls";
// docs-dev/v3-node-anatomy.md, section 2), anchored on the call's own object:
// the DisplayBar, then the call's rows, less the `fragment` row, which the
// header shows. Static arguments are a flattened payload, so they show as the
// call's own rows; dynamic ones are a `parameters` row with its key.
//
// TO-DO: the toolbar and its two editors (plan, 7.2).
export const Fragment = ({
  componentProps,
  nodeData,
  children,
}: CustomComponentProps<ComponentConfig>) => {
  const { classification, displayData, issues, editorTheme } = componentProps!
  const { path } = nodeData
  const kind = rowAt(classification, path)?.kind as FragmentKind
  // An unregistered name is looked up nowhere, since it may be anything
  const hints = kind.registered ? displayData.fragments[kind.name!] : undefined

  return (
    <div className="ft-node">
      <DisplayBar
        name={kind.name}
        display={fragmentHeader(hints, editorTheme)}
        card={hints?.description === undefined ? [] : [hints.description]}
        broken={brokenIssue(issuesAt(issues, path))}
        editorTheme={editorTheme}
      />
      {withoutFilteredRows(children, classification, path)}
    </div>
  )
}

// A fragment's header (topic 3, "Kinds"): its `FragmentHints`, where it has
// them. The button's name already shows the fragment's name, so a fragment
// with no display name shows "Fragment" alone, and one with no colours takes
// the editor's fragment colours, as does a call to no registered fragment.
const fragmentHeader = (
  hints: FragmentDisplay | undefined,
  editorTheme: EditorTheme
): HeaderDisplay => ({
  displayName: hints?.displayName ?? strings.FT_FRAGMENT,
  suffix: hints?.displayName === undefined ? undefined : strings.FT_FRAGMENT_SUFFIX,
  docUrl: hints?.docUrl,
  backgroundColor: hints?.backgroundColor ?? editorTheme.fragmentBackground,
  textColor: hints?.textColor ?? editorTheme.fragmentText,
})
