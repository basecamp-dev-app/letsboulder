'use client'

import { useState, useEffect, useMemo } from 'react'
import { products, CATEGORIES } from '@/lib/gear-data'
import GearCard from '@/components/gear/GearCard'
import GearSkeleton from '@/components/gear/GearSkeleton'
import CategoryTabs from '@/components/gear/CategoryTabs'
import { Search } from 'lucide-react'

export default function GearPage() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/gear-clicks')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data === 'object') {
          setClickCounts(data)
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch click counts:', err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const sortedProducts = useMemo(() => {
    const sorted = [...products].sort((a, b) => {
      const countA = clickCounts[a.id] || 0
      const countB = clickCounts[b.id] || 0
      return countB - countA
    })

    return sorted.filter((product) => {
      const matchesCategory = activeCategory === 'All' || product.category === activeCategory
      const matchesSearch =
        searchQuery === '' ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.category.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [activeCategory, searchQuery, clickCounts])

  return (
    <div className="container mx-auto px-4">
        <div className="max-w-7xl mx-auto">
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-2 mb-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Amazon affiliate links - we earn a commission on Amazon purchases at no extra cost to you.
          </p>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
          />
        </div>

        <div className="mb-2">
          <CategoryTabs
            categories={CATEGORIES}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
            {Array(12).map((_, i) => <GearSkeleton key={i} />)}
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              No products found matching your search.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Showing {sortedProducts.length} of {products.length} products
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
              {sortedProducts.map((product) => (
                <GearCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
