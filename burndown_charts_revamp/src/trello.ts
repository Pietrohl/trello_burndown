import type { CardHistory, SprintSettings } from './history'
import type { TrelloAction, TrelloCard, TrelloIframe, TrelloList } from './trello-types'

const API_ROOT = 'https://api.trello.com/1'

async function apiGet<T>(path: string, token: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API_ROOT}${path}`)
  url.search = new URLSearchParams({ ...params, key: apiKey, token }).toString()
  const response = await fetch(url)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Trello API error (${response.status}): ${detail || response.statusText}`)
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
    before = page[page.length - 1].id
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
  const [cards, actions] = await Promise.all([
    fetchAll<TrelloCard>(`/boards/${boardId}/cards/all`, token, apiKey, {
      filter: 'all',
      fields: 'id,name,idList,closed',
    }),
    fetchAll<TrelloAction>(`/boards/${boardId}/actions`, token, apiKey, {
      filter: 'updateCard,createCard',
      since: `${settings.startDate}T00:00:00.000Z`,
    }),
  ])

  const createdActions = new Map<string, TrelloAction>()
  const actionsByCard = new Map<string, TrelloAction[]>()
  for (const action of actions) {
    const cardId = action.data.card?.id
    if (!cardId) continue
    const cardActions = actionsByCard.get(cardId) ?? []
    cardActions.push(action)
    actionsByCard.set(cardId, cardActions)
    if (action.type === 'createCard') createdActions.set(cardId, action)
  }

  return cards.map((card) => ({
    card,
    createdAt: createdActions.get(card.id)?.date ?? new Date(Number.parseInt(card.id.slice(0, 8), 16) * 1000).toISOString(),
    actions: actionsByCard.get(card.id) ?? [],
  }))
}

