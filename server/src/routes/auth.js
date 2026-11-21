import { Router } from 'express'
import { db } from '../db.js'
import { hashPassword, comparePassword, signToken, publicUser, requireAuth, PUBLIC_USER_COLUMNS } from '../auth.js'
import { validateRegister, langFromRequest } from '../validation.js'
import { t } from '../messages.js'
import { requireValidImageBuffer, uploadAvatar, saveUpload } from '../upload.js'
import { loginRateLimit, registerRateLimit } from '../rateLimit.js'
import { issueCaptcha, requireCaptcha } from '../captcha.js'
import { isRegistrationOpen, requireRegistrationOpen } from '../lockdown.js'

const router = Router()

router.get('/captcha', (_req, res) => res.json(issueCaptcha()))
router.get('/status', (_req, res) => res.json({ registrationOpen: isRegistrationOpen() }))

router.post('/register', requireRegistrationOpen, registerRateLimit, uploadAvatar, requireValidImageBuffer, requireCaptcha, async (req, res) => {
  const lang = langFromRequest(req)
  const result = validateRegister(req.body, lang)
  if (result.error) return res.status(400).json({ error: result.error })

  const { authorName, penName, email, password, bio } = result.value
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) return res.status(409).json({ error: t(lang, 'email_exists') })

  try {
    const avatarUrl = saveUpload(req.file)
    const info = await db.prepare(`
      INSERT INTO users (email, password_hash, author_name, pen_name, bio, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(email, hashPassword(password), authorName, penName, bio, avatarUrl)
    const user = await db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(info.lastInsertRowid)
    res.status(201).json({ token: signToken(user), user: publicUser(user) })
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === '23505') {
      return res.status(409).json({ error: t(lang, 'email_exists') })
    }
    throw error
  }
})

router.post('/login', loginRateLimit, async (req, res) => {
  const lang = langFromRequest(req)
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  if (!email || !password) return res.status(400).json({ error: t(lang, 'missing_fields') })

  const account = await db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email)
  if (!account || !comparePassword(password, account.password_hash)) {
    return res.status(401).json({ error: t(lang, 'invalid_credentials') })
  }
  const user = await db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(account.id)
  res.json({ token: signToken(user), user: publicUser(user) })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

export default router
