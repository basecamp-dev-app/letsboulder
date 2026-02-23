'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function GymAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkAuth() {
      const supabase = createClient()
      const { data: { user }, error } = await supabase.auth.getUser()

      if (!mounted) return

      if (error || !user) {
        router.push(`/auth?redirect_to=${encodeURIComponent(pathname)}`)
        return
      }

      setIsAuthenticated(true)
      setLoading(false)
    }

    checkAuth().catch(() => {
      if (!mounted) return
      router.push(`/auth?redirect_to=${encodeURIComponent(pathname)}`)
    })

    return () => {
      mounted = false
    }
  }, [pathname, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-white">
            <Building2 className="h-5 w-5 text-blue-400" />
            <span className="font-semibold">Gym Admin</span>
          </div>
          <Link href="/community" className="text-sm text-gray-300 hover:text-white">
            Back to Community
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  )
}
