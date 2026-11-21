import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import adminRoutes from './routes/admin.js'
import postRoutes from './routes/posts.js'
import { uploadErrorHandler, uploadsDir } from './upload.js'
import { langFromRequest } from './validation.js'
import { t } from './messages.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const distDir = path.join(root, 'dist')

const capacitorOrigins = new Set([
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
])
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const onRenderOriginPattern = /^https:\/\/([a-z0-9-]+\.)*onrender\.com$/

const corsOptions = {
  origin(origin, callback) {
    if (
      !origin ||
      capacitorOrigins.has(origin) ||
      localOriginPattern.test(origin) ||
      onRenderOriginPattern.test(origin)
    ) {
      return callback(null, true)
    }
    return callback(null, false)
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", 'capacitor:', 'https:', 'http://localhost:*', 'http://127.0.0.1:*'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'capacitor:', 'https:', 'http://localhost:*', 'http://127.0.0.1:*'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", 'capacitor:'],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: { maxAge: 15552000, includeSubDomains: true },
  }))
  app.use(cors(corsOptions))
  app.use(express.json({ limit: '50kb' }))
  app.use(express.urlencoded({ extended: true, limit: '50kb' }))

  app.use('/uploads', express.static(uploadsDir, {
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'public, max-age=86400')
    },
  }))

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: "Writer's Realm" }))
  app.use('/api/auth', authRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/posts', postRoutes)
  app.use('/api', (_req, res) => res.status(404).json({ error: t(langFromRequest(_req), 'not_found') }))

  app.use(uploadErrorHandler)
  app.use((err, req, res, _next) => {
    const status = err.status ?? err.statusCode ?? (err.type === 'entity.parse.failed' ? 400 : 500)
    console.error('[writer-realm]', err)
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: status === 500 ? t(langFromRequest(req), 'server_error') : (err.message || t(langFromRequest(req), 'server_error')),
    })
  })

  const indexFile = path.join(distDir, 'index.html')
  if (fs.existsSync(indexFile)) {
    app.use(express.static(distDir))
    app.get('*', (_req, res) => res.sendFile(indexFile))
  }

  return app
}

export default createApp()
