export const SPAM_PATTERNS = [
  /lorem ipsum/i,
  /randomly generated/i,
  /testing the api/i,
]

export function containsSpam(value) {
  const text = String(value ?? '')
  return SPAM_PATTERNS.some((pattern) => pattern.test(text))
}

export function isGibberishName(value) {
  const name = String(value ?? '')
  const letters = name.replace(/[^a-z]/gi, '')
  if (letters.length < 5) return false
  const lower = letters.toLowerCase()
  if (!/[aeiou]/.test(lower)) return true
  if (/(.)\1{3,}/.test(lower)) return true
  if (/qwerty|asdf|zxcv|qwer|tyui|ghjkl|poiu/.test(lower)) return true
  const vowels = (lower.match(/[aeiou]/g) || []).length
  return vowels / lower.length < 0.15
}
