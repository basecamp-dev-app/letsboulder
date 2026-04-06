import { MediaUploadManagerProvider } from '@/features/media-upload/providers/MediaUploadManagerProvider'

export default function SubmitLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MediaUploadManagerProvider>{children}</MediaUploadManagerProvider>
}
