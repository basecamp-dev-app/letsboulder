import { Metadata } from 'next'
import UploadPageClient from './UploadPageClient'

export const metadata: Metadata = {
  title: 'Upload Climbing Route',
  description: 'Upload GPS-enabled photos to document new climbing routes in Guernsey. Add route information and share with the climbing community.',
  openGraph: {
    title: 'Upload Climbing Route - gsyrocks',
    description: 'Upload GPS-enabled photos to document new climbing routes in Guernsey.',
    url: '/upload',
  },
}

export default function UploadPage() {
  return <UploadPageClient />
}