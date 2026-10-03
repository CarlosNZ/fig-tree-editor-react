import { defaultTheme, type ThemeIcons } from 'json-edit-react'
import { type SVGProps } from 'react'
import { runColour, type EditorTheme } from './editorTheme'
import { type RowRun } from './runMarks'

export const Icons = {
  evaluate: (
    // https://thenounproject.com/icon/play-6552224/
    <div className="ft-icon ft-evaluate-icon">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        version="1.1"
        fill="currentColor"
        x="0px"
        y="0px"
        viewBox="0 0 170 170"
        xmlSpace="preserve"
      >
        <path d="M142.74,71.11L33.77,7.23c-5.04-2.96-11.08-2.99-16.15-0.08c-5.07,2.9-8.1,8.13-8.1,13.97v127.76  c0,5.84,3.03,11.07,8.1,13.97c2.51,1.44,5.26,2.16,8.01,2.16c2.8,0,5.59-0.75,8.14-2.24l108.97-63.88  c4.99-2.92,7.96-8.11,7.96-13.89S147.73,74.03,142.74,71.11z" />
      </svg>
    </div>
  ),
  // In the evaluate icon's place while an evaluation runs, the same size
  running: <div className="ft-icon ft-evaluate-icon ft-spinner" aria-hidden="true" />,
}

// In the evaluate icon's place after an evaluation, the same size, in the
// colour of how the row ran
const RUN_ICONS = {
  ran: <path d="M4 12.5l5 5L20 6.5" />,
  failed: <path d="M6 6l12 12M18 6L6 18" />,
}

const runIcon = (name: keyof typeof RUN_ICONS, colour: string, status: string) => (
  <div className="ft-icon ft-evaluate-icon" data-run={status} style={{ color: colour }}>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {RUN_ICONS[name]}
    </svg>
  </div>
)

// The ✓ on plain data that ran, after its value, or its key where it is a
// collection, as a reference's ▶ becomes
export const RanTick = ({ editorTheme }: { editorTheme: EditorTheme }) => (
  <span className="ft-ran-tick">{runIcon('ran', runColour('value', editorTheme), 'value')}</span>
)

// An Evaluate's icon (design, topic 7, "How it ran, in the tree"): the ▶, a
// spinner while its row runs, and after an evaluation, how the row ran: a ✓
// where it ran, and a ✕ where it failed or its fallback caught a failure. A
// row cancelled or never run keeps its ▶.
export const EvaluateIcon = ({
  running,
  mark,
  editorTheme,
}: {
  running: boolean
  mark: RowRun | undefined
  editorTheme: EditorTheme
}) => {
  if (running) return Icons.running
  if (mark === undefined) return Icons.evaluate
  const colour = runColour(mark.status, editorTheme)
  if (mark.status === 'failed' || mark.status === 'fallback')
    return runIcon('failed', colour, mark.status)
  return mark.status === 'value' ? runIcon('ran', colour, mark.status) : Icons.evaluate
}

// A comment's note icon, a speech bubble, as in the mockups (G1 and G2).
// Hidden, it keeps its width, so a comment's later lines line up with its
// first.
export const NoteIcon = ({ colour, hidden }: { colour: string; hidden?: boolean }) => (
  <svg
    className="ft-note-icon"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    style={{ color: colour, visibility: hidden ? 'hidden' : undefined }}
  >
    <path d="M5 3h14a2 2 0 012 2v10a2 2 0 01-2 2H9l-5 4v-4H5a2 2 0 01-2-2V5a2 2 0 012-2zm2 4v2h10V7H7zm0 4v2h7v-2H7z" />
  </svg>
)

/**
 * Copied (and modified) from json-edit-react's Icons.tsx, so we can render the
 * theme icons in here
 */

const ICON_TEXT_SIZE_RATIO = 1.4
export const IconSvg = ({
  scale = 1,
  viewBox = '0 0 24 24',
  fill = 'currentColor',
  children,
  ...props
  // `scale` is our size multiplier — omit SVG's own (rarely-used) `scale`
  // attribute so spreading a definition's `svgProps` can't shadow it.
}: { scale?: number } & Omit<SVGProps<SVGSVGElement>, 'scale'>): JSX.Element => {
  const size = `${ICON_TEXT_SIZE_RATIO * scale}em`
  return (
    <svg viewBox={viewBox} fill={fill} width={size} height={size} {...props}>
      {children}
    </svg>
  )
}

export const Icon = ({
  name,
  style,
  scale,
  viewBox,
}: {
  name: keyof ThemeIcons
  style?: React.CSSProperties
  scale?: number
  viewBox?: string // in place of the definition's, to crop to the glyph
}): JSX.Element => {
  const icons = defaultTheme.icons
  const def = icons?.[name]
  if (!def) return <p>NO ICON</p>
  return (
    <IconSvg
      viewBox={viewBox ?? def.viewBox}
      {...def.svgProps}
      scale={scale ?? def.scale}
      // The collapse chevron (`collection`) is positioned and animated by its
      // wrapper; it doesn't take the action icons' :hover affordance.
      className={name === 'collection' ? undefined : 'jer-icon'}
      style={style}
    >
      {def.content}
    </IconSvg>
  )
}

// ✓ and ✗, each cropped to its glyph (its stroke included), so the stylesheet
// can give both the height of the toolbar's inputs
export const IconOk = <Icon name="ok" style={{ color: 'green' }} viewBox="1 1 22 22" />
export const IconCancel = (
  <Icon name="cancel" style={{ color: 'rgb(203, 75, 22)' }} viewBox="4 4 16 16" />
)
