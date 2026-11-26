import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateBurndown } from './history.ts'
import { authorize, getLists, getSprintHistory, TrelloApiError } from './trello.ts'

const settings = {
  startDate: '2026-10-01', endDate: '2026-10-04',
  backlogListId: 'backlog', inProgressListId: 'doing', doneListId: 'done', timeZone: 'America/Los_Angeles',
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function withFetch(mock, action) {
  const original = globalThis.fetch
  globalThis.fetch = mock
  return Promise.resolve().then(action).finally(() => { globalThis.fetch = original })
}

test('fetches only selected-list cards and follows action pagination', async () => {
  const cardId = `${Math.floor(Date.parse('2026-09-20T00:00:00Z') / 1000).toString(16)}${'a'.repeat(16)}`
  const page = Array.from({ length: 1000 }, (_, index) => ({
    id: `action-${String(index).padStart(4, '0')}`,
    date: '2026-10-02T10:00:00.000Z', type: 'updateCard',
    data: { card: { id: cardId, name: 'Paged card' }, listBefore: { id: 'backlog' }, listAfter: { id: 'doing' } },
  }))
  const calls = []
  await withFetch(async (input) => {
    const url = new URL(input)
    calls.push(url)
    if (url.pathname.endsWith('/cards')) return response([])
    return response(url.searchParams.has('before') ? [{ ...page[999], id: 'action-last' }] : page)
  }, async () => {
    const history = await getSprintHistory('board', settings, 'token', 'key')
    assert.equal(history.length, 1)
    assert.equal(history[0].actions.length, 1001)
    assert.equal(history[0].card.name, 'Paged card')
  })

  const actionCalls = calls.filter((url) => url.pathname.endsWith('/actions'))
  assert.equal(actionCalls.length, 2)
  assert.equal(actionCalls[0].searchParams.get('since'), '2026-10-01T07:00:00.000Z')
  assert.equal(actionCalls[1].searchParams.get('before'), 'action-0999')
  assert.equal(calls.filter((url) => url.pathname.endsWith('/cards')).length, 3)
})

test('reconstructs a card from activity after it leaves the board', async () => {
  const cardId = `${Math.floor(Date.parse('2026-09-20T00:00:00Z') / 1000).toString(16)}${'b'.repeat(16)}`
  const calls = []
  await withFetch(async (input) => {
    const url = new URL(input)
    calls.push(url)
    if (url.pathname.endsWith('/cards')) return response([])
    return response([{
      id: 'move-away', date: '2026-10-03T10:00:00.000Z', type: 'moveCardFromBoard',
      data: { card: { id: cardId, name: 'Moved away' }, list: { id: 'backlog' } },
    }])
  }, async () => {
    const history = await getSprintHistory('board', settings, 'token', 'key')
    assert.equal(history.length, 1)
    assert.equal(history[0].card.idList, null)
    assert.deepEqual(calculateBurndown({ ...settings, timeZone: 'UTC' }, history, '2026-10-04').map(({ remaining }) => remaining), [1, 1, 0, 0])
  })
  assert.equal(calls.filter((url) => url.pathname.endsWith('/cards')).length, 3)
})

test('shows a clear retry message for Trello rate limits and reauthorization errors', async () => {
  await withFetch(async () => response({ message: 'Too many requests' }, 429), async () => {
    await assert.rejects(getLists('board', 'token', 'key'), (error) =>
      error instanceof TrelloApiError && /wait a minute.*refresh/i.test(error.message),
    )
  })
  await withFetch(async () => response({ message: 'invalid token' }, 401), async () => {
    await assert.rejects(getLists('board', 'token', 'key'), (error) =>
      error instanceof TrelloApiError && error.status === 401 && /reconnect/i.test(error.message),
    )
  })
})

test('surfaces an authorization denial without requesting write access', async () => {
  let requestedScope
  const iframe = {
    getRestApi: async () => ({
      isAuthorized: async () => false,
      authorize: async ({ scope }) => { requestedScope = scope; throw new Error('authorization denied') },
      getToken: async () => null,
    }),
  }
  await assert.rejects(authorize(iframe), /authorization denied/)
  assert.equal(requestedScope, 'read')
})
