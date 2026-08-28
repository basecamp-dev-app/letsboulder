import StandaloneLayout from '@/components/StandaloneLayout'

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <StandaloneLayout showLegalNavigation>{children}</StandaloneLayout>
}
