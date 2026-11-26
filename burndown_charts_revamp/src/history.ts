import type { TrelloAction, TrelloCard } from './trello-types'

export interface SprintSettings {
  startDate: string
  endDate: string
  backlogListId: string
  inProgressListId: string
  doneListId: string
}

export interface CardHistory {
  card: TrelloCard
  createdAt: string
  actions: TrelloAction[]
}

export interface BurndownPoint {
  date: string
  remaining: number | null
  ideal: number
}

const dateOnly = (date: Date) => date.toISOString().slice(0, 10)

function cardCreatedAt(id: string) {
  const seconds = Number.parseInt(id.slice(0, 8), 16)
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : ''
}

export function calculateBurndown(
  settings: SprintSettings,
  cards: CardHistory[],
  today = dateOnly(new Date()),
): BurndownPoint[] {
  const { startDate, endDate, backlogListId, doneListId } = settings
  const workflow = new Set([backlogListId, settings.inProgressListId, doneListId])
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  if (!backlogListId || !doneListId || start > end || Number.isNaN(start.getTime())) return []

  const eligible = cards.filter(({ card, createdAt, actions }) => {
    const cardStart = createdAt || cardCreatedAt(card.id)
    if (!cardStart || cardStart.slice(0, 10) > endDate) return false
    let endList = card.idList
    for (const action of actions
      .filter(({ date, data }) => date.slice(0, 10) > endDate && data.listBefore?.id)
      .sort((a, b) => b.date.localeCompare(a.date))) {
      endList = action.data.listBefore!.id
    }
    return workflow.has(endList) || actions.some(({ date, data }) =>
      date.slice(0, 10) >= startDate && date.slice(0, 10) <= endDate &&
      (workflow.has(data.listBefore?.id ?? '') || workflow.has(data.listAfter?.id ?? '') || workflow.has(data.list?.id ?? '')),
    )
  })

  const dates: string[] = []
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) dates.push(dateOnly(day))
  const dailyCounts = dates.map(() => 0)

  for (const item of eligible) {
    const createdAt = item.createdAt || cardCreatedAt(item.card.id)
    const createdOn = createdAt.slice(0, 10)
    let listId = item.card.idList
    const laterMoves = item.actions
      .filter(({ date, data }) => date.slice(0, 10) > endDate && data.listBefore?.id)
      .sort((a, b) => b.date.localeCompare(a.date))
    for (const action of laterMoves) listId = action.data.listBefore!.id
    const moves = item.actions
      .filter(({ date, data }) => date.slice(0, 10) >= startDate && date.slice(0, 10) <= endDate && data.listBefore?.id && data.listAfter?.id)
      .sort((a, b) => b.date.localeCompare(a.date))

    for (const action of moves) listId = action.data.listBefore!.id

    const isNewDuringSprint = createdOn >= startDate && createdOn <= endDate
    if (isNewDuringSprint) listId = backlogListId

    const events = item.actions.flatMap((action) => {
      if (action.date.slice(0, 10) < startDate || action.date.slice(0, 10) > endDate) return []
      const nextListId = action.data.listAfter?.id ?? (action.type === 'createCard' ? action.data.list?.id : undefined)
      return nextListId ? [{ date: action.date, listId: nextListId }] : []
    }).sort((a, b) => a.date.localeCompare(b.date))

    if (isNewDuringSprint) events.unshift({ date: createdAt, listId: backlogListId })
    let eventIndex = 0
    for (let index = 0; index < dates.length; index++) {
      while (events[eventIndex]?.date.slice(0, 10) <= dates[index]) {
        listId = events[eventIndex].listId
        eventIndex++
      }
      dailyCounts[index] += Number(listId !== doneListId)
    }
  }

  const initial = dailyCounts[0] ?? 0
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
  const result: BurndownPoint[] = []
  for (let index = 0; index < dates.length; index++) {
    const progress = Math.min(index / totalDays, 1)
    result.push({
      date: dates[index],
      remaining: dates[index] <= today ? dailyCounts[index] : null,
      ideal: Math.max(0, Number((initial * (1 - progress)).toFixed(1))),
    })
  }
  return result
}
