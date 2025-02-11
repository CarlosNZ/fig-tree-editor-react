import React from 'react'
import { OperatorAlias, Operator as OpType } from 'fig-tree-evaluator'
import { IconEdit } from './_imports'
import { Icons } from './Icons'
import { getButtonFontSize } from './helpers'
import { OperatorDisplay, operatorDisplay } from './operatorDisplay'

const README_URL = 'https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#'

interface DisplayBarProps {
  name: OperatorAlias
  description?: string
  setIsEditing: () => void
  evaluate: (e: React.MouseEvent) => void
  isLoading: boolean
  canonicalName: OpType | 'FRAGMENT'
  operatorDisplay?: OperatorDisplay
  convertOptions?: { type: 'toShorthand' | 'fromShorthand' | 'toV2'; onClick: () => void }
  canEdit: boolean
}

export const DisplayBar: React.FC<DisplayBarProps> = ({
  name,
  description,
  setIsEditing,
  evaluate,
  isLoading,
  canonicalName = 'CUSTOM_FUNCTIONS',
  operatorDisplay: operatorDisplayOverride,
  convertOptions,
  canEdit,
}) => {
  const { backgroundColor, textColor, displayName } =
    operatorDisplayOverride ?? operatorDisplay[canonicalName]
  const isShorthand = name.startsWith('$')
  const linkSuffix =
    canonicalName === 'FRAGMENT'
      ? 'fragments'
      : canonicalName === 'CUSTOM_FUNCTIONS'
      ? 'custom-functionsoperators'
      : canonicalName.toLowerCase()
  const link = README_URL + linkSuffix

  return (
    <div className="ft-display-bar">
      <div className="ft-button-and-edit" title={description}>
        <EvaluateButton
          name={name}
          backgroundColor={backgroundColor}
          textColor={textColor}
          evaluate={evaluate}
          isLoading={isLoading}
          isShorthand={isShorthand}
        />
        {!isShorthand && canEdit && (
          <div onClick={setIsEditing} className="ft-clickable ft-edit-icon">
            <IconEdit size="1.5em" style={{ color: 'rgb(42, 161, 152)' }} />
          </div>
        )}
      </div>
      <div className="ft-display-name">
        <a href={link} target="_blank">
          {displayName}
        </a>
      </div>
      {canEdit && (
        <ConvertButton
          {...convertOptions}
          backgroundColor={backgroundColor}
          textColor={textColor}
        />
      )}
    </div>
  )
}

export interface EvaluateButtonProps {
  name?: string
  backgroundColor: string
  textColor: string
  evaluate: (e: React.MouseEvent) => void
  isLoading: boolean
  isShorthand?: boolean
}

export const EvaluateButton: React.FC<EvaluateButtonProps> = ({
  name,
  backgroundColor,
  textColor,
  evaluate,
  isLoading,
  isShorthand = false,
}) => {
  return (
    <div
      className="ft-display-button"
      style={{ backgroundColor, color: textColor }}
      onClick={(e) => evaluate(e)}
    >
      {!isLoading ? (
        <>
          {name && (
            <span
              className="ft-operator-alias"
              style={{
                fontSize: getButtonFontSize(name),
                fontStyle: isShorthand ? 'italic' : 'inherit',
              }}
            >
              {name}
            </span>
          )}
          {Icons.evaluate}
        </>
      ) : (
        <div style={{ width: '100%', textAlign: 'center' }}>
          <span
            className="ft-loader"
            style={{ width: '1.5em', height: '1.5em', borderTopColor: textColor }}
          ></span>
        </div>
      )}
    </div>
  )
}

export type ConversionType = 'toShorthand' | 'fromShorthand' | 'toV2'
export interface ConvertProps {
  type?: ConversionType
  onClick?: () => void
  backgroundColor: string
  textColor: string
}
const typeMap: Record<ConversionType, { button: string; tooltip: string }> = {
  toShorthand: { button: 'To Shorthand', tooltip: 'Convert to "Shorthand" syntax' },
  fromShorthand: { button: 'To Full Node', tooltip: 'Convert to the more verbose syntax' },
  toV2: {
    button: 'Convert to V2',
    tooltip:
      'This expression is in Version 1 syntax. Click the button to upgrade to the more modern syntax.',
  },
}
export const ConvertButton: React.FC<ConvertProps> = ({
  type,
  onClick,
  textColor,
  backgroundColor,
}) => {
  if (!type) return null
  const { button, tooltip } = typeMap[type]
  return (
    <div className="ft-convert-area" title={tooltip}>
      {type === 'toV2' && <p className={`ft-v1-badge`}>V1</p>}
      <div
        className="ft-convert-button"
        onClick={onClick}
        style={{
          color: textColor,
          backgroundColor,
          marginTop: type !== 'toV2' ? '0.2rem' : undefined,
        }}
      >
        {button}
      </div>
    </div>
  )
}
