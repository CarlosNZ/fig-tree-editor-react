import { StringDisplay, toPathString, type CustomComponentProps } from 'json-edit-react'
import { type ComponentConfig } from './customNodeDefinitions'
import { NoteIcon } from './Icons'

// A comment's text (design, topic 5, "Comments"): a string `//`, or one line
// of an array of them, as a note rather than a string. It is json-edit-react's
// own string display, so double-click and Cmd-click open it for editing in
// json-edit-react's input, with its quotes off, since json-edit-react writes
// them as text, and never cut short, since a note is read whole. The theme
// draws the note's block around it, and the note's icon leads its first line.
export const CommentLine = (props: CustomComponentProps<ComponentConfig>) => {
  const { componentProps, nodeData, canEdit, getStyles } = props
  const { editorTheme } = componentProps!
  // A line of a comment of lines has its index as its key
  const first = typeof nodeData.key !== 'number' || nodeData.key === 0
  return (
    <span className="ft-comment">
      <NoteIcon colour={editorTheme.commentBlock} hidden={!first} />
      <StringDisplay
        nodeData={nodeData}
        styles={{ ...getStyles('string', nodeData), color: editorTheme.comment }}
        pathString={toPathString(nodeData.path)}
        showStringQuotes={false}
        stringTruncateLength={Infinity}
        canEdit={canEdit}
        setIsEditing={props.setIsEditing}
        translate={props.translate}
        showIconTooltips={props.showIconTooltips}
      />
    </span>
  )
}
