import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth, requireAdmin, PUBLIC_USER_COLUMNS } from '../auth.js'
import { containsSpam, isGibberishName } from '../spam.js'
import { isRegistrationOpen, setRegistrationOpen } from '../lockdown.js'
import { langFromRequest } from '../validation.js'
import { t } from '../messages.js'
import { deleteUser } from './users.js'

const router = Router()

router.delete('/users/:id', requireAuth, requireAdmin, deleteUser)

router.get('/registration-status', requireAuth, requireAdmin, (_req, res) => {
  res.json({ registrationOpen: isRegistrationOpen() })
})

router.get('/lockdown', requireAuth, requireAdmin, (_req, res) => {
  res.json({ registrationOpen: isRegistrationOpen() })
})

router.post('/lockdown', requireAuth, requireAdmin, (req, res) => {
  const body = req.body ?? {}
  let nextState
  if (typeof body.registrationOpen === 'boolean') nextState = body.registrationOpen
  else if (typeof body.open === 'boolean') nextState = body.open
  else if (typeof body.locked === 'boolean') nextState = !body.locked
  else if (typeof body.paused === 'boolean') nextState = !body.paused

  if (nextState === undefined) {
    return res.status(400).json({ error: t(langFromRequest(req), 'missing_fields') })
  }

  const registrationOpen = setRegistrationOpen(nextState)
  res.json({ success: true, registrationOpen })
})

router.delete('/spam', requireAuth, requireAdmin, async (req, res) => {
  const posts = await db.prepare('SELECT id, user_id, title, body FROM posts').all()
  const users = await db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users`).all()

  const postsByUser = new Map()
  for (const post of posts) {
    const owned = postsByUser.get(post.user_id) ?? []
    owned.push(post.id)
    postsByUser.set(post.user_id, owned)
  }

  const spamUserIds = new Set(users
    .filter((user) => user.id !== req.user.id && !user.is_admin && (
      isGibberishName(user.author_name) || isGibberishName(user.pen_name) || containsSpam(user.bio)
    ))
    .map((user) => user.id))

  const spamPostIds = posts
    .filter((post) => containsSpam(post.title) || containsSpam(post.body) || spamUserIds.has(post.user_id))
    .map((post) => post.id)
  const spamPostIdSet = new Set(spamPostIds)

  const removableUserIds = [...spamUserIds].filter((id) =>
    (postsByUser.get(id) ?? []).every((postId) => spamPostIdSet.has(postId)))

  const cleanup = db.transaction(async () => {
    for (const id of spamPostIds) await db.prepare('DELETE FROM posts WHERE id = ?').run(id)
    for (const id of removableUserIds) await db.prepare('DELETE FROM users WHERE id = ?').run(id)
  })
  await cleanup()

  res.json({ success: true, deletedPosts: spamPostIds.length, deletedUsers: removableUserIds.length })
})

export default router
