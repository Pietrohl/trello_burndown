export {}

declare global {
  interface Window {
    TrelloPowerUp?: TrelloPowerUpGlobal
    Chart?: new (context: CanvasRenderingContext2D, config: unknown) => ChartInstance
  }
}

export interface ChartInstance {
  destroy(): void
}

interface TrelloPowerUpGlobal {
  initialize(
    capabilities: Record<string, (t: TrelloIframe) => unknown>,
    options: { appKey: string; appName: string },
  ): void
  iframe(options: { appKey: string; appName: string }): TrelloIframe
}

export interface TrelloList {
  id: string
  name: string
}

export interface TrelloCard {
  id: string
  name: string
  idList?: string | null
  closed?: boolean
  dateLastActivity?: string
}

export interface TrelloAction {
  id: string
  date: string
  type: string
  displayKey?: string
  data: {
    card?: { id: string; name?: string; closed?: boolean }
    list?: { id: string }
    listBefore?: { id: string }
    listAfter?: { id: string }
  }
}

export interface TrelloIframe {
  getRestApi(): Promise<TrelloRestApi>
  signUrl(url: string): string
  getContext(): Promise<{ board?: { id: string } }>
  get(scope: 'board', visibility: 'shared', key: string): Promise<unknown>
  set(scope: 'board', visibility: 'shared', key: string, value: unknown): Promise<void>
  modal(options: { title: string; url: string; fullscreen: boolean }): Promise<void>
  popup(options: { title: string; url: string; height: number }): Promise<void>
  closePopup(): Promise<void>
}

interface TrelloRestApi {
  isAuthorized(): Promise<boolean>
  authorize(options: { scope: 'read' }): Promise<string>
  getToken(): Promise<string | null>
  clearToken(): Promise<void>
}
