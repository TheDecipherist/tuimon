import sharp from 'sharp'

const CHUNK_SIZE = 4096
const MAX_PALETTE_COLORS = 256

export async function encodeAndRender(
  buffer: Buffer,
  opts: { protocol: 'kitty' | 'sixel' },
): Promise<void> {
  if (opts.protocol === 'kitty') {
    renderKitty(buffer)
  } else {
    await renderSixel(buffer)
  }
}

function renderKitty(buffer: Buffer): void {
  process.stdout.write('\x1b[H')

  const b64 = buffer.toString('base64')
  const chunks: string[] = []
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    chunks.push(b64.slice(i, i + CHUNK_SIZE))
  }

  for (let i = 0; i < chunks.length; i++) {
    const hasMore = i < chunks.length - 1
    if (i === 0) {
      process.stdout.write(`\x1b_Ga=T,f=100,m=${hasMore ? 1 : 0};${chunks[i]}\x1b\\`)
    } else {
      process.stdout.write(`\x1b_Gm=${hasMore ? 1 : 0};${chunks[i]}\x1b\\`)
    }
  }
}

async function renderSixel(buffer: Buffer): Promise<void> {
  process.stdout.write('\x1b[H')

  let image: sharp.Sharp
  try {
    image = sharp(buffer)
  } catch (err) {
    console.error('[tuimon] encoder: invalid image buffer', err)
    return
  }

  const meta = await image.metadata()
  const width = meta.width ?? 1
  const height = meta.height ?? 1

  const { data, info } = await image
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true })

  // Build color palette (up to 256 colors)
  const colorMap = new Map<string, number>()
  let nextColor = 0
  let paletteOverflow = false

  const pixels: number[] = new Array(width * height)

  for (let i = 0; i < width * height; i++) {
    const offset = i * info.channels
    const r = data[offset] ?? 0
    const g = data[offset + 1] ?? 0
    const b = data[offset + 2] ?? 0
    const key = `${r},${g},${b}`
    if (!colorMap.has(key) && nextColor < MAX_PALETTE_COLORS) {
      colorMap.set(key, nextColor++)
    } else if (!colorMap.has(key) && !paletteOverflow) {
      paletteOverflow = true
      console.error(`[tuimon] sixel: image has >256 colors — some colors will be approximated`)
    }
    pixels[i] = colorMap.get(key) ?? 0
  }

  // Write DCS header and raster attributes
  process.stdout.write(`\x1bP0;0;0q"1;1;${width};${height}`)

  // Write color definitions
  for (const [key, idx] of colorMap.entries()) {
    const parts = key.split(',').map(Number)
    const r = parts[0] ?? 0
    const g = parts[1] ?? 0
    const b = parts[2] ?? 0
    const rp = Math.round((r / 255) * 100)
    const gp = Math.round((g / 255) * 100)
    const bp = Math.round((b / 255) * 100)
    process.stdout.write(`#${idx};2;${rp};${gp};${bp}`)
  }

  // Write sixel rows in chunks (groups of 6 vertical pixels)
  for (let y = 0; y < height; y += 6) {
    const rowColors = new Map<number, number[]>()

    for (let x = 0; x < width; x++) {
      const sixelByte = new Map<number, number>()

      for (let dy = 0; dy < 6; dy++) {
        const py = y + dy
        if (py >= height) break
        const colorIdx = pixels[py * width + x] ?? 0
        sixelByte.set(colorIdx, (sixelByte.get(colorIdx) ?? 0) | (1 << dy))
      }

      for (const [colorIdx, bits] of sixelByte.entries()) {
        if (!rowColors.has(colorIdx)) {
          rowColors.set(colorIdx, new Array(width).fill(0))
        }
        rowColors.get(colorIdx)![x] = bits
      }
    }

    let bandData = ''
    let first = true
    for (const [colorIdx, row] of rowColors.entries()) {
      if (!first) bandData += '$'
      first = false
      bandData += `#${colorIdx}`
      for (let x = 0; x < width; x++) {
        bandData += String.fromCharCode(63 + (row[x] ?? 0))
      }
    }
    bandData += '-'
    process.stdout.write(bandData)
  }

  // String terminator
  process.stdout.write('\x1b\\')
}
