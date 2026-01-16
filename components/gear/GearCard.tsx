'use client'

import Image from 'next/image'
import { GearProduct } from '@/lib/gear-data'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShieldCheck, HardHat, Link2, Scroll, Mountain, Footprints, CupSoda, Sun, Wrench, Tent } from 'lucide-react'

const categoryIcons: Record<string, typeof ShieldCheck> = {
  'Belay Devices': ShieldCheck,
  'Harnesses & Helmets': HardHat,
  Hardware: Link2,
  'Ropes & Rope Bags': Scroll,
  Bouldering: Mountain,
  Footwear: Footprints,
  'Nutrition & Hydration': CupSoda,
  'Sun & Skin Care': Sun,
  'Tools & Accessories': Wrench,
  'Camping & Safety': Tent,
}

interface GearCardProps {
  product: GearProduct
}

export default function GearCard({ product }: GearCardProps) {
  const Icon = categoryIcons[product.category] || Wrench

  return (
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow overflow-hidden">
      <div className="aspect-[3/4] relative bg-gray-100 dark:bg-gray-800 p-2">
        {product.imagePath ? (
          <Image
            src={`/gear/${product.imagePath}`}
            alt={product.name}
            fill
            className="object-contain"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          </div>
        )}
      </div>
      
      <CardContent className="p-5 flex flex-col flex-grow">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {product.name}
        </h3>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex-grow">
          {product.description}
        </p>
        
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <Button variant="outline" className="w-full">
            View on Amazon
          </Button>
        </a>
      </CardContent>
    </Card>
  )
}
