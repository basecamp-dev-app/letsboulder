import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink, Images, MapPin, Mountain, Route, ShieldAlert } from 'lucide-react'

import ManagedCragImages from '@/features/crag-management/components/ManagedCragImages'
import { loadManagedCragImages } from '@/features/crag-management/server/load-managed-crag-images'
import { Button } from '@/components/ui/button'
import CragPublicationControls from '@/features/crags/components/CragPublicationControls'

export const dynamic = 'force-dynamic'

interface ManageCragPageProps {
  params: Promise<{ cragId: string }>
  searchParams: Promise<{ page?: string }>
}
export default async function ManageCragPage({ params, searchParams }: ManageCragPageProps) {
  const { cragId } = await params
  const query = await searchParams
  const page = Number.parseInt(query.page || '1', 10)
  const result = await loadManagedCragImages(cragId, page)

  if (!result.success) {
    if (result.status === 401) redirect(`/auth?redirect_to=${encodeURIComponent(`/maintain/crags/${cragId}`)}`)
    if (result.status === 404) notFound()
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6" role="alert">
          <h1 className="text-xl font-semibold">Crag management unavailable</h1>
          <p className="mt-2 text-red-100">{result.error}</p>
          <Button asChild className="mt-5" variant="outline"><Link href="/maintain/crags">Back to stewardship</Link></Button>
        </div>
      </div>
    )
  }

  const { crag, images, isAdmin, total, totalPages } = result.data
  const publicCragHref = crag.countryCode && crag.slug
    ? `/${crag.countryCode.toLowerCase()}/${crag.slug}`
    : `/crag/${crag.id}`
  const location = [crag.subArea, crag.regionName, crag.countryCode].filter(Boolean).join(', ') || 'Location not specified'

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <Link className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/maintain/crags">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to stewardship
      </Link>

      <header className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">Crag management</p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
              <Mountain className="h-8 w-8 text-blue-400" aria-hidden="true" /> {crag.name}
            </h1>
            <p className="mt-3 flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" aria-hidden="true" /> {location}
            </p>
          </div>
          {crag.publicationStatus === 'published' ? (
            <Button asChild variant="outline">
              <Link href={publicCragHref}>View public crag <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>
            </Button>
          ) : null}
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground"><Route className="h-4 w-4" aria-hidden="true" /> Routes</dt>
            <dd className="mt-1 text-2xl font-semibold">{crag.routeCount}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground"><Images className="h-4 w-4" aria-hidden="true" /> Images</dt>
            <dd className="mt-1 text-2xl font-semibold">{crag.imageCount}</dd>
          </div>
        </dl>
        <CragPublicationControls
          cragId={crag.id}
          initialNotes={crag.publicationNotes}
          initialStatus={crag.publicationStatus}
        />
      </header>

      <section aria-labelledby="managed-images-heading" className="mt-10">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold" id="managed-images-heading">Images</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? 'Review image lifecycle state and remove canonical images when necessary.' : 'Review image lifecycle state. Image removal is currently restricted to global administrators.'}
          </p>
        </div>
        <ManagedCragImages
          countryCode={crag.countryCode}
          cragId={crag.id}
          cragSlug={crag.slug}
          initialImages={images}
          isAdmin={isAdmin}
        />
        {totalPages > 1 ? (
          <nav aria-label="Image pages" className="mt-8 flex items-center justify-between rounded-xl border p-3">
            <Button asChild={result.data.page > 1} disabled={result.data.page <= 1} variant="outline">
              {result.data.page > 1 ? <Link href={`?page=${result.data.page - 1}`}>Previous</Link> : <span>Previous</span>}
            </Button>
            <p className="text-sm text-muted-foreground">Page {result.data.page} of {totalPages} · {total} images</p>
            <Button asChild={result.data.page < totalPages} disabled={result.data.page >= totalPages} variant="outline">
              {result.data.page < totalPages ? <Link href={`?page=${result.data.page + 1}`}>Next</Link> : <span>Next</span>}
            </Button>
          </nav>
        ) : null}
      </section>

      <section aria-labelledby="danger-zone-heading" className="mt-12 rounded-2xl border border-red-500/30 bg-red-500/5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 text-red-400" aria-hidden="true" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-red-100" id="danger-zone-heading">Danger zone</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Deleting the entire crag is a separate operation from removing one image. Existing route-count confirmation remains in the administrator crag list.
            </p>
            {isAdmin ? <Button asChild className="mt-4" variant="destructive"><Link href="/admin/crags">Open crag deletion controls</Link></Button> : null}
          </div>
        </div>
      </section>
    </div>
  )
}
