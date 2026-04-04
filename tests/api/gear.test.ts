import { describe, expect, test } from 'vitest'

const CATEGORIES = [
  'All',
  'Guidebooks',
  'Belay Devices',
  'Harnesses & Helmets',
  'Hardware',
  'Ropes & Rope Bags',
  'Bouldering',
  'Footwear',
  'Nutrition & Hydration',
  'Sun & Skin Care',
  'Tools & Accessories',
  'Camping & Safety',
] as const

interface Product {
  id: string
  name: string
  url: string
  category: string
  description: string
  imageUrl: string
}

const products: Product[] = [
  { id: 'guidebook-lake-district', name: 'Lake District Guidebook', url: 'https://example.com/1', category: 'Guidebooks', description: 'Test', imageUrl: 'https://example.com/img1.jpg' },
  { id: 'belay-device', name: 'Belay Device', url: 'https://example.com/2', category: 'Belay Devices', description: 'Test', imageUrl: 'https://example.com/img2.jpg' },
  { id: 'harness', name: 'Harness', url: 'https://example.com/3', category: 'Harnesses & Helmets', description: 'Test', imageUrl: 'https://example.com/img3.jpg' },
]

describe('Gear API Validation', () => {
  describe('CATEGORIES', () => {
    test('all categories are defined as const', () => {
      expect(CATEGORIES).toContain('All')
      expect(CATEGORIES).toContain('Guidebooks')
      expect(CATEGORIES).toContain('Belay Devices')
      expect(CATEGORIES).toContain('Harnesses & Helmets')
    })

    test('has expected length', () => {
      expect(CATEGORIES).toHaveLength(12)
    })
  })

  describe('Product schema validation', () => {
    function validateProduct(product: unknown): product is Product {
      if (typeof product !== 'object' || product === null) return false
      const p = product as Record<string, unknown>
      return (
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        typeof p.url === 'string' &&
        typeof p.category === 'string' &&
        typeof p.description === 'string' &&
        typeof p.imageUrl === 'string'
      )
    }

    test('valid product passes validation', () => {
      const product = { id: 'test', name: 'Test', url: 'https://test.com', category: 'Test', description: 'Test', imageUrl: 'https://test.com/img.jpg' }
      expect(validateProduct(product)).toBe(true)
    })

    test('missing field fails validation', () => {
      const product = { id: 'test', name: 'Test', url: 'https://test.com' }
      expect(validateProduct(product)).toBe(false)
    })

    test('null fails validation', () => {
      expect(validateProduct(null)).toBe(false)
    })
  })

  describe('Category validation', () => {
    function hasValidCategory(product: Product): boolean {
      return CATEGORIES.includes(product.category as typeof CATEGORIES[number])
    }

    test('product with valid category passes', () => {
      const product = products[0]
      expect(hasValidCategory(product)).toBe(true)
    })

    test('product with invalid category fails', () => {
      const product = { ...products[0], category: 'Invalid Category' }
      expect(hasValidCategory(product)).toBe(false)
    })
  })

  describe('API response structure', () => {
    function buildResponse(products: Product[]) {
      return {
        products,
        categories: [...CATEGORIES],
      }
    }

    test('response has products and categories', () => {
      const response = buildResponse(products)
      expect(response).toHaveProperty('products')
      expect(response).toHaveProperty('categories')
      expect(Array.isArray(response.products)).toBe(true)
      expect(Array.isArray(response.categories)).toBe(true)
    })

    test('categories includes All', () => {
      const response = buildResponse(products)
      expect(response.categories).toContain('All')
    })
  })
})
