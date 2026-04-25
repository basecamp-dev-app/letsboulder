'use client'

import MapViewport from '@/components/MapViewport'
import { cn } from '@/lib/utils'

interface HomeMapHeroProps {
  className?: string
}

export default function HomeMapHero({ className }: HomeMapHeroProps) {
  return (
    <div className={cn('relative w-full overflow-hidden rounded-none md:rounded-[2rem]', className)}>
      <h1 className="sr-only">Find rock, gyms, and topos near you.</h1>
      <MapViewport mode="hero" className="h-full w-full" showUserLocation={true} />
    </div>
  )
}
