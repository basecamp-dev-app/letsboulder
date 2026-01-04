'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'

export default function Header() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      console.log('Header: got user', user)
      setUser(user)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log('Header: auth state change', _event, session?.user)
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-10 bg-white shadow">
      <div className="container mx-auto px-4 py-2 flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <div className="relative w-10 h-10">
            <Image
              src="/logo.png"
              alt="gsyrocks"
              fill
              className="object-contain"
              priority
            />
          </div>
        </Link>
        <nav className="flex items-center space-x-4">
          <Link href="/map" className="text-gray-600 hover:text-gray-900">
            Map
          </Link>
          <Link href="/upload" className="text-gray-600 hover:text-gray-900">
            Upload Route
          </Link>
          {user ? (
            <>
              <Link href="/logbook" className="text-gray-600 hover:text-gray-900">
                My Logbook
              </Link>
               <Link href="/profile" className="text-gray-600 hover:text-gray-900">
                 Profile
               </Link>
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-gray-600 hover:text-gray-900">
                Login
              </Link>
              <Link href="/auth/register" className="text-blue-600 hover:text-blue-700">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}