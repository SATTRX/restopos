// Common optional dietary/spice labels offered in the product form. Kept out
// of app/actions/menu.ts because a 'use server' file may only export async
// functions — a plain constant export breaks the build.
export const COMMON_PRODUCT_TAGS = ['Picante', 'Con gluten', 'Sin gluten', 'Vegetariano', 'Vegano', 'Con lácteos', 'Con nueces']
