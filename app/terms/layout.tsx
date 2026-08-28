import StandaloneLayout from '@/components/StandaloneLayout'

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <StandaloneLayout showLegalNavigation>{children}</StandaloneLayout>
}
