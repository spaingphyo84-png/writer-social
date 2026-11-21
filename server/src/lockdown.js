import { langFromRequest } from './validation.js'
import { t } from './messages.js'

let registrationOpen = String(process.env.REGISTRATION_OPEN ?? 'true').toLowerCase() !== 'false'

export function isRegistrationOpen() {
  return registrationOpen
}

export function setRegistrationOpen(value) {
  registrationOpen = Boolean(value)
  return registrationOpen
}

export function requireRegistrationOpen(req, res, next) {
  if (registrationOpen) return next()
  return res.status(403).json({ error: t(langFromRequest(req), 'registration_closed') })
}
