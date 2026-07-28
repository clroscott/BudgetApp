import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const sourcePath = path.join(
  projectDirectory,
  'public',
  'brand',
  'logo-mark.png',
)
const outputDirectory = path.join(
  projectDirectory,
  'public',
  'generated',
)

await mkdir(outputDirectory, { recursive: true })

for (const size of [192, 512]) {
  const { data, info } = await sharp(sourcePath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // The original cutout was created against white, so its partially
  // transparent edge pixels still contain white RGB values. Remove that
  // matte before Windows or Chromium composites the icon on the taskbar.
  for (let index = 0; index < data.length; index += info.channels) {
    const alpha = data[index + 3]
    if (alpha === 0 || alpha === 255) continue

    const opacity = alpha / 255
    for (let channel = 0; channel < 3; channel += 1) {
      const unmatted = (
        data[index + channel] - 255 * (1 - opacity)
      ) / opacity
      data[index + channel] = Math.max(
        0,
        Math.min(255, Math.round(unmatted)),
      )
    }
  }

  const contractedAlpha = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .extractChannel(3)
    .erode(size === 512 ? 6 : 2)
    .raw()
    .toBuffer()

  for (
    let pixel = 0, alphaIndex = 3;
    pixel < contractedAlpha.length;
    pixel += 1, alphaIndex += info.channels
  ) {
    data[alphaIndex] = contractedAlpha[pixel]
  }

  const shadowStart = Math.floor(size * 0.85)
  for (let y = shadowStart; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels
      const red = data[index]
      const green = data[index + 1]
      const blue = data[index + 2]
      const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue)
      if (colorSpread <= 18 || red > 35) data[index + 3] = 0
    }
  }

  for (let index = 0; index < data.length; index += info.channels) {
    if (data[index + 3] !== 0) continue
    data[index] = 0
    data[index + 1] = 0
    data[index + 2] = 0
  }

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(path.join(outputDirectory, `app-icon-${size}.png`))
}

console.log('Generated install icons from public/brand/logo-mark.png.')
