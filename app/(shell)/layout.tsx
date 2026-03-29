import AppLayout from '@/components/AppLayout'

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppLayout>{children}</AppLayout>
}
