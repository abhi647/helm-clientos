// Builds the PNG artwork the emails use (public/email/*.png): icon badges and the wave edge under the banner.
// PNG, not SVG: Outlook does not show SVG and spam filters score it. Run again after changing the list:
//   node scripts/email-art.mjs
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as icons from 'lucide-react'
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const out = new URL('../public/email/', import.meta.url).pathname
mkdirSync(out, { recursive: true })

// keep in step with BADGES in src/lib/email-copy.ts
const COLORS = { inky: '#13343b', peacock: '#2e575d', turq: '#208090', terra: '#a94b31', berry: '#954455' }
const BADGES = {
  'compass-inky': 'Compass', 'hand-inky': 'Hand', 'at-inky': 'AtSign', 'wheel-inky': 'ShipWheel', 'key-inky': 'KeyRound',
  'flag-turq': 'Flag', 'sailboat-turq': 'Sailboat', 'anchor-turq': 'Anchor', 'telescope-turq': 'Telescope',
  'reply-peacock': 'MessageCircleReply', 'wheel-peacock': 'ShipWheel', 'bottle-peacock': 'MailOpen', 'pencil-peacock': 'PencilLine',
  'sailboat-peacock': 'Sailboat', 'receipt-peacock': 'ReceiptText',
  'siren-terra': 'Siren', 'wind-terra': 'Wind', 'star-berry': 'Star',
}
// small icons on a pale disc, for lists inside the body
const MINI = { 'eye-mini': 'Eye', 'ask-mini': 'MessageCirclePlus', 'check-mini': 'CircleCheckBig' }

const svgOf = (name, color, size) =>
  renderToStaticMarkup(createElement(icons[name], { color, size, strokeWidth: 2 }))

async function badge(file, name, ring, fill, color, px, icon) {
  const pad = (px - icon) / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}">
    <circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="${ring}"/>
    <circle cx="${px / 2}" cy="${px / 2}" r="${px / 2 - px * 0.07}" fill="${fill}"/>
    <g transform="translate(${pad},${pad})">${svgOf(name, color, icon)}</g></svg>`
  await sharp(Buffer.from(svg)).png().toFile(out + file + '.png')
}

for (const [file, name] of Object.entries(BADGES)) {
  const color = COLORS[file.split('-').pop()]
  await badge(file, name, 'rgba(255,255,255,0.35)', '#ffffff', color, 128, 60)   // shown at 64px
}
for (const [file, name] of Object.entries(MINI)) await badge(file, name, '#d3eaec', '#e8f4f5', COLORS.turq, 72, 36)   // shown at 36px

// the white wave that the banner rolls into (1120×44, shown at 560×22)
const W = 1120, H = 44
let d = `M0 ${H} L0 24`
for (let x = 0; x < W; x += 140) d += ` Q${x + 35} 6 ${x + 70} 22 T${x + 140} 22`
d += ` L${W} ${H} Z`
let d2 = `M0 ${H} L0 30`
for (let x = -70; x < W; x += 140) d2 += ` Q${x + 35} 16 ${x + 70} 30 T${x + 140} 30`
d2 += ` L${W} ${H} Z`
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <path d="${d}" fill="#ffffff" fill-opacity="0.28"/><path d="${d2}" fill="#ffffff"/></svg>`)).png().toFile(out + 'wave.png')
console.log('email art written to', out)
