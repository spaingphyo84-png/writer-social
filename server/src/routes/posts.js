import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import {
  validatePost, validatePostUpdate, validateReaction, validateComment,
  CATEGORIES, langFromRequest,
} from '../validation.js'
import { t } from '../messages.js'
import { requireValidImageBuffer, uploadPostImage, saveUpload } from '../upload.js'
import { createPostRateLimit } from '../rateLimit.js'
import { requireCaptcha } from '../captcha.js'

const router = Router()

const POST_COLUMNS = `
  p.id, p.user_id, p.category, p.title, p.body, p.image_url, p.repost_of, p.created_at,
  u.author_name, u.pen_name, u.avatar_url,
  (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id AND r.type = 'love') AS love_count,
  (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id AND r.type = 'haha') AS haha_count,
  (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id AND r.type = 'sad') AS sad_count,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
  (SELECT COUNT(*) FROM shares s WHERE s.post_id = p.id) AS share_count,
  (SELECT r.type FROM reactions r WHERE r.post_id = p.id AND r.user_id = ?) AS viewer_reaction,
  rp.title AS repost_title, rp.user_id AS repost_user_id,
  ru.author_name AS repost_author_name, ru.pen_name AS repost_pen_name
`

const POST_FROM = `
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN posts rp ON rp.id = p.repost_of
  LEFT JOIN users ru ON ru.id = rp.user_id
`

function mapPost(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url ?? null,
    repostOf: row.repost_of ?? null,
    createdAt: row.created_at,
    author: {
      id: row.user_id,
      authorName: row.author_name,
      penName: row.pen_name,
      avatarUrl: row.avatar_url ?? null,
    },
    counts: {
      love: row.love_count,
      haha: row.haha_count,
      sad: row.sad_count,
      comments: row.comment_count,
      shares: row.share_count,
    },
    viewerReaction: row.viewer_reaction ?? null,
    repost: row.repost_of ? {
      id: row.repost_of,
      title: row.repost_title,
      authorName: row.repost_author_name,
      penName: row.repost_pen_name,
      userId: row.repost_user_id,
    } : null,
  }
}

async function reactionCounts(postId, viewerId = null) {
  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reactions WHERE post_id = ? AND type = 'love') AS love,
      (SELECT COUNT(*) FROM reactions WHERE post_id = ? AND type = 'haha') AS haha,
      (SELECT COUNT(*) FROM reactions WHERE post_id = ? AND type = 'sad') AS sad,
      (SELECT type FROM reactions WHERE post_id = ? AND user_id = ?) AS viewerReaction
  `).get(postId, postId, postId, postId, viewerId)
  return { ...row, viewerReaction: row.viewerReaction ?? null }
}

async function getPost(id, viewerId = null) {
  const row = await db.prepare(`SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = ?`).get(viewerId, id)
  return row ? mapPost(row) : null
}

function validId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

router.get('/', optionalAuth, async (req, res) => {
  const viewerId = req.user?.id ?? null
  const where = []
  const params = [viewerId]

  const category = String(req.query.category ?? 'all')
  if (CATEGORIES.includes(category)) {
    where.push('p.category = ?')
    params.push(category)
  }
  const authorId = validId(req.query.authorId)
  if (authorId) {
    where.push('p.user_id = ?')
    params.push(authorId)
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100)

  const rows = await db.prepare(`
    SELECT ${POST_COLUMNS} ${POST_FROM}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?
  `).all(...params, limit)
  res.json({ posts: rows.map(mapPost) })
})

router.get('/:id', optionalAuth, async (req, res) => {
  const id = validId(req.params.id)
  const post = id ? await getPost(id, req.user?.id ?? null) : null
  if (!post) return res.status(404).json({ error: t(langFromRequest(req), 'post_not_found') })
  res.json({ post })
})

router.post('/', requireAuth, createPostRateLimit, uploadPostImage, requireValidImageBuffer, requireCaptcha, async (req, res) => {
  const lang = langFromRequest(req)
  const result = validatePost(req.body, lang)
  if (result.error) return res.status(400).json({ error: result.error })
  const { category, title, body: postBody } = result.value
  const imageUrl = saveUpload(req.file)

  const info = await db.prepare(`
    INSERT INTO posts (user_id, category, title, body, image_url) VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, category, title, postBody, imageUrl)
  res.status(201).json({ post: await getPost(Number(info.lastInsertRowid), req.user.id) })
})

const updatePost = async (req, res) => {
  const lang = langFromRequest(req)
  const id = validId(req.params.id)
  const post = id ? await db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(id) : null
  if (!post) return res.status(404).json({ error: t(lang, 'post_not_found') })
  if (post.user_id !== req.user.id) return res.status(403).json({ error: t(lang, 'forbidden') })

  const result = validatePostUpdate(req.body, lang)
  if (result.error) return res.status(400).json({ error: result.error })

  const { title, body: postBody, category, removeImage } = result.value
  const columns = []
  const params = []
  if (title !== undefined) { columns.push('title = ?'); params.push(title) }
  if (postBody !== undefined) { columns.push('body = ?'); params.push(postBody) }
  if (category !== undefined) { columns.push('category = ?'); params.push(category) }
  if (req.file || removeImage) {
    columns.push('image_url = ?')
    params.push(req.file ? saveUpload(req.file) : null)
  }

  if (columns.length) {
    await db.prepare(`UPDATE posts SET ${columns.join(', ')} WHERE id = ?`).run(...params, id)
  }
  res.json({ post: await getPost(id, req.user.id) })
}

router.put('/:id', requireAuth, uploadPostImage, requireValidImageBuffer, updatePost)
router.patch('/:id', requireAuth, uploadPostImage, requireValidImageBuffer, updatePost)

router.delete('/:id', requireAuth, async (req, res) => {
  const lang = langFromRequest(req)
  const id = validId(req.params.id)
  const post = id ? await db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(id) : null
  if (!post) return res.status(404).json({ error: t(lang, 'post_not_found') })
  const isAdmin = Boolean(req.user.is_admin)
  if (post.user_id !== req.user.id && !isAdmin) return res.status(403).json({ error: t(lang, 'forbidden') })
  await db.prepare('DELETE FROM posts WHERE id = ?').run(id)
  res.json({ success: true })
})

router.post('/:id/react', requireAuth, async (req, res) => {
  const lang = langFromRequest(req)
  const id = validId(req.params.id)
  if (!id || !(await db.prepare('SELECT id FROM posts WHERE id = ?').get(id))) {
    return res.status(404).json({ error: t(lang, 'post_not_found') })
  }
  const result = validateReaction(req.body, lang)
  if (result.error) return res.status(400).json({ error: result.error })
  const { type } = result.value

  const toggle = db.transaction(async () => {
    const current = await db.prepare('SELECT type FROM reactions WHERE user_id = ? AND post_id = ?').get(req.user.id, id)
    if (current?.type === type) {
      await db.prepare('DELETE FROM reactions WHERE user_id = ? AND post_id = ?').run(req.user.id, id)
    } else if (current) {
      await db.prepare('UPDATE reactions SET type = ?, created_at = CURRENT_TIMESTAMP WHERE user_id = ? AND post_id = ?')
        .run(type, req.user.id, id)
    } else {
      await db.prepare('INSERT INTO reactions (user_id, post_id, type) VALUES (?, ?, ?)').run(req.user.id, id, type)
    }
  })
  await toggle()
  res.json({ counts: await reactionCounts(id, req.user.id) })
})

router.get('/:id/comments', async (req, res) => {
  const id = validId(req.params.id)
  if (!id || !(await db.prepare('SELECT id FROM posts WHERE id = ?').get(id))) {
    return res.status(404).json({ error: t(langFromRequest(req), 'post_not_found') })
  }
  const rows = await db.prepare(`
    SELECT c.id, c.post_id, c.body, c.created_at, c.user_id,
           u.author_name, u.pen_name, u.avatar_url
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC
  `).all(id)
  const comments = rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: {
      id: row.user_id,
      authorName: row.author_name,
      penName: row.pen_name,
      avatarUrl: row.avatar_url ?? null,
    },
  }))
  res.json({ comments })
})

router.post('/:id/comments', requireAuth, async (req, res) => {
  const lang = langFromRequest(req)
  const id = validId(req.params.id)
  if (!id || !(await db.prepare('SELECT id FROM posts WHERE id = ?').get(id))) {
    return res.status(404).json({ error: t(lang, 'post_not_found') })
  }
  const result = validateComment(req.body, lang)
  if (result.error) return res.status(400).json({ error: result.error })
  const info = await db.prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)')
    .run(id, req.user.id, result.value.body)
  const comment = await db.prepare(`
    SELECT c.id, c.post_id, c.body, c.created_at, c.user_id,
           u.author_name, u.pen_name, u.avatar_url
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(info.lastInsertRowid)
  res.status(201).json({
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      author: {
        id: comment.user_id,
        authorName: comment.author_name,
        penName: comment.pen_name,
        avatarUrl: comment.avatar_url ?? null,
      },
    },
  })
})

router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  const lang = langFromRequest(req)
  const postId = validId(req.params.id)
  const commentId = validId(req.params.commentId)
  const comment = postId && commentId
    ? await db.prepare('SELECT id, user_id FROM comments WHERE id = ? AND post_id = ?').get(commentId, postId)
    : null
  if (!comment) return res.status(404).json({ error: t(lang, 'comment_not_found') })
  if (comment.user_id !== req.user.id) return res.status(403).json({ error: t(lang, 'forbidden') })
  await db.prepare('DELETE FROM comments WHERE id = ?').run(commentId)
  res.json({ success: true })
})

router.post('/:id/share', optionalAuth, async (req, res) => {
  const lang = langFromRequest(req)
  const id = validId(req.params.id)
  const original = id
    ? await db.prepare('SELECT id, user_id, category, title, body, image_url FROM posts WHERE id = ?').get(id)
    : null
  if (!original) return res.status(404).json({ error: t(lang, 'post_not_found') })

  const kind = String(req.body?.kind ?? 'link')
  if (!['link', 'repost'].includes(kind)) return res.status(400).json({ error: t(lang, 'invalid_share_kind') })
  if (kind === 'repost' && !req.user) {
    return res.status(401).json({ error: t(lang, 'repost_requires_auth') })
  }

  let repost = null
  const share = db.transaction(async () => {
    await db.prepare('INSERT INTO shares (post_id, user_id) VALUES (?, ?)').run(id, req.user?.id ?? null)
    if (kind === 'repost') {
      const info = await db.prepare(`
        INSERT INTO posts (user_id, category, title, body, image_url, repost_of)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.user.id, original.category, original.title, original.body, original.image_url, id)
      repost = await getPost(Number(info.lastInsertRowid), req.user.id)
    }
  })
  await share()
  res.status(kind === 'repost' ? 201 : 200).json({
    repost,
    counts: await reactionCounts(id, req.user?.id ?? null),
    shareCount: (await db.prepare('SELECT COUNT(*) AS count FROM shares WHERE post_id = ?').get(id)).count,
  })
})

export default router
