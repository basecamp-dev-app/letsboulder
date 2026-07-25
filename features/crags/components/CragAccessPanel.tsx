import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'

export function CragAccessPanel({ crag }: { crag: CragPageCrag }) {
  if (!crag.access_notes && !crag.description && !crag.rock_type && !crag.type) return null

  return (
    <section
      aria-labelledby="crag-access-heading"
      className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm shadow-amber-950/5 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <h2 id="crag-access-heading" className="font-black">
        Access and conditions
      </h2>
      {crag.access_notes ? <p className="mt-2 whitespace-pre-line text-sm">{crag.access_notes}</p> : null}
      {crag.description ? <p className="mt-3 whitespace-pre-line text-sm">{crag.description}</p> : null}
      {crag.rock_type || crag.type ? (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold uppercase">
          {crag.rock_type ? <p>Rock: {crag.rock_type}</p> : null}
          {crag.type ? <p>Climbing: {crag.type}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
