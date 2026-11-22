import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_UPLOAD_BYTES, langFromRequest, validateImageBuffer, validateImageFile } from './validation.js'
import { t } from './messages.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const uploadsDir = path.join(root, 'uploads')

const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 30, parts: 40, fieldSize: 256 * 1024 },
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

export function requireValidImageBuffer(req, _res, next) {
  if (!req.file) return next()
  const error = validateImageBuffer(req.file, langFromRequest(req))
  if (!error) return next()
  const failure = new Error(error)
  failure.status = 400
  return next(failure)
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
