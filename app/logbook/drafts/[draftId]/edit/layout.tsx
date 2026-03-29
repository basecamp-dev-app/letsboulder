import { MediaUploadManagerProvider } from '@/features/submissions/upload/providers/MediaUploadManagerProvider'

export default function DraftEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MediaUploadManagerProvider>{children}</MediaUploadManagerProvider>
}
