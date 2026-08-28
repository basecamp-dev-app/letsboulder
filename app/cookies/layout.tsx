import StandaloneLayout from '@/components/StandaloneLayout'

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return <StandaloneLayout showLegalNavigation>{children}</StandaloneLayout>
}
