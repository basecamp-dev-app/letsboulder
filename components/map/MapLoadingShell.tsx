interface MapLoadingShellProps {
  className?: string
}

export default function MapLoadingShell({ className }: MapLoadingShellProps) {
  return (
    <div className={`relative h-screen w-full overflow-hidden bg-slate-950 ${className ?? ''}`.trim()}>
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.1)_0%,rgba(2,6,23,0.45)_100%)]" />
      <div className="absolute left-4 top-4 w-[min(28rem,calc(100vw-2rem))] rounded-[28px] border border-white/15 bg-slate-950/78 p-4 shadow-2xl shadow-black/35 backdrop-blur-md md:left-6 md:top-6 md:p-5">
        <div className="h-6 w-40 animate-pulse rounded-full bg-white/10" />
        <div className="mt-2 h-4 w-60 animate-pulse rounded-full bg-white/8" />
        <div className="mt-4 h-12 animate-pulse rounded-2xl border border-white/10 bg-white/8" />
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="h-10 w-36 animate-pulse rounded-full bg-cyan-400/14" />
          <div className="h-10 w-28 animate-pulse rounded-full bg-white/8" />
        </div>
        <div className="mt-4 h-3 w-24 animate-pulse rounded-full bg-white/8" />
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="h-9 w-24 animate-pulse rounded-full bg-white/8" />
          <div className="h-9 w-32 animate-pulse rounded-full bg-white/8" />
          <div className="h-9 w-28 animate-pulse rounded-full bg-white/8" />
        </div>
        <div className="mt-4 h-3 w-72 animate-pulse rounded-full bg-white/8" />
      </div>
      <div className="absolute left-4 top-[132px] h-8 w-24 animate-pulse rounded-md bg-white/10 md:left-6 md:top-[84px]" />
      <div className="absolute right-4 top-4 h-10 w-10 animate-pulse rounded-xl bg-white/10 md:right-6 md:top-6" />
      <div className="absolute bottom-6 right-6 flex flex-col gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-white/10" />
        <div className="h-10 w-10 animate-pulse rounded-xl bg-white/10" />
      </div>
    </div>
  )
}
