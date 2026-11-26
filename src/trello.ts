import { localMidnightIso, type CardHistory, type SprintSettings } from './history.ts'
import type { TrelloAction, TrelloCard, TrelloIframe, TrelloList } from './trello-types'

const API_ROOT = 'https://api.trello.com/1'

export class TrelloApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'TrelloApiError'
    this.status = status
  }
}

async function apiGet<T>(path: string, token: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API_ROOT}${path}`)
  url.search = new URLSearchParams({ ...params, key: apiKey, token }).toString()
  const response = await fetch(url)
  if (!response.ok) {
    if (response.status === 429) {
      throw new TrelloApiError(429, 'Trello is rate-limiting requests. Wait a minute, then refresh the chart.')
    }
    if (response.status === 401) throw new TrelloApiError(401, 'Trello authorization expired. Reconnect the Power-Up and try again.')
    if (response.status === 403) throw new TrelloApiError(403, 'Trello denied read access. Check the Power-Up API key and your access to this board.')
    const detail = await response.text()
    throw new TrelloApiError(response.status, `Trello API error (${response.status}): ${detail || response.statusText}`)
  }
  return response.json() as Promise<T>
}

async function fetchAll<T extends { id: string }>(
  path: string,
  token: string,
  apiKey: string,
  params: Record<string, string>,
): Promise<T[]> {
  const items: T[] = []
  let before: string | undefined
  while (true) {
    const page = await apiGet<T[]>(path, token, apiKey, {
      ...params,
      limit: '1000',
      ...(before ? { before } : {}),
    })
    items.push(...page)
    if (page.length < 1000) return items
    const nextBefore = page[page.length - 1].id
    if (nextBefore === before) throw new Error('Trello repeated an activity page. Refresh the chart to retry.')
    before = nextBefore
  }
}

export function getRestApi(t: TrelloIframe) {
  return t.getRestApi()
}

export async function authorize(t: TrelloIframe) {
  const rest = await getRestApi(t)
  if (!(await rest.isAuthorized())) await rest.authorize({ scope: 'read' })
  const token = await rest.getToken()
  if (!token) throw new Error('Trello did not return an access token. Please authorize again.')
  return token
}

export async function getLists(boardId: string, token: string, apiKey: string) {
  return apiGet<TrelloList[]>(`/boards/${boardId}/lists`, token, apiKey, {
    filter: 'open',
    fields: 'id,name',
  })
}

export async function getSprintHistory(
  boardId: string,
  settings: SprintSettings,
  token: string,
  apiKey: string,
): Promise<CardHistory[]> {
  const [cardsByList, actions] = await Promise.all([
    Promise.all([...settings.backlogListId, ...settings.inProgressListId, ...settings.doneListId].map((listId) =>
      fetchAll<TrelloCard>(`/lists/${listId}/cards`, token, apiKey, {
      filter: 'all',
      fields: 'id,name,idList,closed',
      }),
    )).then((groups) => groups.flat()),
    fetchAll<TrelloAction>(`/boards/${boardId}/actions`, token, apiKey, {
      filter: 'updateCard:idList,updateCard:closed,createCard,copyCard,deleteCard,moveCardFromBoard,moveCardToBoard',
      fields: 'id,date,type,data',
      since: localMidnightIso(settings.startDate, settings.timeZone),
    }),
  ])

  const cards = new Map(cardsByList.map((card) => [card.id, card]))
  const createdActions = new Map<string, TrelloAction>()
  const actionsByCard = new Map<string, TrelloAction[]>()
  const actionNames = new Map<string, string>()
  for (const action of actions) {
    const card = action.data.card
    const cardId = card?.id
    if (!cardId) continue
    if (card.name) actionNames.set(cardId, card.name)
    const cardActions = actionsByCard.get(cardId) ?? []
    cardActions.push(action)
    actionsByCard.set(cardId, cardActions)
    if (action.type === 'createCard' || action.type === 'copyCard') createdActions.set(cardId, action)
  }

  for (const [cardId, cardActions] of actionsByCard) {
    if (cards.has(cardId)) continue
    const latest = [...cardActions].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    const latestList = latest?.type === 'deleteCard' || latest?.type === 'moveCardFromBoard'
      ? null
      : latest?.data.listAfter?.id ?? latest?.data.listBefore?.id ?? latest?.data.list?.id ?? null
    cards.set(cardId, {
      id: cardId,
      name: actionNames.get(cardId) ?? 'Unavailable card',
      idList: latestList ?? null,
      closed: latest?.data.card?.closed,
    })
  }

  return [...cards.values()].map((card) => {
    const created = createdActions.get(card.id)?.date
    const objectIdSeconds = Number.parseInt(card.id.slice(0, 8), 16)
    const createdAt = created ?? (Number.isFinite(objectIdSeconds) ? new Date(objectIdSeconds * 1000).toISOString() : '')
    return { card, createdAt, actions: actionsByCard.get(card.id) ?? [] }
  })
}

