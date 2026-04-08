import AppLayout from '@/components/AppLayout'
import { MediaUploadManagerProvider } from '@/features/media-upload/providers/MediaUploadManagerProvider'

export default function DraftEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppLayout><MediaUploadManagerProvider>{children}</MediaUploadManagerProvider></AppLayout>
}
