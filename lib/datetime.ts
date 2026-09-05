// Centralized date/time/locale config for the whole app.
//
// The app is single-country for now (Colombia), so we pin both the display
// locale and the timezone here instead of trusting each device's OS
// settings — Vercel's serverless functions default to UTC regardless of
// where the restaurant is, and a customer's phone can be set to any
// timezone. Every stored timestamp is a real UTC instant (`new Date()`,
// Postgres `timestamp`); only *display* needs a fixed zone/locale, which is
// what these helpers centralize. If the product ever expands outside
// Colombia, this is the one place to make it per-restaurant instead of
// global.
export const APP_LOCALE = 'es-CO'
export const APP_TIMEZONE = 'America/Bogota'
// Colombia does not observe daylight saving time, so this offset is fixed
// year-round — safe to hardcode for parsing "local" date/time form inputs.
export const APP_UTC_OFFSET = '-05:00'

export function formatDateTime(date: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }): string {
  return date.toLocaleString(APP_LOCALE, { timeZone: APP_TIMEZONE, ...opts })
}

export function formatDate(date: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return date.toLocaleDateString(APP_LOCALE, { timeZone: APP_TIMEZONE, ...opts })
}

export function formatTime(date: Date, opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }): string {
  return date.toLocaleTimeString(APP_LOCALE, { timeZone: APP_TIMEZONE, ...opts })
}

// Parses a `<input type="date">` + `<input type="time">` pair as Bogotá
// local time, regardless of the browser's own timezone, and returns the
// equivalent UTC ISO string. Using `new Date(`${date}T${time}`)` instead
// would silently interpret the input in the *browser's* timezone, which is
// wrong if a customer's device happens to be set to another zone.
export function parseBogotaDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00${APP_UTC_OFFSET}`).toISOString()
}
