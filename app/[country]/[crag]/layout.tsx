import QueryProviders from '@/components/query-providers'

export default function CragLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProviders>
      {children}
    </QueryProviders>
  )
}
