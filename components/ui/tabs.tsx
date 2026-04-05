'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={className} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex -mb-px overflow-x-auto border-b border-gray-200 dark:border-gray-700', className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'border-b-2 border-transparent px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-500 transition-colors outline-none hover:text-gray-700 hover:border-gray-300 focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600 data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 dark:data-[state=active]:border-gray-100 dark:data-[state=active]:text-white',
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={className} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
