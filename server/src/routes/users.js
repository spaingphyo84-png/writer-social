import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth, requireAdmin, optionalAuth, publicUser, PUBLIC_USER_COLUMNS } from '../auth.js'
import { validateProfile, langFromRequest } from '../validation.js'
import { t } from '../messages.js'
import { requireValidImageBuffer, uploadAvatar } from '../upload.js'
import { storeImage } from '../media.js'

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

async function socialFor(userId, viewerId = null) {
  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following,
      (SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?) AS is_following
  `).get(userId, userId, viewerId, userId)
  return {
    followers: row.followers,
    following: row.following,
    isFollowing: Boolean(row.is_following),
  }
}

function validId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
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

router.patch('/me', requireAuth, uploadAvatar, requireValidImageBuffer, async (req, res) => {
  const lang = langFromRequest(req)
  const result = validateProfile(req.body, lang)
  if (result.error) return res.status(400).json({ error: result.error })
  const { authorName, penName, bio } = result.value
  const avatarUrl = req.file ? await storeImage(req.file, lang) : req.user.avatar_url
  await db.prepare(`
    UPDATE users SET author_name = ?, pen_name = ?, bio = ?, avatar_url = ? WHERE id = ?
  `).run(authorName, penName, bio, avatarUrl, req.user.id)
  const user = await db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id)
  res.json({ user: publicUser(user) })
})

router.post('/:id/follow', requireAuth, async (req, res) => {
  const lang = langFromRequest(req)
  const id = validId(req.params.id)
  if (!id) return res.status(404).json({ error: t(lang, 'user_not_found') })
  if (id === req.user.id) return res.status(400).json({ error: t(lang, 'cannot_follow_self') })
  if (!(await db.prepare('SELECT id FROM users WHERE id = ?').get(id))) {
    return res.status(404).json({ error: t(lang, 'user_not_found') })
  }

  const current = await db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, id)
  if (current) {
    await db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, id)
  } else {
    await db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, id)
  }
  res.json({ ...await socialFor(id, req.user.id) })
})

router.get('/:id', optionalAuth, async (req, res) => {
  const lang = langFromRequest(req)
  const id = validId(req.params.id)
  if (!id) return res.status(404).json({ error: t(lang, 'user_not_found') })
  const user = await db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(id)
  if (!user) return res.status(404).json({ error: t(lang, 'user_not_found') })
  const social = await socialFor(id, req.user?.id ?? null)
  res.json({ user: { ...publicUser(user), stats: await statsFor(id), ...social } })
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
