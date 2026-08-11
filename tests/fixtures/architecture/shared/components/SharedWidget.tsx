// @ts-nocheck Synthetic unresolved modules exercise architecture parsing.
import { privateWidget } from '@/features/widgets/components/PrivateWidget'
import { PublicWidget } from '@/features/widgets/public-client'

export function SharedWidget() {
  return <PublicWidget value={privateWidget} />
}
