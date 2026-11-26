import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateBurndown, dateInTimeZone, localMidnightIso, sprintIsProjected } from './history.ts'

const settings = {
  startDate: '2026-10-01',
  endDate: '2026-10-04',
  backlogListId: 'backlog',
  inProgressListId: 'doing',
  doneListId: 'done',
  timeZone: 'UTC',
}

function card(id, idList, actions = [], createdAt = '2026-09-20T12:00:00.000Z', closed = false) {
  return { card: { id, name: id, idList, closed }, createdAt, actions }
}

function move(id, date, from, to) {
  return { id, date, type: 'updateCard', data: { card: { id: 'card' }, listBefore: { id: from }, listAfter: { id: to } } }
}

test('counts cards only while they are in Backlog or In Progress', () => {
  const history = card('card', 'outside', [
    move('enter', '2026-10-02T10:00:00.000Z', 'outside', 'backlog'),
    move('exit', '2026-10-03T10:00:00.000Z', 'backlog', 'outside'),
  ])
  const result = calculateBurndown(settings, [history], '2026-10-04')
  assert.deepEqual(result.map(({ remaining }) => remaining), [0, 1, 0, 0])
})

test('adds a new card to scope on its creation day', () => {
  const history = card('new-card', 'doing', [{
    id: 'create', date: '2026-10-03T10:00:00.000Z', type: 'createCard',
    data: { card: { id: 'new-card' }, list: { id: 'doing' } },
  }], '2026-10-03T10:00:00.000Z')
  const result = calculateBurndown(settings, [history], '2026-10-04')
  assert.deepEqual(result.map(({ remaining }) => remaining), [0, 0, 1, 1])
})

test('reconstructs copied cards and cards created directly in Done', () => {
  const creation = (id, type, list) => ({ id: `${id}-create`, date: '2026-10-02T10:00:00.000Z', type, data: { card: { id }, list: { id: list } } })
  const createdAt = '2026-10-02T10:00:00.000Z'
  const cards = [
    card('copy', 'backlog', [creation('copy', 'copyCard', 'backlog')], createdAt),
    card('moved-copy', 'done', [creation('moved-copy', 'copyCard', 'backlog'), move('done', '2026-10-03T10:00:00.000Z', 'backlog', 'done')], createdAt),
    card('created-done', 'done', [creation('created-done', 'createCard', 'done')], createdAt),
  ]
  const result = calculateBurndown(settings, cards, '2026-10-04')
  assert.deepEqual(result.map(({ remaining }) => remaining), [0, 2, 1, 1])
  assert.deepEqual(result.map(({ completed }) => completed), [0, 1, 2, 2])
})

test('retains the initial-day scope for a sprint that has not started yet', () => {
  const result = calculateBurndown(settings, [card('future-card', 'backlog')], '2026-09-30')
  assert.equal(result[0].remaining, null)
  assert.equal(result[0].ideal, 1)
})

test('switches projections on the start date in the sprint time zone', () => {
  const sprint = { ...settings, timeZone: 'America/Los_Angeles' }
  assert.equal(sprintIsProjected(sprint, new Date('2026-10-01T06:59:59Z')), true)
  assert.equal(sprintIsProjected(sprint, new Date('2026-10-01T07:00:00Z')), false)
})

test('counts distinct completed cards only while Done and after entering Done this sprint', () => {
  const history = card('card', 'done', [
    move('complete', '2026-10-02T10:00:00.000Z', 'backlog', 'done'),
    move('reopen', '2026-10-03T10:00:00.000Z', 'done', 'doing'),
    move('complete-again', '2026-10-04T10:00:00.000Z', 'doing', 'done'),
  ])
  const result = calculateBurndown(settings, [history], '2026-10-04')
  assert.deepEqual(result.map(({ remaining }) => remaining), [1, 0, 1, 0])
  assert.deepEqual(result.map(({ completed }) => completed), [0, 1, 0, 1])
})

test('excludes archived days, counts restored work again, and preserves Done credit while archived', () => {
  const archive = (id, date, closed) => ({ id, date, type: 'updateCard', data: { card: { id: 'card', closed } } })
  const history = card('card', 'done', [
    move('complete', '2026-10-01T10:00:00.000Z', 'backlog', 'done'),
    archive('archive-done', '2026-10-02T10:00:00.000Z', true),
    archive('restore-done', '2026-10-03T10:00:00.000Z', false),
    move('restore-to-work', '2026-10-03T11:00:00.000Z', 'done', 'doing'),
    archive('archive-work', '2026-10-04T10:00:00.000Z', true),
  ], '2026-09-20T12:00:00.000Z', true)
  const result = calculateBurndown(settings, [history], '2026-10-04')
  assert.deepEqual(result.map(({ remaining }) => remaining), [0, 0, 1, 0])
  assert.deepEqual(result.map(({ completed }) => completed), [1, 1, 0, 0])
})

test('restores a card archived before the sprint and counts it from the restore day', () => {
  const history = card('old-card', 'backlog', [
    { id: 'restore', date: '2026-10-02T10:00:00.000Z', type: 'updateCard', data: { card: { id: 'old-card', closed: false } } },
  ], '2026-09-20T12:00:00.000Z')
  assert.deepEqual(calculateBurndown(settings, [history], '2026-10-04').map(({ remaining }) => remaining), [0, 1, 1, 1])
})

test('uses activity when the current card is unavailable', () => {
  const history = card('missing-card', null, [{
    id: 'move-board', date: '2026-10-03T10:00:00.000Z', type: 'moveCardFromBoard',
    data: { card: { id: 'missing-card' }, list: { id: 'backlog' } },
  }])
  const result = calculateBurndown(settings, [history], '2026-10-04')
  assert.deepEqual(result.map(({ remaining }) => remaining), [1, 1, 0, 0])
})

test('does not invent completion when the available history has no Done entry', () => {
  const history = card('old-done-card', 'done', [], '2026-09-20T12:00:00.000Z')
  const result = calculateBurndown(settings, [history], '2026-10-04')
  assert.deepEqual(result.map(({ completed }) => completed), [0, 0, 0, 0])
})

test('groups moves by the shared IANA time zone across midnight and daylight-saving changes', () => {
  const timezoneSettings = {
    ...settings,
    startDate: '2026-03-07',
    endDate: '2026-03-09',
    timeZone: 'America/New_York',
  }
  const history = card('dst-card', 'backlog', [
    move('leave', '2026-03-08T04:59:59.000Z', 'backlog', 'outside'),
    move('enter', '2026-03-08T05:00:00.000Z', 'outside', 'backlog'),
  ], '2026-02-20T12:00:00.000Z')
  const result = calculateBurndown(timezoneSettings, [history], '2026-03-09')
  assert.deepEqual(result.map(({ remaining }) => remaining), [0, 1, 1])
  assert.equal(localMidnightIso('2026-03-08', 'America/New_York'), '2026-03-08T05:00:00.000Z')
  assert.equal(localMidnightIso('2026-03-09', 'America/New_York'), '2026-03-09T04:00:00.000Z')
  assert.equal(localMidnightIso('2026-11-01', 'America/New_York'), '2026-11-01T04:00:00.000Z')
  assert.equal(localMidnightIso('2026-11-02', 'America/New_York'), '2026-11-02T05:00:00.000Z')
  assert.equal(dateInTimeZone(new Date('2026-11-01T05:59:59.000Z'), 'America/New_York'), '2026-11-01')
  assert.equal(dateInTimeZone(new Date('2026-11-01T06:00:00.000Z'), 'America/New_York'), '2026-11-01')
  const skippedMidnight = localMidnightIso('2018-11-04', 'America/Sao_Paulo')
  assert.equal(dateInTimeZone(new Date(skippedMidnight), 'America/Sao_Paulo'), '2018-11-04')
})
