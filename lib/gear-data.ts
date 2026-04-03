export interface GearProduct {
  id: string
  name: string
  url: string
  category: string
  description: string
  imagePath?: string
  imageUrl?: string
}

export type GearCategory =
  | 'All'
  | 'Guidebooks'
  | 'Belay Devices'
  | 'Harnesses & Helmets'
  | 'Hardware'
  | 'Ropes & Rope Bags'
  | 'Bouldering'
  | 'Footwear'
  | 'Nutrition & Hydration'
  | 'Sun & Skin Care'
  | 'Tools & Accessories'
  | 'Camping & Safety'
