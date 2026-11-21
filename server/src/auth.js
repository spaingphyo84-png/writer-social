import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from './db.js'
import { langFromRequest } from './validation.js'
import { t } from './messages.js'

function loadJwtSecret() {
  const configured = process.env.JWT_SECRET
  if (configured) {
    if (configured.length < 32) {
      console.warn('[writer-realm] JWT_SECRET is shorter than 32 characters; use a longer random secret in production.')
    }
    return configured
  }
  console.warn('[writer-realm] JWT_SECRET is not set; using a temporary random secret. Sessions will be invalidated on restart.')
  return crypto.randomBytes(64).toString('hex')
}

const JWT_SECRET = loadJwtSecret()

export const PUBLIC_USER_COLUMNS = 'id, author_name, pen_name, bio, avatar_url, is_admin, created_at'

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

export function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash)
}

export function signToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' })
}

export function publicUser(user) {
  if (!user) return null
  const { id, author_name, pen_name, bio, avatar_url, is_admin, created_at } = user
  return {
    id, authorName: author_name, penName: pen_name, bio, avatarUrl: avatar_url,
    createdAt: created_at, isAdmin: Boolean(is_admin),
  }
}

async function userFromToken(token) {
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return (await db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(payload.id)) || null
  } catch {
    return null
  }
}

function bearer(req) {
  const header = String(req.headers.authorization || '')
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

export async function optionalAuth(req, _res, next) {
  req.user = await userFromToken(bearer(req))
  next()
}

export async function requireAuth(req, res, next) {
  req.user = await userFromToken(bearer(req))
  if (!req.user) return res.status(401).json({ error: t(langFromRequest(req), 'unauthorized') })
  next()
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin && !req.user?.isAdmin) {
    return res.status(403).json({ error: t(langFromRequest(req), 'forbidden') })
  }
  next()
}
