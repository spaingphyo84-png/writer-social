import crypto from 'node:crypto'
import { langFromRequest } from './validation.js'
import { t } from './messages.js'

const challenges = new Map()
const TTL_MS = 5 * 60 * 1000
const MAX_CHALLENGES = 1000

function prune(now = Date.now()) {
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(id)
  }
  while (challenges.size > MAX_CHALLENGES) {
    const oldest = challenges.keys().next().value
    challenges.delete(oldest)
  }
}

export function issueCaptcha() {
  const now = Date.now()
  prune(now)
  const left = crypto.randomInt(1, 10)
  const right = crypto.randomInt(1, 10)
  const captchaId = crypto.randomUUID()
  challenges.set(captchaId, { answer: left + right, expiresAt: now + TTL_MS })
  return { captchaId, question: `${left} + ${right} = ?`, expiresIn: TTL_MS / 1000 }
}

export function verifyCaptcha(id, answer) {
  if (typeof id !== 'string' || !id || answer === undefined || answer === null || answer === '') return false
  const challenge = challenges.get(id)
  challenges.delete(id)
  if (!challenge || challenge.expiresAt <= Date.now()) return false
  return Number(answer) === challenge.answer
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
