'use client'

import { useState, useMemo } from 'react'
import { products, CATEGORIES } from '@/lib/gear-data'
import GearCard from '@/components/gear/GearCard'
import CategoryTabs from '@/components/gear/CategoryTabs'
import { Search } from 'lucide-react'

export default function GearPage() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = activeCategory === 'All' || product.category === activeCategory
      const matchesSearch =
        searchQuery === '' ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.category.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [activeCategory, searchQuery])

  return (
    <div className="container mx-auto px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-2 mb-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Affiliate links - we earn a commission on purchases at no extra cost to you.
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

        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              No products found matching your search.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Showing {filteredProducts.length} of {products.length} products
            </p>

            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map((product) => (
                <GearCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
