import { MediaUploadManagerProvider } from '@/features/submissions/upload/providers/MediaUploadManagerProvider'

export default function SubmissionEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MediaUploadManagerProvider>{children}</MediaUploadManagerProvider>
}
