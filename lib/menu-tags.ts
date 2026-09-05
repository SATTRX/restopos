// Common optional dietary/spice labels offered in the product form. Kept out
// of app/actions/menu.ts because a 'use server' file may only export async
// functions — a plain constant export breaks the build.
import { Flame, Leaf, Milk, Nut, Sprout, Tag, Wheat, WheatOff, type LucideIcon } from 'lucide-react'

export const COMMON_PRODUCT_TAGS = ['Picante', 'Con gluten', 'Sin gluten', 'Vegetariano', 'Vegano', 'Con lácteos', 'Con nueces']

// Icon shown next to each tag (product form picker, Carta list, and the
// public menu) so they read at a glance instead of as plain text pills.
// Anything outside this map (a restaurant's own custom tag) falls back to
// a generic tag icon — lucide-react components render fine in both client
// components and server components (like app/carta/[slug]/page.tsx).
const TAG_ICONS: Record<string, LucideIcon> = {
  'Picante': Flame,
  'Con gluten': Wheat,
  'Sin gluten': WheatOff,
  'Vegetariano': Leaf,
  'Vegano': Sprout,
  'Con lácteos': Milk,
  'Con nueces': Nut,
}

export function iconForTag(tag: string): LucideIcon {
  return TAG_ICONS[tag] ?? Tag
}
