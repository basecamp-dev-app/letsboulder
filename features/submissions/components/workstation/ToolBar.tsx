'use client'

interface WorkstationToolBarProps {
  interactionTool: 'select' | 'draw'
  currentPointsCount: number
  routeCountLabel: string
  hideRouteActions: boolean
  onSetSelectTool: () => void
  onSetDrawTool: () => void
  onUndoPoint: () => void
  onFinishRoute: () => void
}

export function WorkstationToolBar({
  interactionTool,
  currentPointsCount,
  routeCountLabel,
  hideRouteActions,
  onSetSelectTool,
  onSetDrawTool,
  onUndoPoint,
  onFinishRoute,
}: WorkstationToolBarProps) {
  const isDrawing = interactionTool === 'draw'
  const hasDraftPoints = currentPointsCount > 0

  return (
    <div className="rounded-3xl border border-gray-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          className={`rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
            interactionTool === 'select'
              ? 'bg-blue-500 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
          onClick={onSetSelectTool}
        >
          Select/Edit
        </button>
        <button
          type="button"
          className={`rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
            interactionTool === 'draw'
              ? 'bg-blue-500 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
          onClick={onSetDrawTool}
        >
          Draw Route
        </button>
        <button
          type="button"
          className={`rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
            currentPointsCount > 0
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-600 dark:text-gray-500'
          }`}
          onClick={onUndoPoint}
          disabled={hideRouteActions || currentPointsCount === 0}
        >
          Undo Point
        </button>
        <button
          type="button"
          className={`rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
            currentPointsCount >= 2
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-600 dark:text-gray-500'
          }`}
          onClick={onFinishRoute}
          disabled={hideRouteActions || currentPointsCount < 2}
        >
          Finish Route
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between px-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{isDrawing ? (hasDraftPoints ? `${currentPointsCount} points placed` : 'Tap the wall to add points') : 'Tap a route to edit details'}</span>
        <span>{routeCountLabel}</span>
      </div>
    </div>
  )
}
