import type { Metadata } from 'next'
import { cache } from 'react'
import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fetchServerPublicLogbookData } from '@/features/logbook/lib/queries-server'
import ProfileViewTracker from './components/ProfileViewTracker'
import PublicLogbookClient from './PublicLogbookClient'

export const revalidate = 60

interface PublicLogbookPageProps {
  params: Promise<{ userId: string }>
}

const getPublicLogbookData = cache(fetchServerPublicLogbookData)

function PrivateProfileCard({ username }: { username: string }) {
  return <div className="min-h-screen bg-white px-4 py-8 dark:bg-gray-950"><Card className="mx-auto max-w-sm"><CardContent className="flex flex-col items-center justify-center px-4 py-12"><Lock className="mb-4 h-8 w-8 text-gray-400" /><h3 className="mb-2 text-lg font-semibold">Private Profile</h3><p className="mb-6 text-center text-sm text-gray-500">{username} has chosen to keep their logbook hidden from public view.</p><Link href="/"><Button variant="outline" className="gap-2"><ArrowLeft className="h-4 w-4" />Back to Map</Button></Link></CardContent></Card></div>
}

function ProfileNotFound() {
  return <div className="min-h-screen bg-white px-4 py-8 dark:bg-gray-950"><Card className="mx-auto max-w-sm"><CardContent className="flex flex-col items-center justify-center px-4 py-12"><Lock className="mb-4 h-8 w-8 text-gray-400" /><h3 className="mb-2 text-lg font-semibold">Profile Not Found</h3><p className="mb-6 text-center text-sm text-gray-500">This climber&apos;s profile could not be found.</p><Link href="/"><Button variant="outline" className="gap-2"><ArrowLeft className="h-4 w-4" />Back to Map</Button></Link></CardContent></Card></div>
}

export async function generateMetadata({ params }: PublicLogbookPageProps): Promise<Metadata> {
  const { userId } = await params
  const data = await getPublicLogbookData(userId)
  if (!data?.profile) return { title: 'Profile Not Found', robots: { index: false, follow: true } }
  if (!data.isPublic) return { title: `${data.profile?.username || 'Profile'}'s Logbook`, robots: { index: false, follow: true } }
  return {
    title: `${data.profile.username}'s Logbook`,
    description: `View ${data.profile.username}'s climbing logbook and achievements on letsboulder.`,
    alternates: { canonical: `/logbook/${userId}` },
    robots: { index: true, follow: true },
    openGraph: { title: `${data.profile.username}'s Logbook - letsboulder`, description: `View ${data.profile.username}'s climbing logbook and achievements on letsboulder.`, url: `/logbook/${userId}` },
  }
}

export default async function PublicLogbookPage({ params }: PublicLogbookPageProps) {
  const { userId } = await params
  const data = await getPublicLogbookData(userId)
  if (!data) return <ProfileNotFound />
  if (!data.isPublic) return <PrivateProfileCard username={data.profile?.username || 'This climber'} />
  return <><ProfileViewTracker /><PublicLogbookClient userId={userId} initialPage={data} /></>
}
