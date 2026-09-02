// Regenerates the two brand images that the official kit does not ship:
// the Android maskable icon and the 1200x630 social card.
//
// Run from the repo root:  node scripts/generate-brand-images.mjs
//
// Note: `sharp` is not a direct dependency — it is pulled in transitively by
// Next's image optimiser. This script is a one-off asset tool, never part of
// the build or CI, so that is acceptable; if the import ever fails, install
// sharp locally rather than adding it to package.json.
import sharp from 'sharp'

const WASH = { r: 0xff, g: 0xfa, b: 0xfd, alpha: 1 } // kit page background #fffafd
const TINT = { r: 0xfb, g: 0xd5, b: 0xe4, alpha: 1 } // brand pink-light #fbd5e4

// Maskable icon. Android crops maskable icons to its own shape, keeping only
// the inner 80%, so this is built from the bare shuttlecock rather than
// favicon-512.png — that file has its own thin circular ring, which would be
// sliced through by the launcher's mask and look like a rendering fault. The
// mark is scaled to 55% of the canvas to stay inside the safe zone, and the
// background is opaque because a transparent maskable renders as black.
const mark = await sharp('public/brand/icon-shuttlecock.png')
  .resize(282, 282, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: TINT } })
  .composite([{ input: mark, gravity: 'centre' }])
  .png()
  .toFile('public/brand/icon-maskable-512.png')

// Social card. 1200x630 is the size Facebook, X, Slack and iMessage all crop
// toward; the poster itself is portrait and would be letterboxed by every one
// of them.
const logo = await sharp('public/brand/logo-primary.png')
  .resize(820, null, { fit: 'inside' })
  .toBuffer()
await sharp({ create: { width: 1200, height: 630, channels: 4, background: WASH } })
  .composite([{ input: logo, gravity: 'centre' }])
  .png()
  .toFile('public/brand/og-card.png')

for (const f of ['icon-maskable-512.png', 'og-card.png']) {
  const m = await sharp('public/brand/' + f).metadata()
  console.log(f, `${m.width}x${m.height}`)
}
