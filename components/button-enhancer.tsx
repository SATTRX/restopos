"use client"

import { useEffect } from 'react'

export default function ButtonEnhancer() {
  useEffect(() => {
    const labels = ['Nueva venta', 'Agregar nuevo']
    labels.forEach((text) => {
      const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
      buttons.forEach((b) => {
        if (b.textContent && b.textContent.trim().includes(text)) {
          b.setAttribute('type', 'button')
          b.setAttribute('aria-label', text)
          b.classList.add('px-4', 'h-11', 'inline-flex', 'items-center', 'gap-2')
          if (!b.classList.contains('bg-primary')) b.classList.add('bg-primary')
          if (!b.classList.contains('text-primary-foreground')) b.classList.add('text-primary-foreground')
        }
      })
    })
  }, [])

  return null
}
