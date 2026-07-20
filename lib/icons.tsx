import type { SVGProps } from 'react';

/**
 * Lucide-style stroke icons. One component, keyed by name, so the whole app
 * pulls from a single consistent set (24x24 viewBox, currentColor stroke) —
 * no emojis, no size drift.
 */
export type IconName =
  | 'roleplay'
  | 'history'
  | 'analytics'
  | 'faq'
  | 'sparkle'
  | 'search'
  | 'check'
  | 'lock'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'mic'
  | 'mic-off'
  | 'phone-off'
  | 'volume'
  | 'user'
  | 'building'
  | 'clock'
  | 'target'
  | 'trophy'
  | 'wave';

const PATHS: Record<IconName, React.ReactNode> = {
  roleplay: (
    <>
      <path d="M8 9h8M8 13h5" />
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
    </>
  ),
  faq: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.3a2.8 2.8 0 0 1 5.4 1c0 1.9-2.6 2.3-2.6 3.9" />
      <path d="M12 17.5h.01" />
    </>
  ),
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  lock: (
    <>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  'chevron-left': <path d="M15 18l-6-6 6-6" />,
  'chevron-right': <path d="M9 18l6-6-6-6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  'mic-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M9 5.1A3 3 0 0 1 15 6v3m0 3a3 3 0 0 1-4.9 2.3" />
      <path d="M5 11a7 7 0 0 0 10.7 6M19 11a7 7 0 0 1-.3 2M12 18v3" />
    </>
  ),
  'phone-off': (
    <>
      <path d="M10.7 13.3a11 11 0 0 1-2-2l1.4-1.8a1 1 0 0 0 .1-1L9 5.5a1 1 0 0 0-1.2-.6l-3 .8A1.5 1.5 0 0 0 3.7 7 16.5 16.5 0 0 0 17 20.3a1.5 1.5 0 0 0 1.3-1.1l.8-3a1 1 0 0 0-.6-1.2l-3-1.2a1 1 0 0 0-1 .1Z" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M10 21v-4h4v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M10 16v4M14 16v4" />
    </>
  ),
  wave: <path d="M2 12c2 0 2-4 4-4s2 8 4 8 2-12 4-12 2 8 4 8 2-4 2-4" />,
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, strokeWidth = 1.9, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
