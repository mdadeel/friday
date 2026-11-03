import { ICON_PATHS } from './iconPaths';

export interface IconProps {
  name: keyof typeof ICON_PATHS;
  size?: number;
  title?: string;
}

/** Decorative by default. Pass `title` only when the icon is the sole label. */
export function Icon({ name, size = 18, title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      className="icon"
    >
      {title ? <title>{title}</title> : null}
      {ICON_PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
