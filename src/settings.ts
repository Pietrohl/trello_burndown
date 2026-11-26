export interface SprintSettings {
  startDate: string
  endDate: string
  backlogListId: string[]
  inProgressListId: string[]
  doneListId: string[]
  timeZone: string
}

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

export function normalizeSprintSettings(value: unknown): SprintSettings | undefined {
  if (!value || typeof value !== 'object') return undefined
  const stored = value as Partial<SprintSettings>
  if (typeof stored.startDate !== 'string' || typeof stored.endDate !== 'string') return undefined
  const listIds = (value: unknown) => {
    if (typeof value === 'string') return value ? [value] : []
    return Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : undefined
  }
  const backlogListId = listIds(stored.backlogListId)
  const inProgressListId = listIds(stored.inProgressListId)
  const doneListId = listIds(stored.doneListId)
  if (!backlogListId || !inProgressListId || !doneListId) return undefined
  const timeZone = typeof stored.timeZone === 'string' ? stored.timeZone : 'UTC'
  if (!isValidTimeZone(timeZone)) return undefined
  const normalized = {
    startDate: stored.startDate,
    endDate: stored.endDate,
    backlogListId,
    inProgressListId,
    doneListId,
    timeZone,
  }
  return validateSprintSettings(normalized) ? undefined : normalized
}

export function validateSprintSettings(settings: SprintSettings) {
  const isDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }
  if (!isDate(settings.startDate) || !isDate(settings.endDate)) {
    return 'Enter a valid sprint start and end date.'
  }
  if (settings.startDate > settings.endDate) return 'The sprint end date must be on or after the start date.'
  if (!isValidTimeZone(settings.timeZone)) return 'Enter a valid IANA time zone, such as America/Sao_Paulo.'
  const selected = [...settings.backlogListId, ...settings.inProgressListId, ...settings.doneListId]
  if (!settings.backlogListId.length || !settings.inProgressListId.length || !settings.doneListId.length ||
    new Set(selected).size !== selected.length) {
    return 'Choose at least one list per category, with each Trello list assigned only once.'
  }
  return ''
}

export function supportedTimeZones() {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return ['UTC', ...zones]
}
