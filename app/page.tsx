import { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'gsyrocks - Guernsey Climbing Routes',
  description: 'Discover and log climbing routes in Guernsey. Interactive map, GPS-enabled uploads, and personal logbook for climbers.',
  openGraph: {
    title: 'gsyrocks - Guernsey Climbing Routes',
    description: 'Discover and log climbing routes in Guernsey.',
    url: '/',
  },
}

export default function Home() {
  redirect('/map')
}
