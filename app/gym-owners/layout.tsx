import StandaloneLayout from '@/components/StandaloneLayout'

export default function GymOwnersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <StandaloneLayout backLabel="Explore the map">
      {children}
    </StandaloneLayout>
  )
}
