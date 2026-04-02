'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'
import NextImage from 'next/image'
import { ProfileAvatarUploadModal } from '@/components/profile-avatar-upload-modal'
import { ProfileEditModal } from '@/components/profile-edit-modal'

interface ProfileAvatarProps {
  avatarUrl?: string
  initials: string
  averageGrade: string
  averagePoints: number
  previousGrade: string
  nextGrade: string
  previousGradePoints: number
  nextGradePoints: number
  username: string
  firstName?: string
  lastName?: string
  gender?: string
  onAvatarUpdate: (newUrl: string) => void
  onUsernameUpdate?: (newUsername: string, firstName?: string, lastName?: string, gender?: string) => void
}

export interface ProfileAvatarRef {
  openProfileEdit: () => void
}

const ProfileAvatarComponent = forwardRef<ProfileAvatarRef, ProfileAvatarProps>(function ProfileAvatar({
  avatarUrl,
  initials,
  averageGrade,
  averagePoints,
  previousGradePoints,
  nextGradePoints,
  username,
  firstName,
  lastName,
  gender,
  onAvatarUpdate,
  onUsernameUpdate,
}: ProfileAvatarProps, ref) {
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  useImperativeHandle(ref, () => ({
    openProfileEdit: () => setIsProfileModalOpen(true),
  }), [])

  const radius = 44
  const circumference = 2 * Math.PI * radius
  const strokeWidth = 4

  const percent = nextGradePoints > previousGradePoints
    ? Math.min(Math.max(((averagePoints - previousGradePoints) / (nextGradePoints - previousGradePoints)) * 100, 0), 100)
    : 0

  const strokeDashoffset = circumference - (percent / 100) * circumference

  return (
    <>
      <div className="relative w-32 h-32">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
          <div className="bg-white dark:bg-gray-800 px-3 py-0.5 rounded-full shadow-md border border-gray-200 dark:border-gray-700">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{averageGrade}</span>
          </div>
        </div>

        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-gray-200 dark:text-gray-700" />
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="text-gray-800 dark:text-gray-400 transition-all duration-500"
              style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
            />
          </svg>

          <button
            onClick={() => setIsAvatarModalOpen(true)}
            className="absolute inset-[6px] rounded-full overflow-hidden transition-opacity hover:opacity-95 group"
            aria-label="Edit profile picture"
          >
            {avatarUrl ? (
              <NextImage src={avatarUrl} alt="Profile" width={128} height={128} sizes="128px" unoptimized className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 font-bold text-xl">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium">Edit</span>
            </div>
          </button>
        </div>

        <div className="mt-2 text-center">
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 block">{username || 'Set username'}</span>
        </div>
      </div>

      <ProfileAvatarUploadModal
        open={isAvatarModalOpen}
        avatarUrl={avatarUrl}
        initials={initials}
        onClose={() => setIsAvatarModalOpen(false)}
        onAvatarUpdate={onAvatarUpdate}
      />

      <ProfileEditModal
        open={isProfileModalOpen}
        username={username}
        firstName={firstName}
        lastName={lastName}
        gender={gender}
        onClose={() => setIsProfileModalOpen(false)}
        onUsernameUpdate={onUsernameUpdate}
      />
    </>
  )
})

export default ProfileAvatarComponent
