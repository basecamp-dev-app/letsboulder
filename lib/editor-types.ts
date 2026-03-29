export interface CollaboratorItem {
  userId: string
  role: string
  createdAt: string
  profile: {
    displayName: string
    username: string | null
    avatarUrl: string | null
  }
}

export interface InviteItem {
  id: string
  token: string
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  createdAt: string
}

export interface EditableRoute {
  id: string
  name: string
  grade: string
  climbType?: string
  description?: string
  points: Array<{ x: number; y: number }>
  sequenceOrder?: number
}
