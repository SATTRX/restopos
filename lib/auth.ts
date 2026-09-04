import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'

const resolveBaseUrl = (): string | undefined => {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.V0_RUNTIME_URL
}

export const auth = betterAuth({
  // Only pass `database` when a real pool exists; otherwise allow the
  // library to choose the in-memory adapter for development.
  ...(pool ? { database: pool } : {}),
  // Use BETTER_AUTH_SECRET or fallback to AUTH_SECRET if provided
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  baseURL: resolveBaseUrl(),
  user: {
    additionalFields: {
      // Distinguishes a restaurant account from a platform administrator.
      // Set at sign-up time from the tab the person picked on /acceso.
      role: { type: 'string', required: false, defaultValue: 'restaurant', input: true },
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Block sign-in (and the auto sign-in above) until the address is confirmed.
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, name: user.name, url })
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []), ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []), ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []), ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : [])] : []),
    ...(process.env.NODE_ENV === 'production' ? [...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []), ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : [])] : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  ...(process.env.NODE_ENV === 'development' ? { advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } } : {}),
})
