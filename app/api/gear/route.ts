import { NextResponse } from 'next/server'
import { CATEGORIES, products } from '@/features/gear/lib/gear-catalog'

export async function GET() {
  return NextResponse.json({ products, categories: [...CATEGORIES] })
}
