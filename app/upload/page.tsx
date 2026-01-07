import UploadForm from './components/UploadForm'
import { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Upload Climbing Route Photo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Upload a GPS-enabled photo to start documenting a new climbing route.
          </p>
          <UploadForm />
        </CardContent>
      </Card>
    </div>
  )
}