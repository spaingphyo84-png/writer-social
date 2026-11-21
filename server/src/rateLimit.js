import { langFromRequest } from './validation.js'
import { t } from './messages.js'

const buckets = new Map()

const HOUR = 60 * 60 * 1000

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

export function createRateLimit({ prefix, max, windowMs, key = clientIp }) {
  return (req, res, next) => {
    const identifier = key(req)
    if (!identifier) return next()

    const bucketKey = `${prefix}:${identifier}`
    const now = Date.now()
    let bucket = buckets.get(bucketKey)
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(bucketKey, bucket)
    }
    bucket.count += 1

    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
      return res.status(429).json({ error: t(langFromRequest(req), 'rate_limited') })
    }
    next()
  }
}

export const registerRateLimit = createRateLimit({
  prefix: 'register',
  max: 2,
  windowMs: HOUR,
})

export const createPostRateLimit = createRateLimit({
  prefix: 'posts',
  max: 3,
  windowMs: 15 * 60 * 1000,
  key: (req) => `${clientIp(req)}:${req.user?.id ?? 'anonymous'}`,
})

export function resetRateLimits() {
  buckets.clear()
}
