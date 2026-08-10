import { notFound, permanentRedirect } from 'next/navigation'
import { getLegacyClimbRedirect } from '@/features/image-first/server/legacy-redirects'

export const dynamic = 'force-dynamic'

export default async function ClimbPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const redirectUrl = await getLegacyClimbRedirect(id)
    if (redirectUrl) permanentRedirect(redirectUrl)
    notFound()
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('redirect:') || error.message === 'NEXT_REDIRECT')) {
      throw error
    }
    notFound()
  }
}
