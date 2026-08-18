import { Logo } from '@/components/Logo'

interface AuthShellProps {
  children: React.ReactNode
}

/**
 * The full-bleed blue gradient background + centered white card used
 * identically by all three pre-auth screens (RoleChooser, DesktopSignIn,
 * MobilePinSignIn) — they render before role is known, so there's no
 * basis to differentiate them visually. Content (the actual form/choice)
 * is untouched; this only replaces the plain white page each screen used
 * to render directly on.
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500 p-6">
      <div className="mb-8">
        <Logo variant="inverse" size={40} />
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">{children}</div>
    </div>
  )
}
