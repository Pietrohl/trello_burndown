import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateBurndown } from './history.ts'

const settings = {
  startDate: '2026-10-01',
  endDate: '2026-10-04',
  backlogListId: 'backlog',
  inProgressListId: 'doing',
  doneListId: 'done',
}

test('reconstructs completed cards and includes a sprint addition from day one', () => {
  const result = calculateBurndown(settings, [
    {
      card: { id: 'card-1', name: 'First', idList: 'done', closed: false },
      createdAt: '2026-09-20T12:00:00.000Z',
      actions: [{
        id: 'move-1', date: '2026-10-02T14:00:00.000Z', type: 'updateCard',
        data: { card: { id: 'card-1' }, listBefore: { id: 'backlog' }, listAfter: { id: 'done' } },
      }],
    },
    {
      card: { id: 'card-2', name: 'Added', idList: 'doing', closed: false },
      createdAt: '2026-10-03T10:00:00.000Z',
      actions: [{
        id: 'create-2', date: '2026-10-03T10:00:00.000Z', type: 'createCard',
        data: { card: { id: 'card-2' }, list: { id: 'doing' } },
      }],
    },
  ], '2026-10-04')

  assert.deepEqual(result.map(({ remaining }) => remaining), [2, 1, 1, 1])
  assert.equal(result[0].ideal, 2)
  assert.equal(result.at(-1).ideal, 0)
})

test('leaves future actual values empty while retaining the ideal line', () => {
  const result = calculateBurndown(settings, [], '2026-10-02')
  assert.deepEqual(result.map(({ remaining }) => remaining), [0, 0, null, null])
  assert.equal(result.at(-1).ideal, 0)
})

test('uses the sprint-end state when a card moves after the sprint', () => {
  const result = calculateBurndown(settings, [{
    card: { id: 'card-3', name: 'Moved later', idList: 'backlog', closed: false },
    createdAt: '2026-09-20T12:00:00.000Z',
    actions: [
      { id: 'move-done', date: '2026-10-03T10:00:00.000Z', type: 'updateCard', data: { card: { id: 'card-3' }, listBefore: { id: 'backlog' }, listAfter: { id: 'done' } } },
      { id: 'move-back', date: '2026-10-05T10:00:00.000Z', type: 'updateCard', data: { card: { id: 'card-3' }, listBefore: { id: 'done' }, listAfter: { id: 'backlog' } } },
    ],
  }], '2026-10-04')

  assert.deepEqual(result.map(({ remaining }) => remaining), [1, 1, 0, 0])
})
