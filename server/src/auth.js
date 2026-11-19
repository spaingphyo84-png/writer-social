import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from './db.js'
import { langFromRequest } from './validation.js'
import { t } from './messages.js'

const JWT_SECRET = process.env.JWT_SECRET || 'writers-realm-development-secret-change-me'

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

export function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash)
}

export function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' })
}

export function publicUser(user) {
  if (!user) return null
  const { id, email, author_name, pen_name, bio, avatar_url, created_at } = user
  return { id, email, authorName: author_name, penName: pen_name, bio, avatarUrl: avatar_url, createdAt: created_at }
}

function userFromToken(token) {
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) || null
  } catch {
    return null
  }
}

function bearer(req) {
  const header = String(req.headers.authorization || '')
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

export function optionalAuth(req, _res, next) {
  req.user = userFromToken(bearer(req))
  next()
}

export function requireAuth(req, res, next) {
  req.user = userFromToken(bearer(req))
  if (!req.user) return res.status(401).json({ error: t(langFromRequest(req), 'unauthorized') })
  next()
}
