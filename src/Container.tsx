import { type CustomComponentProps } from 'json-edit-react'
import { type ComponentConfig } from './customNodeDefinitions'
import { CardLines, HoverCard } from './HoverCard'
import { EvaluateIcon } from './Icons'
import { rowMark } from './revealRow'
import { strings } from './strings'
import { useEvaluation } from './useEvaluation'

// The root, where it is plain data holding nodes or references (design,
// topic 3, "Kinds"; mockup F1): a bare Evaluate button above its rows, which
// evaluates the whole expression, as a node's button does its node.
export const Container = ({
  componentProps,
  nodeData,
  children,
}: CustomComponentProps<ComponentConfig>) => {
  const { editorTheme } = componentProps!
  const { running, mark, blocked, disabled, onEvaluate } = useEvaluation(
    nodeData.path,
    nodeData.fullData,
    componentProps!
  )
  return (
    <>
      <div className="ft-root-bar" {...rowMark(nodeData.path)}>
        <HoverCard
          hideOnClick
          card={
            disabled ? (
              <CardLines lines={[]} alert={{ text: blocked!, colour: editorTheme.error }} />
            ) : undefined
          }
        >
          <button
            type="button"
            className={disabled ? 'ft-evaluate-button ft-evaluate-blocked' : 'ft-evaluate-button'}
            aria-disabled={disabled || undefined}
            aria-busy={running || undefined}
            onClick={() => {
              if (!disabled) onEvaluate()
            }}
          >
            <span className="ft-name">{strings.FT_EVALUATE}</span>
            <EvaluateIcon running={running} mark={mark} editorTheme={editorTheme} />
          </button>
        </HoverCard>
      </div>
      {children}
    </>
  )
}
