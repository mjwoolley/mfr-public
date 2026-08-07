// The photo upload path, exercised against a real deployed preview.
//
// WHY THIS EXISTS, AND WHY IT CAN'T LIVE IN THE NORMAL SUITE
// On 2026-07-22 a Dependabot bump of sharp (0.34.5 → 0.35.3, for a libvips CVE)
// broke *every* gallery upload for *every* member for days. All of CI was green.
// It could only fail in production because the break was environment-specific:
// in the Vercel runtime 0.35.3 doesn't load `@img/sharp-linux-x64` and silently
// falls back to WASM, whose SharedArrayBuffer-backed Buffers `fetch` rejects.
// GitHub's Ubuntu runners resolve that binary differently, so nothing on a CI
// box could reproduce it.
//
// Everything else about uploads is mocked or skipped:
//   - integration tests mock `lib/photos/blobStore` (deliberately — see its header)
//   - e2e/tests/gallery.spec.ts says outright that real upload isn't exercisable
//     in CI (no Blob token) and defers to "integration tests + preview smoke"
// This file is that preview smoke. It is the only place the real
// browser → Blob → sharp → store → row path runs end to end.
//
// `scripts/smoke.mjs` can't do this job: it is plain `fetch`, and the sharp work
// happens inside `finalizeUpload`, a Server Action. Server Actions are invoked
// with Next's internal protocol and a build-generated action id, so only a real
// browser can drive them. Hence Playwright.
//
// PREVIEW ONLY. It writes. Never point it at production:
//   - the row lands in the preview's own Neon branch (disposable, forked from prod)
//   - but BLOB_READ_WRITE_TOKEN is shared across Production/Preview/Development,
//     so the image object itself lands in the PRODUCTION blob store. The test
//     deletes it through the UI, which calls del() on the blob (see deletePhoto →
//     safeDeleteBlob). A crash between upload and delete leaks one orphan; the
//     `gallery-tmp/` sweep item on the backlog is the general fix.

import { test, expect, type Page } from '@playwright/test'
import sharp from 'sharp'

const BASE = process.env.PREVIEW_URL
const TOKEN = process.env.SMOKE_SESSION_TOKEN

// The browser streams the original to Blob, then the Server Action re-encodes it
// with sharp. Must stay comfortably under the per-test timeout in
// playwright.preview.config.ts, or the test dies before it can report *why*.
const UPLOAD_TIMEOUT = 90_000

// A 3:2 JPEG with no EXIF, so the app files it under the current year via its
// upload-date fallback. Generated rather than committed so the fixture can't
// drift from what the uploader accepts.
async function testImage(label: string): Promise<Buffer> {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
       <rect width="1200" height="800" fill="#c96f3f"/>
       <text x="600" y="400" font-family="sans-serif" font-size="44"
             fill="white" text-anchor="middle">${label}</text>
     </svg>`,
  )
  return sharp(svg).jpeg({ quality: 80 }).toBuffer()
}

/** Every gallery tile renders one <img>; nothing else on /photos does. Used as a
 *  before/after delta, so any fixed number of non-photo images cancels out. */
const tiles = (page: Page) => page.locator('img')

/**
 * The uploader's per-file failure panel.
 *
 * NOT `getByRole('alert')`: Next.js injects its own permanently-present, always
 * empty `<div role="alert" aria-live="assertive" id="__next-route-announcer__">`
 * on every page. That makes the plain role query resolve to two elements — a
 * strict-mode violation, and worse, it can satisfy a "wait for an alert" before
 * the real panel exists. Excluding it by id is what makes the diagnostic
 * reliable. Anything else in this repo asserting on alerts needs the same care.
 */
const failurePanel = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)')

test.describe('preview: real photo upload', () => {
  test.skip(!BASE || !TOKEN, 'PREVIEW_URL and SMOKE_SESSION_TOKEN are required')

  test('a member uploads a photo, sees it, and deletes it', async ({ browser }) => {
    const base = BASE as string
    const context = await browser.newContext({ baseURL: base })

    // Auth.js prefixes the session cookie with __Secure- over https and drops it
    // over http — same rule as scripts/smoke.mjs:96. Deriving it from the URL
    // (rather than hardcoding the https name) lets this spec be pointed at a
    // local server to verify the spec itself. The preview's Neon branch is forked
    // from production, so it inherits the seeded smoke session row and the prod
    // token authenticates here.
    const isHttps = base.startsWith('https://')
    await context.addCookies([
      {
        name: isHttps ? '__Secure-authjs.session-token' : 'authjs.session-token',
        value: TOKEN as string,
        domain: new URL(base).hostname,
        path: '/',
        httpOnly: true,
        secure: isHttps,
        sameSite: 'Lax',
      },
    ])

    const page = await context.newPage()
    // The lightbox delete goes through window.confirm; an unhandled dialog would
    // hang the run.
    page.on('dialog', (d) => d.accept())

    const filename = `preview-smoke-${Date.now()}.jpg`
    const buffer = await testImage('preview upload smoke')

    await page.goto('/photos')
    await expect(page.getByRole('heading', { name: 'Albums' })).toBeVisible()
    const before = await tiles(page).count()

    let uploaded = false
    try {
      await page
        .locator('input[type="file"]')
        .setInputFiles({ name: filename, mimeType: 'image/jpeg', buffer })

      // Race the two outcomes rather than waiting out the full timeout and then
      // looking for an error: the uploader reports per-file failures in a
      // role="alert" panel, and that text is the whole point of this test. For
      // the sharp regression it says "SharedArrayBuffer is not allowed" instead
      // of a bare "expected 38 tiles, got 37". Each side swallows its own
      // timeout so the race resolves instead of rejecting.
      const alert = failurePanel(page)
      const outcome = await Promise.race([
        tiles(page)
          .nth(before)
          .waitFor({ timeout: UPLOAD_TIMEOUT })
          .then(() => 'added' as const)
          .catch(() => 'timeout' as const),
        alert
          .waitFor({ state: 'visible', timeout: UPLOAD_TIMEOUT })
          .then(() => 'failed' as const)
          .catch(() => 'timeout' as const),
      ])

      if (outcome === 'failed') {
        // Reading the instant the panel turns visible yields an empty string —
        // its content settles a beat later. Poll until there is something to
        // report, or the failure message is useless (which is the whole point of
        // this test). textContent, not innerText: innerText is layout-dependent
        // and was empty here even after the text had landed.
        let reported = ''
        await expect
          .poll(
            async () => {
              reported = ((await alert.textContent()) ?? '').trim()
              return reported.length
            },
            { timeout: 15_000, message: 'the failure alert never rendered any text' },
          )
          .toBeGreaterThan(0)
        throw new Error(`Upload failed — the app reported:\n${reported}`)
      }
      if (outcome === 'timeout') {
        throw new Error(
          `Upload neither completed nor reported an error within ${UPLOAD_TIMEOUT}ms. ` +
            `The Server Action (finalizeUpload → sharp) most likely hung or crashed silently.`,
        )
      }
      uploaded = true

      // Newest first, so the upload is the first tile. Opening it and matching
      // the filename is what makes that positional assumption safe.
      await tiles(page).first().click()
      await expect(page.getByText(filename)).toBeVisible()
    } finally {
      if (uploaded) {
        // Best effort: never leave an object in the production blob store.
        await page
          .getByRole('button', { name: 'Delete' })
          .click()
          .catch(() => {})
      }
    }

    await expect(tiles(page)).toHaveCount(before)
    await context.close()
  })
})
