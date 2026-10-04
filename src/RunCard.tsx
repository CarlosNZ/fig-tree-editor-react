import { Fragment } from 'react'
import { type FigTreeError } from 'fig-tree-evaluator'
import { compactJson } from './compactJson'
import { runText, type EditorTheme } from './editorTheme'
import { withCode } from './HoverCard'
import { displayPath, samePath, type Path } from './paths'
import { type NotRunReason, type RowRun, type RunInstance } from './runMarks'
import { strings } from './strings'

// A row's card after an evaluation (design, topic 7, "How it ran, in the
// tree"), in place of its usual lines until the marks go: how the row ran, in
// its colour, with the time; then its value, or inside an iterator a line per
// element; its failure, where that came from, and a failed fallback's; what a
// fallback caught; why it didn't run; and on the evaluated row, the nulls
// failures left in its value. A value is compact JSON, strings quoted, cut
// short where it runs past three lines, since a card can't scroll and the
// host has it whole.
export const RunCard = ({ mark, editorTheme }: { mark: RowRun; editorTheme: EditorTheme }) => {
  const { path, status, runs, perElement, reason, nulls } = mark
  const time = runs.reduce<number | undefined>(
    (total, { elapsed }) => (elapsed === undefined ? total : (total ?? 0) + elapsed),
    undefined
  )
  const [only] = runs
  const elements = perElement && runs.some((run) => run.status !== 'skipped')
  return (
    <>
      <span
        className="ft-hover-card-line ft-run-status"
        style={{ color: runText(status, editorTheme) }}
      >
        {headline(mark)}
        {time !== undefined && status !== 'skipped' && (
          <span className="ft-run-time"> · {strings.FT_RUN_TIME(time)}</span>
        )}
      </span>
      {reason && <Line text={reasonText(reason)} />}
      {elements && <Elements runs={runs} editorTheme={editorTheme} />}
      {!elements && (only?.status === 'value' || only?.status === 'fallback') && (
        <span className="ft-hover-card-line ft-run-value">
          {compactJson(only.value, VALUE_LIMIT)}
        </span>
      )}
      {!elements && only?.status === 'failed' && <Failure run={only} row={path} />}
      {!elements && only?.status === 'fallback' && only.error && (
        <Line text={strings.FT_RUN_CAUGHT(only.error.message)} />
      )}
      {nulls.map((failure, index) => (
        <Line
          key={index}
          text={strings.FT_RUN_NULL(
            displayPath(failure.holePath!.slice(path.length)),
            failure.message
          )}
        />
      ))}
    </>
  )
}

// Enough of a value to fill three lines, which the stylesheet cuts it to,
// and of an element's, to fill one
export const VALUE_LIMIT = 300
const ELEMENT_LIMIT = 100
const ELEMENT_LINES = 10

const Line = ({ text }: { text: string }) => (
  <span className="ft-hover-card-line">{withCode(text)}</span>
)

const headline = ({ status, runs, perElement }: RowRun) => {
  switch (status) {
    case 'value': {
      const ran = perElement ? strings.FT_RUN_VALUE_PER_ELEMENT : strings.FT_RUN_VALUE
      const values = runs.filter((run) => run.status === 'value')
      return values.every(({ cached }) => cached) ? strings.FT_RUN_CACHED(ran) : ran
    }
    case 'fallback':
      return perElement ? strings.FT_RUN_FALLBACK_PER_ELEMENT : strings.FT_RUN_FALLBACK
    case 'failed':
      return strings.FT_RUN_FAILED
    case 'cancelled':
      return strings.FT_RUN_CANCELLED
    case 'skipped':
      return strings.FT_RUN_SKIPPED
  }
}

const reasonText = (reason: NotRunReason) => {
  const where = (path: Path) => displayPath(path) || strings.FT_ROOT_PATH
  switch (reason.kind) {
    case 'whenNeeded':
      return strings.FT_RUN_WHEN_NEEDED
    case 'fallbackUnused':
      return strings.FT_RUN_FALLBACK_UNUSED
    case 'unread':
      return strings.FT_RUN_UNREAD
    case 'race':
      return strings.FT_RUN_RACE
    case 'timeout':
      return strings.FT_RUN_TIMEOUT
    case 'stopped':
      return strings.FT_RUN_STOPPED
    case 'inside':
      return reason.status === 'cancelled'
        ? strings.FT_RUN_INSIDE_CANCELLED(where(reason.path))
        : strings.FT_RUN_INSIDE_SKIPPED(where(reason.path))
    case 'notReached':
      return strings.FT_RUN_NOT_REACHED
    case 'notEvaluated':
      return strings.FT_RUN_NOT_EVALUATED
  }
}

// A failure, with where it came from where that isn't the row, and the
// failures fig-tree relates to it, as an `and` or `or` does. Where a
// fallback beneath failed too, fig-tree reports the fallback's failure, with
// its node's as the cause: the node's comes first, then the fallback's.
const Failure = ({ run: { error, failedAt }, row }: { run: RunInstance; row: Path }) => {
  if (error === undefined) return null
  const inFallback =
    error.cause instanceof Error &&
    failedAt !== undefined &&
    failedAt[failedAt.length - 1] === 'fallback' &&
    !samePath(failedAt, row)
  return (
    <>
      {inFallback ? (
        <>
          <Line text={located(error.cause as FigTreeError, failedAt.slice(0, -1), row)} />
          <Line text={strings.FT_RUN_FALLBACK_FAILED(error.message)} />
        </>
      ) : (
        <Line text={located(error, failedAt, row)} />
      )}
      {error.related?.map((related, index) => (
        <Line key={index} text={strings.FT_RUN_ALSO_FAILED(related.message)} />
      ))}
    </>
  )
}

const located = (
  { message, fragment, fragmentPath }: Pick<FigTreeError, 'message' | 'fragment' | 'fragmentPath'>,
  at: Path | undefined,
  row: Path
) => {
  const where =
    at !== undefined && !samePath(at, row) ? displayPath(at) || strings.FT_ROOT_PATH : undefined
  if (fragment === undefined)
    return where === undefined ? message : strings.FT_RUN_FAILURE_AT(where, message)
  const inBody = displayPath(fragmentPath ?? []) || strings.FT_ROOT_PATH
  return where === undefined
    ? strings.FT_RUN_FAILURE_IN_FRAGMENT(fragment, inBody, message)
    : strings.FT_RUN_FAILURE_AT_IN_FRAGMENT(where, fragment, inBody, message)
}

// Inside an iterator, a line per element, up to ten: its value, or how it
// failed, was caught, stopped or passed over
const Elements = ({
  runs,
  editorTheme,
}: {
  runs: readonly RunInstance[]
  editorTheme: EditorTheme
}) => (
  <>
    <span className="ft-hover-card-line ft-run-elements">
      {runs.slice(0, ELEMENT_LINES).map((run, index) => (
        <Fragment key={index}>
          <span className="ft-run-index">{index + 1}</span>
          <span
            className="ft-run-element"
            style={plain(run) ? undefined : { color: runText(run.status, editorTheme) }}
          >
            {elementText(run)}
          </span>
        </Fragment>
      ))}
    </span>
    {runs.length > ELEMENT_LINES && (
      <span className="ft-hover-card-line ft-run-more">
        {strings.FT_RUN_MORE(runs.length - ELEMENT_LINES)}
      </span>
    )}
  </>
)

// An element that gave a value, its own or a fallback's, is in the card's
// colour; one that failed, was stopped or was passed over, in that run's
const plain = ({ status }: RunInstance) => status === 'value' || status === 'fallback'

const elementText = ({ status, value, error }: RunInstance) => {
  const json = <span className="ft-run-json">{compactJson(value, ELEMENT_LIMIT)}</span>
  switch (status) {
    case 'value':
      return json
    case 'fallback':
      return (
        <>
          {json}
          {error && strings.FT_RUN_ELEMENT_CAUGHT(error.message)}
        </>
      )
    case 'failed':
      return strings.FT_RUN_ELEMENT_FAILED(error?.message ?? '')
    case 'cancelled':
      return strings.FT_RUN_CANCELLED
    case 'skipped':
      return strings.FT_RUN_SKIPPED
  }
}
