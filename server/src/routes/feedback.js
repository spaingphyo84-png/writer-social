import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { feedbackRateLimit } from '../rateLimit.js'
import { validateFeedback, langFromRequest } from '../validation.js'
import { t } from '../messages.js'

const router = Router()

router.post('/', requireAuth, feedbackRateLimit, async (req, res) => {
  const lang = langFromRequest(req)
  const result = validateFeedback(req.body ?? {}, lang)
  if (result.error) return res.status(400).json({ error: result.error })

  const { category, message } = result.value
  const info = await db.prepare('INSERT INTO feedback (user_id, category, message) VALUES (?, ?, ?)')
    .run(req.user.id, category, message)
  const saved = await db.prepare('SELECT id, category, message, created_at FROM feedback WHERE id = ?')
    .get(info.lastInsertRowid)
  res.status(201).json({
    feedback: {
      id: saved.id,
      category: saved.category,
      message: saved.message,
      createdAt: saved.created_at,
    },
  })
})

export default router
