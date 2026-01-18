'use client'

import Image from 'next/image'
import { GearProduct } from '@/lib/gear-data'
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
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all snap-center overflow-hidden"
    >
      <div className="aspect-[3/4] relative bg-gray-100 dark:bg-gray-800 p-4">
        {product.imagePath ? (
          <Image
            src={`/gear/${product.imagePath}`}
            alt={product.name}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 42vw: (max-width: 1024px) 33vw: 16vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="w-16 h-16 text-gray-300 dark:text-gray-600" />
          </div>
        )}
      </div>
      
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 line-clamp-2 text-sm">
          {product.name}
        </h3>
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 flex-grow">
          {product.description}
        </p>
      </div>
    </a>
  )
}
