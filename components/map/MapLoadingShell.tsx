interface MapLoadingShellProps {
  className?: string
}

export default function MapLoadingShell({ className }: MapLoadingShellProps) {
  return (
    <div className={`relative h-screen w-full overflow-hidden bg-slate-950 ${className ?? ''}`.trim()}>
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.1)_0%,rgba(2,6,23,0.45)_100%)]" />
      <div className="absolute left-4 top-[80px] h-8 w-24 animate-pulse rounded-md bg-white/10 md:left-6 md:top-4" />
      <div className="absolute right-4 top-4 h-10 w-10 animate-pulse rounded-xl bg-white/10 md:right-6" />
      <div className="absolute bottom-6 right-6 flex flex-col gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-white/10" />
        <div className="h-10 w-10 animate-pulse rounded-xl bg-white/10" />
      </div>
    </div>
  )
}
