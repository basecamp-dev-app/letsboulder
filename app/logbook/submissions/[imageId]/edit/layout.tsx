import AppLayout from '@/components/AppLayout'
import { MediaUploadManagerProvider } from '@/features/media-upload/providers/MediaUploadManagerProvider'

export default function SubmissionEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppLayout><MediaUploadManagerProvider>{children}</MediaUploadManagerProvider></AppLayout>
}
