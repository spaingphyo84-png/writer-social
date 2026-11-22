import crypto from 'node:crypto'
import { ALLOWED_IMAGE_MIMES, validateImageBuffer, validateImageFile } from './validation.js'

const CLOUDINARY_FOLDER = 'writers-realm'
const CLOUDINARY_TIMEOUT_MS = 15000

function fromUrl() {
  const raw = String(process.env.CLOUDINARY_URL || '').trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (!parsed.hostname || !parsed.username || !parsed.password) return null
    return {
      cloudName: decodeURIComponent(parsed.hostname),
      apiKey: decodeURIComponent(parsed.username),
      apiSecret: decodeURIComponent(parsed.password),
    }
  } catch {
    return null
  }
}

export function cloudinaryConfig() {
  const fromEnvUrl = fromUrl()
  const config = {
    cloudName: String(process.env.CLOUDINARY_CLOUD_NAME || fromEnvUrl?.cloudName || '').trim(),
    apiKey: String(process.env.CLOUDINARY_API_KEY || fromEnvUrl?.apiKey || '').trim(),
    apiSecret: String(process.env.CLOUDINARY_API_SECRET || fromEnvUrl?.apiSecret || '').trim(),
  }
  return Object.values(config).every(Boolean) ? config : null
}

function signatureFor(params, apiSecret) {
  const sorted = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&')
  return crypto.createHash('sha1').update(`${sorted}${apiSecret}`).digest('hex')
}

function cloudinaryHostIsValid(url, cloudName) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return parsed.hostname === `${cloudName}.res.cloudinary.com` || parsed.hostname === 'res.cloudinary.com'
  } catch {
    return false
  }
}

async function uploadToCloudinary(file, config) {
  const timestamp = Math.floor(Date.now() / 1000)
  const params = { folder: CLOUDINARY_FOLDER, timestamp }
  const body = new FormData()
  body.set('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'image')
  for (const [key, value] of Object.entries(params)) body.set(key, String(value))
  body.set('api_key', config.apiKey)
  body.set('signature', signatureFor(params, config.apiSecret))

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(CLOUDINARY_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Cloudinary upload failed with status ${response.status}`)
  const result = await response.json()
  const secureUrl = String(result?.secure_url || '')
  if (!cloudinaryHostIsValid(secureUrl, config.cloudName)) throw new Error('Cloudinary returned an invalid image URL')
  return secureUrl
}

export async function storeImage(file, lang = 'en') {
  if (!file) return null

  const error = validateImageFile(file, lang) || validateImageBuffer(file, lang)
  if (error) {
    const failure = new Error(error)
    failure.status = 400
    throw failure
  }

  const mime = ALLOWED_IMAGE_MIMES.includes(String(file.mimetype).toLowerCase())
    ? String(file.mimetype).toLowerCase()
    : 'image/png'
  const config = cloudinaryConfig()
  if (config) {
    try {
      return await uploadToCloudinary(file, config)
    } catch (uploadError) {
      console.warn('[writer-realm] Cloudinary upload failed; storing the image in the database instead:', uploadError?.message)
    }
  }
  return `data:${mime};base64,${file.buffer.toString('base64')}`
}
