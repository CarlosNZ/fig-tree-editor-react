import { defaultTheme, ThemeIcons } from 'json-edit-react'
import { SVGProps } from 'react'

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
}

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
}: {
  name: keyof ThemeIcons
  style?: React.CSSProperties
  scale?: number
}): JSX.Element => {
  const icons = defaultTheme.icons
  const def = icons?.[name]
  if (!def) return <p>NO ICON</p>
  return (
    <IconSvg
      viewBox={def.viewBox}
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

export const IconOk = <Icon name="ok" style={{ color: 'green' }} scale={1.4} />
export const IconCancel = <Icon name="cancel" style={{ color: 'rgb(203, 75, 22)' }} scale={2} />
