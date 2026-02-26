'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import type { NewRouteData } from '@/lib/submission-types'
import type { ImageSelection } from '@/lib/submission-types'

interface RoutePreviewProps {
  imageSelection: ImageSelection
  routes: NewRouteData[]
}

interface ImageRenderInfo {
  naturalWidth: number
  naturalHeight: number
  renderedX: number
  renderedY: number
  renderedWidth: number
  renderedHeight: number
}

export default function RoutePreview({ imageSelection, routes }: RoutePreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageInfo, setImageInfo] = useState<ImageRenderInfo | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const imageUrl = imageSelection.mode === 'existing' ? imageSelection.imageUrl : imageSelection.uploadedUrl

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageLoaded(true)
    const img = e.currentTarget
    const container = containerRef.current
    if (!container) return

    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight

    const containerRect = container.getBoundingClientRect()
    const containerAspectRatio = containerRect.width / containerRect.height
    const imageAspectRatio = naturalWidth / naturalHeight

    let renderedWidth = containerRect.width
    let renderedHeight = containerRect.height
    let renderedX = 0
    let renderedY = 0

    if (imageAspectRatio > containerAspectRatio) {
      renderedHeight = containerRect.width / imageAspectRatio
      renderedY = (containerRect.height - renderedHeight) / 2
    } else {
      renderedWidth = containerRect.height * imageAspectRatio
      renderedX = (containerRect.width - renderedWidth) / 2
    }

    setImageInfo({
      naturalWidth,
      naturalHeight,
      renderedX,
      renderedY,
      renderedWidth,
      renderedHeight
    })
  }

  return (
    <div ref={containerRef} className="relative w-full h-[500px] flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
      <Image
        src={imageUrl}
        alt="Route preview"
        fill
        unoptimized
        sizes="100vw"
        className={`object-contain ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={handleImageLoad}
        draggable={false}
      />
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      )}
      {imageInfo && (
        <svg
          className="absolute pointer-events-none"
          style={{
            left: imageInfo.renderedX,
            top: imageInfo.renderedY,
            width: imageInfo.renderedWidth,
            height: imageInfo.renderedHeight
          }}
          viewBox={`0 0 ${imageInfo.naturalWidth} ${imageInfo.naturalHeight}`}
        >
          {routes.map((route, index) => {
            const points = route.points.map(p => `${p.x * imageInfo.naturalWidth},${p.y * imageInfo.naturalHeight}`).join(' ')
            return (
              <g key={route.id}>
                <polyline
                  points={points}
                  stroke="#dc2626"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx={route.points[0].x * imageInfo.naturalWidth}
                  cy={route.points[0].y * imageInfo.naturalHeight}
                  r="12"
                  fill="#dc2626"
                />
                <text
                  x={route.points[0].x * imageInfo.naturalWidth}
                  y={route.points[0].y * imageInfo.naturalHeight}
                  fill="white"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {index + 1}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
