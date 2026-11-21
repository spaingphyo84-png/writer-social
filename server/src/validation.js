import { t } from './messages.js'
import { containsSpam, isGibberishName } from './spam.js'

export const CATEGORIES = ['poem', 'story', 'general']
export const REACTIONS = ['love', 'haha', 'sad']
export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp']
export const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp']
export const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.ogv', '.3gp', '.wmv', '.flv']
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

export function langFromRequest(req) {
  const requested = req.query?.lang ?? req.body?.lang
  if (requested === 'my' || requested === 'en') return requested
  const header = String(req.headers?.['accept-language'] ?? '')
  return /^my\b/i.test(header) ? 'my' : 'en'
}

const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const ENTITY_PATTERN = /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi

function decodeEntity(match, code) {
  const name = code.toLowerCase()
  if (name.startsWith('#x') || name.startsWith('#')) {
    const point = name.startsWith('#x') ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
  }
  return HTML_ENTITIES[name] ?? match
}

export function sanitizeText(value) {
  let text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replace(ENTITY_PATTERN, decodeEntity)
    if (decoded === text) break
    text = decoded
  }
  return text
    .replace(/<!--[\s\S]*?-->/gi, '')
    .replace(/<![a-z][^>]*>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .trim()
}

export function cleanText(value, maxLength = 20000) {
  return typeof value === 'string' ? sanitizeText(value).slice(0, maxLength) : ''
}

export function isVideoFile(file) {
  if (!file) return false
  const mime = String(file.mimetype || '').toLowerCase()
  const name = String(file.originalname || '').toLowerCase()
  return mime.startsWith('video/') || VIDEO_EXT.some((ext) => name.endsWith(ext))
}

export function validateImageFile(file, lang = 'en') {
  if (!file) return null
  if (isVideoFile(file)) return t(lang, 'video_blocked')
  const mime = String(file.mimetype || '').toLowerCase()
  const name = String(file.originalname || '').toLowerCase()
  const hasImageMime = ALLOWED_IMAGE_MIMES.includes(mime)
  const hasImageExt = ALLOWED_IMAGE_EXT.some((ext) => name.endsWith(ext))
  if (!hasImageMime || !hasImageExt) return t(lang, 'invalid_image_type')
  if (Number(file.size) > MAX_UPLOAD_BYTES) return t(lang, 'file_too_large')
  return null
}

export function validateImageBuffer(file, lang = 'en') {
  if (!file) return null
  const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.alloc(0)
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  const isWebp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
  if (!isPng && !isJpeg && !isWebp) return t(lang, 'invalid_image_type')
  return null
}

export function validateRegister(body, lang = 'en') {
  const authorName = cleanText(body.authorName ?? body.author_name, 80)
  const penName = cleanText(body.penName ?? body.pen_name, 80)
  const email = cleanText(body.email, 160).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const bio = cleanText(body.bio, 1000)
  if (!authorName || !penName || !email || !password) return { error: t(lang, 'missing_fields') }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t(lang, 'invalid_email') }
  if (password.length < 6) return { error: t(lang, 'password_short') }
  if (isGibberishName(authorName) || isGibberishName(penName) || containsSpam(bio)) {
    return { error: t(lang, 'spam_detected') }
  }
  return { value: { authorName, penName, email, password, bio } }
}

export function validateProfile(body, lang = 'en') {
  const authorName = cleanText(body.authorName ?? body.author_name, 80)
  const penName = cleanText(body.penName ?? body.pen_name, 80)
  const bio = cleanText(body.bio, 1000)
  if (!authorName || !penName) return { error: t(lang, 'missing_fields') }
  if (isGibberishName(authorName) || isGibberishName(penName) || containsSpam(bio)) {
    return { error: t(lang, 'spam_detected') }
  }
  return { value: { authorName, penName, bio } }
}

export function normalizeCategory(value) {
  const category = cleanText(value, 20)
  return category === 'short_story' || category === 'short-story' ? 'story' : category
}

export function validatePost(body, lang = 'en') {
  const category = normalizeCategory(body.category)
  const title = cleanText(body.title, 200)
  const postBody = cleanText(body.body ?? body.content, 20000)
  if (!CATEGORIES.includes(category)) return { error: t(lang, 'invalid_category') }
  if (!title) return { error: t(lang, 'title_required') }
  if (!postBody) return { error: t(lang, 'body_required') }
  if (String(body.title ?? '').trim().length > 200) return { error: t(lang, 'title_too_long') }
  if (String(body.body ?? body.content ?? '').trim().length > 20000) return { error: t(lang, 'body_too_long') }
  if (containsSpam(title) || containsSpam(postBody)) return { error: t(lang, 'spam_detected') }
  return { value: { category, title, body: postBody } }
}

export function validatePostUpdate(body, lang = 'en') {
  const value = { removeImage: false }

  if (body.category !== undefined) {
    const category = normalizeCategory(body.category)
    if (!CATEGORIES.includes(category)) return { error: t(lang, 'invalid_category') }
    value.category = category
  }

  if (body.title !== undefined) {
    const title = cleanText(body.title, 200)
    if (!title) return { error: t(lang, 'title_required') }
    if (String(body.title).trim().length > 200) return { error: t(lang, 'title_too_long') }
    value.title = title
  }

  if (body.body !== undefined || body.content !== undefined) {
    const rawBody = body.content ?? body.body
    const postBody = cleanText(rawBody, 20000)
    if (!postBody) return { error: t(lang, 'body_required') }
    if (String(rawBody ?? '').trim().length > 20000) return { error: t(lang, 'body_too_long') }
    value.body = postBody
  }

  if (containsSpam(value.title) || containsSpam(value.body)) return { error: t(lang, 'spam_detected') }

  if (body.removeImage === true || body.removeImage === 'true' || body.removeImage === '1') {
    value.removeImage = true
  }

  return { value }
}

export function validateReaction(body, lang = 'en') {
  const type = cleanText(body.type, 20)
  if (!REACTIONS.includes(type)) return { error: t(lang, 'invalid_reaction') }
  return { value: { type } }
}

export function validateComment(body, lang = 'en') {
  const comment = cleanText(body.body, 1000)
  if (!comment) return { error: t(lang, 'comment_required') }
  if (String(body.body ?? '').trim().length > 1000) return { error: t(lang, 'comment_too_long') }
  if (containsSpam(comment)) return { error: t(lang, 'spam_detected') }
  return { value: { body: comment } }
}
