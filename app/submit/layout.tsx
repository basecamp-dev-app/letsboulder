import { MediaUploadManagerProvider } from '@/features/submissions/upload/providers/MediaUploadManagerProvider'

export default function SubmitLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MediaUploadManagerProvider>{children}</MediaUploadManagerProvider>
}
