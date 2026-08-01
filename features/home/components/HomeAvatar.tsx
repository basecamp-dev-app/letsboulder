'use client'

import Image from 'next/image'
import { useState } from 'react'

interface HomeAvatarProps {
  name: string
  avatarUrl: string | null
}

export default function HomeAvatar({ name, avatarUrl }: HomeAvatarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)

  if (avatarUrl && avatarUrl !== failedAvatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={40}
        height={40}
        sizes="40px"
        className="h-10 w-10 rounded-full object-cover"
        onError={() => setFailedAvatarUrl(avatarUrl)}
      />
    )
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700 dark:bg-slate-800 dark:text-stone-100">
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}
