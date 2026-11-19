import { Router } from 'express'
import { db } from '../db.js'
import { hashPassword, comparePassword, signToken, publicUser, requireAuth } from '../auth.js'
import { validateRegister, langFromRequest } from '../validation.js'
import { t } from '../messages.js'
import { uploadAvatar, saveUpload } from '../upload.js'

const router = Router()

router.post('/register', uploadAvatar, (req, res) => {
  const lang = langFromRequest(req)
  const result = validateRegister(req.body, lang)
  if (result.error) return res.status(400).json({ error: result.error })

  const { authorName, penName, email, password, bio } = result.value
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) return res.status(409).json({ error: t(lang, 'email_exists') })

  try {
    const avatarUrl = saveUpload(req.file)
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, author_name, pen_name, bio, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(email, hashPassword(password), authorName, penName, bio, avatarUrl)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
    res.status(201).json({ token: signToken(user), user: publicUser(user) })
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: t(lang, 'email_exists') })
    }
    throw error
  }
})

router.post('/login', (req, res) => {
  const lang = langFromRequest(req)
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  if (!email || !password) return res.status(400).json({ error: t(lang, 'missing_fields') })

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user || !comparePassword(password, user.password_hash)) {
    return res.status(401).json({ error: t(lang, 'invalid_credentials') })
  }
  res.json({ token: signToken(user), user: publicUser(user) })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

export default router
