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
      className={cn(
        'flex gap-2 overflow-x-auto border-b border-gray-200 px-4 py-3 scrollbar-none sm:px-6 dark:border-gray-700',
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
      <TabsPrimitive.Trigger
        data-slot="tabs-trigger"
        className={cn(
          'inline-flex min-h-11 items-center rounded-full border border-transparent px-4 py-2.5 text-sm font-medium whitespace-nowrap text-gray-500 transition-[color,background-color,border-color,box-shadow] outline-none hover:border-gray-200 hover:bg-gray-100 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 data-[state=active]:border-gray-900 data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:border-gray-100 dark:data-[state=active]:bg-gray-100 dark:data-[state=active]:text-gray-950',
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
