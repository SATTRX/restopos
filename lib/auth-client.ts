'use client'

import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'
// Type-only import: erased at compile time, so the server auth config
// (and its `pool`/`pg` dependencies) never reaches the client bundle.
import type { auth } from '@/lib/auth'

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
})
export const { signIn, signUp, signOut, useSession } = authClient
