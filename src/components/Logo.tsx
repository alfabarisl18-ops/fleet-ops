interface LogoProps {
  /** Badge side length in pixels. Defaults to the size used in the sidebar/topbar. */
  size?: number
  /** Show "Fleet Operations SL" next to the badge. Off for tight spaces (e.g. a collapsed rail). */
  withWordmark?: boolean
  /** 'default' — blue badge, dark wordmark, for a white background (sidebar, topbar).
   *  'inverse' — white badge with a blue icon, white wordmark, for the blue gradient
   *  sign-in background, where a blue-on-blue badge would have no contrast. */
  variant?: 'default' | 'inverse'
  className?: string
}

/**
 * The app's mark: a simple line-art van in a rounded badge, plus the real
 * product name (never the old "FO" monogram or invented wordmark copy).
 * Used identically across the sidebar, the top bar, and all three pre-auth
 * screens (RoleChooser, DesktopSignIn, MobilePinSignIn) so the brand reads
 * the same before and after sign-in.
 */
export function Logo({ size = 36, withWordmark = true, variant = 'default', className = '' }: LogoProps) {
  const inverse = variant === 'inverse'
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl ${inverse ? 'bg-white' : 'bg-primary-600'}`}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={inverse ? 'text-primary-600' : 'text-white'}
          style={{ width: size * 0.58, height: size * 0.58 }}
        >
          <path d="M2 8.5A1 1 0 0 1 3 7.5h8.5a1 1 0 0 1 .95.68L13.5 12H19a2 2 0 0 1 2 2v2.5H2V8.5Z" />
          <path d="M13.5 12v4.5" />
          <path d="M2 16.5h1.6" />
          <circle cx="6.5" cy="17.5" r="1.7" />
          <circle cx="16.5" cy="17.5" r="1.7" />
        </svg>
      </div>
      {withWordmark && (
        <span className={`font-heading text-base font-semibold ${inverse ? 'text-white' : 'text-slate-900'}`}>Fleet Operations SL</span>
      )}
    </div>
  )
}
