import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { langFromRequest } from './validation.js'
import { t } from './messages.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const secretFile = path.join(root, 'data', '.captcha-secret')
const TTL_MS = 5 * 60 * 1000

function loadCaptchaSecret() {
  const configured = process.env.CAPTCHA_SECRET || process.env.JWT_SECRET
  if (configured && configured.length >= 32) return configured
  if (configured) {
    console.warn('[writer-realm] CAPTCHA_SECRET is shorter than 32 characters; using a persistent local secret instead.')
  }

  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim()
    if (existing) return existing
  } catch {
    // A fresh deployment has no secret file yet.
  }

  const generated = crypto.randomBytes(48).toString('hex')
  try {
    fs.mkdirSync(path.dirname(secretFile), { recursive: true })
    fs.writeFileSync(secretFile, generated, { mode: 0o600 })
  } catch (error) {
    console.warn('[writer-realm] Could not persist the CAPTCHA secret:', error?.message || error)
  }
  return generated
}

const CAPTCHA_SECRET = loadCaptchaSecret()

function signature(payload) {
  return crypto.createHmac('sha256', CAPTCHA_SECRET).update(payload).digest('base64url')
}

function signaturesMatch(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function issueCaptcha() {
  const left = crypto.randomInt(1, 10)
  const right = crypto.randomInt(1, 10)
  const payload = Buffer.from(JSON.stringify({
    a: left + right,
    e: Date.now() + TTL_MS,
    n: crypto.randomBytes(8).toString('hex'),
  })).toString('base64url')
  return {
    captchaId: `${payload}.${signature(payload)}`,
    question: `${left} + ${right} = ?`,
    expiresIn: TTL_MS / 1000,
  }
}

export function verifyCaptcha(token, answer) {
  if (typeof token !== 'string' || answer === undefined || answer === null || answer === '') return false
  const [payload, providedSignature] = token.split('.')
  if (!payload || !providedSignature || !signaturesMatch(signature(payload), providedSignature)) return false

  try {
    const challenge = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!Number.isFinite(challenge?.a) || !Number.isFinite(challenge?.e)) return false
    if (challenge.e <= Date.now()) return false
    return Number(answer) === challenge.a
  } catch {
    return false
  }
}

export function requireCaptcha(req, res, next) {
  const lang = langFromRequest(req)
  const honeypot = String(req.body?.website ?? '').trim()
  if (honeypot) return res.status(400).json({ error: t(lang, 'spam_detected') })
  if (!verifyCaptcha(req.body?.captchaId, req.body?.captchaAnswer)) {
    return res.status(400).json({ error: t(lang, 'invalid_captcha') })
  }
  next()
}
