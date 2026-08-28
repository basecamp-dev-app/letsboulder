import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold">Logbook not found</h1>
      <p className="text-sm text-muted-foreground">
        This user&apos;s logbook doesn&apos;t exist or is private.
      </p>
      <Button asChild>
        <Link href="/logbook">Back to logbook</Link>
      </Button>
    </div>
  )
}
