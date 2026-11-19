import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { ALLOWED_IMAGE_EXT, MAX_UPLOAD_BYTES, langFromRequest, validateImageFile } from './validation.js'
import { t } from './messages.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const uploadsDir = path.join(root, 'uploads')

fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const lang = langFromRequest(req)
    const error = validateImageFile(file, lang)
    if (error) {
      const failure = new Error(error)
      failure.status = 400
      return cb(failure)
    }
    cb(null, true)
  },
})

export const uploadAvatar = upload.single('avatar')
export const uploadPostImage = upload.single('image')

export function saveUpload(file) {
  if (!file) return null
  const error = validateImageFile(file)
  if (error) {
    const failure = new Error(error)
    failure.status = 400
    throw failure
  }
  const originalExt = path.extname(file.originalname).toLowerCase()
  const ext = ALLOWED_IMAGE_EXT.includes(originalExt) ? originalExt : '.png'
  const filename = `${crypto.randomUUID()}${ext}`
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer)
  return `/uploads/${filename}`
}

export function uploadErrorHandler(err, req, res, next) {
  if (!err) return next()
  if (err instanceof multer.MulterError) {
    const lang = langFromRequest(req)
    const message = err.code === 'LIMIT_FILE_SIZE' ? t(lang, 'file_too_large') : t(lang, 'upload_failed')
    return res.status(400).json({ error: message })
  }
  if (err.status) return res.status(err.status).json({ error: err.message })
  return next(err)
}
