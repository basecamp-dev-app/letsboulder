import { notFound } from 'next/navigation'
import { InviteConfirmation } from '@/features/collaboration/components/InviteConfirmation'

interface CollaborationInvitePageProps {
  params: Promise<{ type: string; token: string }>
}

export default async function CollaborationInvitePage({ params }: CollaborationInvitePageProps) {
  const { type, token } = await params
  if ((type !== 'submission' && type !== 'draft') || !token.trim()) notFound()

  return <InviteConfirmation inviteType={type} token={token} />
}
