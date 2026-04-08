import AppLayout from '@/components/AppLayout'

export default function CragLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppLayout>{children}</AppLayout>
}
