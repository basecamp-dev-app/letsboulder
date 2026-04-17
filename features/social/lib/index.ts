import { INSTAGRAM_POST_WIDTH, INSTAGRAM_POST_HEIGHT } from '@/features/social/types/index'

export { INSTAGRAM_POST_WIDTH, INSTAGRAM_POST_HEIGHT }

export interface SocialPlatformConfig {
  name: string
  dimensions: { width: number; height: number }
  shareUrl?: string
}

export const PLATFORMS: Record<string, SocialPlatformConfig> = {
  instagram: {
    name: 'Instagram',
    dimensions: { width: INSTAGRAM_POST_WIDTH, height: INSTAGRAM_POST_HEIGHT },
  },
}