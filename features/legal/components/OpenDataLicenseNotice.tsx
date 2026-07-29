import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const notices: Record<'media' | 'edit' | 'publish', ReactNode> = {
  media: <>Photos are shared under CC BY-SA 4.0. Only select media you have the right to share.</>,
  edit: <>Text is shared under CC BY-SA 4.0. Structured data and route geometry are shared under ODbL 1.0.</>,
  publish: <>Publishing applies your accepted <Link href="/open-data-terms" className="font-medium underline underline-offset-2">Open Data Contributor Terms</Link>.</>,
}

export function OpenDataLicenseNotice({ context, className }: { context: keyof typeof notices; className?: string }) {
  return <p className={cn('text-xs leading-relaxed text-gray-500 dark:text-gray-400', className)}>{notices[context]}</p>
}
