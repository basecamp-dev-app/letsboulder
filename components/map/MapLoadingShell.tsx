'use client'

export default function MapLoadingShell() {
  return (
    <div className="h-screen w-full bg-gray-50 dark:bg-gray-950">
      <div className="h-full w-full animate-pulse bg-[radial-gradient(circle_at_center,_rgba(148,163,184,0.12),_transparent_58%)] dark:bg-[radial-gradient(circle_at_center,_rgba(71,85,105,0.18),_transparent_58%)]" />
    </div>
  )
}
