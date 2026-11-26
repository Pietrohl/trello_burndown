import type { TrelloAction, TrelloCard } from './trello-types'
import { isValidTimeZone, type SprintSettings } from './settings.ts'

export type { SprintSettings } from './settings'

export interface CardHistory {
  card: TrelloCard
  createdAt: string
  actions: TrelloAction[]
}

export interface BurndownPoint {
  date: string
  remaining: number | null
  completed: number | null
  ideal: number
}

interface Movement {
  date: string
  fromListId: string | null
  toListId: string | null
  id: string
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function addCalendarDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

export function localMidnightIso(date: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number)
  const nominal = Date.UTC(year, month - 1, day)
  let low = nominal - 36 * 60 * 60 * 1000
  let high = nominal + 36 * 60 * 60 * 1000
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (dateInTimeZone(new Date(middle), timeZone) < date) low = middle + 1
    else high = middle
  }
  return new Date(low).toISOString()
}

function cardCreatedAt(id: string) {
  if (!/^[0-9a-f]{8}/i.test(id)) return ''
  const seconds = Number.parseInt(id.slice(0, 8), 16)
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : ''
}

function movement(action: TrelloAction): Movement | undefined {
  const { data } = action
  if (action.type === 'updateCard' && data.listBefore && data.listAfter) {
    return { id: action.id, date: action.date, fromListId: data.listBefore.id, toListId: data.listAfter.id }
  }
  if (action.type === 'createCard') {
    return { id: action.id, date: action.date, fromListId: null, toListId: data.list?.id ?? null }
  }
  if (action.type === 'moveCardFromBoard' || action.type === 'deleteCard') {
    return { id: action.id, date: action.date, fromListId: data.listBefore?.id ?? data.list?.id ?? null, toListId: null }
  }
  if (action.type === 'moveCardToBoard') {
    return { id: action.id, date: action.date, fromListId: null, toListId: data.listAfter?.id ?? data.list?.id ?? null }
  }
  return undefined
}

export function calculateBurndown(
  settings: SprintSettings,
  cards: CardHistory[],
  today = dateInTimeZone(new Date(), settings.timeZone),
): BurndownPoint[] {
  const { startDate, endDate, backlogListId, inProgressListId, doneListId, timeZone } = settings
  if (!backlogListId || !inProgressListId || !doneListId || startDate > endDate || !isValidTimeZone(timeZone)) return []

  const remainingLists = new Set([backlogListId, inProgressListId])
  const sprintLists = new Set([...remainingLists, doneListId])
  const dates: string[] = []
  for (let date = startDate; date <= endDate; date = addCalendarDay(date)) dates.push(date)
  const remainingCounts = dates.map(() => 0)
  const completedCounts = dates.map(() => 0)

  for (const item of cards) {
    const createdAt = item.createdAt || cardCreatedAt(item.card.id)
    const createdOn = createdAt ? dateInTimeZone(new Date(createdAt), timeZone) : ''
    if (createdOn && createdOn > endDate) continue

    const moves = item.actions
      .map(movement)
      .filter((value): value is Movement => value !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    let currentList = item.card.idList
    if (currentList === undefined) currentList = moves.at(-1)?.toListId ?? null

    for (const move of [...moves].reverse()) {
      if (dateInTimeZone(new Date(move.date), timeZone) > endDate) currentList = move.fromListId
    }
    let listAtStart = currentList
    for (const move of [...moves].reverse()) {
      const date = dateInTimeZone(new Date(move.date), timeZone)
      if (date >= startDate && date <= endDate) listAtStart = move.fromListId
    }

    const sprintMoves = moves.filter((move) => {
      const date = dateInTimeZone(new Date(move.date), timeZone)
      return date >= startDate && date <= endDate
    })
    const relevant = sprintLists.has(listAtStart ?? '') || sprintMoves.some((move) =>
      sprintLists.has(move.fromListId ?? '') || sprintLists.has(move.toListId ?? ''),
    )
    if (!relevant) continue

    let listId = createdOn >= startDate && createdOn <= endDate ? null : listAtStart
    let enteredDone = false
    let moveIndex = 0
    for (let index = 0; index < dates.length; index++) {
      while (moveIndex < sprintMoves.length && dateInTimeZone(new Date(sprintMoves[moveIndex].date), timeZone) <= dates[index]) {
        const next = sprintMoves[moveIndex]
        if (next.toListId === doneListId && next.fromListId !== doneListId) enteredDone = true
        listId = next.toListId
        moveIndex++
      }
      remainingCounts[index] += Number(remainingLists.has(listId ?? ''))
      completedCounts[index] += Number(listId === doneListId && enteredDone)
    }
  }

  const initial = remainingCounts[0] ?? 0
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
  return dates.map((date, index) => ({
    date,
    remaining: date <= today ? remainingCounts[index] : null,
    completed: date <= today ? completedCounts[index] : null,
    ideal: Math.max(0, Number((initial * (1 - Math.min(index / totalDays, 1))).toFixed(1))),
  }))
}
