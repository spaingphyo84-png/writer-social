import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth, requireAdmin, publicUser, PUBLIC_USER_COLUMNS } from '../auth.js'
import { validateProfile, langFromRequest } from '../validation.js'
import { t } from '../messages.js'
import { uploadAvatar, saveUpload } from '../upload.js'

const router = Router()

const FEATURED_USER_COLUMNS = PUBLIC_USER_COLUMNS
  .split(', ')
  .map((column) => `u.${column}`)
  .join(', ')

async function statsFor(userId) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM posts WHERE user_id = ?) AS posts,
      (SELECT COUNT(*) FROM comments WHERE user_id = ?) AS comments,
      (SELECT COALESCE(SUM(r.count), 0) FROM (
        SELECT COUNT(*) AS count FROM reactions r JOIN posts p ON p.id = r.post_id WHERE p.user_id = ?
      ) r) AS reactions
  `).get(userId, userId, userId)
}

router.get('/featured', async (_req, res) => {
  const users = await db.prepare(`
    SELECT ${FEATURED_USER_COLUMNS},
           (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS post_count
    FROM users u ORDER BY post_count DESC, u.id ASC LIMIT 5
  `).all()
  const writers = []
  for (const user of users) {
    writers.push({ ...publicUser(user), postCount: user.post_count, stats: await statsFor(user.id) })
  }
  res.json({ writers })
})

router.get('/trending', async (_req, res) => {
  const rows = await db.prepare(`
    SELECT category, COUNT(*) AS count FROM posts GROUP BY category ORDER BY count DESC
  `).all()
  const trending = rows.map((row) => ({ category: row.category, count: row.count }))
  res.json({ trending })
})

router.patch('/me', requireAuth, uploadAvatar, async (req, res) => {
  const lang = langFromRequest(req)
  const result = validateProfile(req.body, lang)
  if (result.error) return res.status(400).json({ error: result.error })
  const { authorName, penName, bio } = result.value
  const avatarUrl = req.file ? saveUpload(req.file) : req.user.avatar_url
  await db.prepare(`
    UPDATE users SET author_name = ?, pen_name = ?, bio = ?, avatar_url = ? WHERE id = ?
  `).run(authorName, penName, bio, avatarUrl, req.user.id)
  const user = await db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id)
  res.json({ user: publicUser(user) })
})

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: t(langFromRequest(req), 'not_found') })
  const user = await db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(id)
  if (!user) return res.status(404).json({ error: t(langFromRequest(req), 'not_found') })
  res.json({ user: { ...publicUser(user), stats: await statsFor(id) } })
})

export async function deleteUser(req, res) {
  const lang = langFromRequest(req)
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: t(lang, 'not_found') })
  if (id === req.user.id) return res.status(400).json({ error: t(lang, 'cannot_delete_self') })

  const result = await db.prepare('DELETE FROM users WHERE id = ?').run(id)
  if (!result.changes) return res.status(404).json({ error: t(lang, 'not_found') })
  res.json({ success: true })
}

router.delete('/:id', requireAuth, requireAdmin, deleteUser)

export default router
