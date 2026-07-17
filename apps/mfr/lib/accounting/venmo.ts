export interface VenmoConfig {
  url: string
  handle: string
}

/**
 * Venmo is configured entirely by env (set in Vercel). When unset, the
 * "Contribute via Venmo" button is hidden — return null and render nothing.
 */
export function getVenmoConfig(): VenmoConfig | null {
  const url = process.env.NEXT_PUBLIC_VENMO_URL
  if (!url) return null
  const handle =
    process.env.NEXT_PUBLIC_VENMO_HANDLE ?? `@${url.replace(/\/+$/, '').split('/').pop()}`
  return { url, handle }
}
