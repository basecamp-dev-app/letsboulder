'use client'

interface RouteCanvasOverlayProps {
  overlayName: string
  overlayGradeLabel: string
  overlayClimbTypeLabel: string
  isDrawingEnabled: boolean
  onSelectName: () => void
  onSelectGrade: () => void
  onSelectType: () => void
}

export function RouteCanvasOverlay({
  overlayName,
  overlayGradeLabel,
  overlayClimbTypeLabel,
  isDrawingEnabled,
  onSelectName,
  onSelectGrade,
  onSelectType,
}: RouteCanvasOverlayProps) {
  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-20 rounded-2xl border border-white/70 bg-black/60 px-3 py-2 text-white shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
        <span>Current route</span>
        <span className="h-1 w-1 rounded-full bg-white/40" />
        <span>{isDrawingEnabled ? 'Drawing' : 'Editing'}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <button
          type="button"
          onClick={onSelectName}
          className="max-w-[16rem] truncate text-left text-base font-semibold text-white transition hover:text-white/80"
        >
          {overlayName}
        </button>
        <span className="text-sm text-white/55">-</span>
        <button
          type="button"
          onClick={onSelectGrade}
          className="text-left text-lg font-semibold tabular-nums text-white transition hover:text-white/80"
        >
          {overlayGradeLabel}
        </button>
        <button
          type="button"
          onClick={onSelectType}
          className="text-left text-sm text-white/80 transition hover:text-white"
        >
          {overlayClimbTypeLabel}
        </button>
      </div>
    </div>
  )
}
