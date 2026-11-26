import assert from 'node:assert/strict'
import test from 'node:test'
import { browserTimeZone, normalizeSprintSettings, validateSprintSettings } from './settings.ts'

const base = {
  startDate: '2026-10-01', endDate: '2026-10-14',
  backlogListId: ['backlog'], inProgressListId: ['doing'], doneListId: ['done'],
}

test('keeps existing sprints in UTC when no time zone was stored', () => {
  assert.equal(normalizeSprintSettings(base).timeZone, 'UTC')
})

test('uses the browser IANA zone as the new-sprint default', () => {
  assert.ok(browserTimeZone())
  assert.equal(new Intl.DateTimeFormat('en', { timeZone: browserTimeZone() }).resolvedOptions().timeZone, browserTimeZone())
})

test('validates setup drafts without mutating entered values', () => {
  const draft = { ...base, timeZone: 'Not/A_Zone' }
  const before = structuredClone(draft)
  assert.match(validateSprintSettings(draft), /valid IANA time zone/)
  assert.deepEqual(draft, before)
})

test('accepts an IANA time zone and rejects duplicate lists', () => {
  const valid = { ...base, timeZone: 'America/Sao_Paulo' }
  assert.equal(validateSprintSettings(valid), '')
  assert.match(validateSprintSettings({ ...valid, doneListId: ['doing'] }), /only once/)
})

test('accepts multiple lists per sprint category and normalizes legacy single lists', () => {
  const multi = { ...base, backlogListId: ['ideas', 'backlog'], inProgressListId: ['doing', 'review'], timeZone: 'UTC' }
  assert.equal(validateSprintSettings(multi), '')
  assert.deepEqual(normalizeSprintSettings(base).backlogListId, ['backlog'])
})
