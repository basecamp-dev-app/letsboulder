import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import StandaloneLayout from '@/components/StandaloneLayout'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <StandaloneLayout backLabel="Explore the map">
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button asChild>
          <Link href="/">Go to map</Link>
        </Button>
      </div>
    </StandaloneLayout>
  )
}
