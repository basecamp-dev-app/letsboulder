import { MediaUploadManagerProvider } from '@/features/media-upload/providers/MediaUploadManagerProvider'

export default function DraftEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MediaUploadManagerProvider>{children}</MediaUploadManagerProvider>
}
