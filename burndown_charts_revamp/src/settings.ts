export interface SprintSettings {
  startDate: string
  endDate: string
  backlogListId: string
  inProgressListId: string
  doneListId: string
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
  if (typeof stored.startDate !== 'string' || typeof stored.endDate !== 'string' ||
    typeof stored.backlogListId !== 'string' || typeof stored.inProgressListId !== 'string' ||
    typeof stored.doneListId !== 'string') return undefined
  const timeZone = typeof stored.timeZone === 'string' ? stored.timeZone : 'UTC'
  if (!isValidTimeZone(timeZone)) return undefined
  const normalized = {
    startDate: stored.startDate,
    endDate: stored.endDate,
    backlogListId: stored.backlogListId,
    inProgressListId: stored.inProgressListId,
    doneListId: stored.doneListId,
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
  if (!settings.backlogListId || !settings.inProgressListId || !settings.doneListId ||
    new Set([settings.backlogListId, settings.inProgressListId, settings.doneListId]).size !== 3) {
    return 'Choose a different Trello list for Backlog, In Progress, and Done.'
  }
  return ''
}

export function supportedTimeZones() {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return ['UTC', ...zones]
}
