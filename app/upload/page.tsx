import UploadForm from './components/UploadForm'
import { Metadata } from 'next'

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
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Upload Climbing Route Photo</h1>
      <p className="mb-6">Upload a GPS-enabled photo to start documenting a new climbing route.</p>
      <UploadForm />
    </div>
  )
}