import type { SVGProps } from 'react';
import { iconPaths, type IconName } from './paths';

export type { IconName };
export { iconNames } from './paths';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Rendered size in px. The 20px grid scales cleanly to 14, 16, 18, 20, 24. */
  size?: number;
  /**
   * An accessible label. Omit it for icons that sit next to their own text —
   * those are decorative and get `aria-hidden` instead.
   */
  label?: string;
}

/**
 * The single entry point to the A+ Write icon set.
 *
 * Stroke geometry is fixed here rather than per glyph, which is what keeps the
 * set looking like one hand drew it.
 */
export function Icon({ name, size = 20, label, ...rest }: IconProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...a11y}
      {...rest}
    >
      {iconPaths[name]}
    </svg>
  );
}
