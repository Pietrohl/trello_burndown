import { createEffect, createSignal, For, onCleanup, onSettled, Show } from 'solid-js'
import { calculateBurndown, dateInTimeZone, sprintIsProjected, type BurndownPoint } from './history'
import { browserTimeZone, normalizeSprintSettings, supportedTimeZones, validateSprintSettings, type SprintSettings } from './settings'
import { authorize, getLists, getSprintHistory, TrelloApiError } from './trello'
import type { ChartInstance, TrelloIframe, TrelloList } from './trello-types'
import './App.css'

const apiKey = import.meta.env.VITE_TRELLO_API_KEY
const appName = 'burndown_charts_revamp'
const initialTimeZone = browserTimeZone()
const timeZones = supportedTimeZones()
type View = 'loading' | 'authorize' | 'setup' | 'chart' | 'chart-error' | 'error'

function today() {
  return dateInTimeZone(new Date(), initialTimeZone)
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function BurndownChart(props: { points: BurndownPoint[]; projected: boolean }) {
  let canvas!: HTMLCanvasElement
  let chart: ChartInstance | undefined

  createEffect(() => [props.points, props.projected] as const, ([points, projected]) => {
    const context = canvas?.getContext('2d')
    if (!context || !window.Chart) return
    chart?.destroy()
    chart = new window.Chart(context, {
      type: 'line',
      data: {
        labels: points.map(({ date }) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })),
        datasets: [
          {
            label: 'Cards remaining',
            data: points.map(({ remaining }) => remaining),
            borderColor: '#317f70',
            backgroundColor: 'rgba(49, 127, 112, 0.12)',
            borderWidth: 3,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.25,
            spanGaps: false,
          },
          {
            label: projected ? 'Projected ideal burndown' : 'Ideal burndown',
            data: points.map(({ ideal }) => ideal),
            borderColor: '#aab4b1',
            borderDash: [6, 6],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 24 } },
          tooltip: { backgroundColor: '#192c2a', padding: 12, displayColors: false },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: '#697572', maxTicksLimit: 12 } },
          y: { beginAtZero: true, suggestedMax: Math.max(1, points[0]?.ideal ?? 0), ticks: { precision: 0, color: '#697572', stepSize: 1 }, grid: { color: '#edf0ef' }, border: { display: false } },
        },
      },
    })
  })

  onCleanup(() => chart?.destroy())
  return <div class="chart-canvas"><canvas ref={canvas} role="img" aria-label="Burndown chart of cards remaining and ideal progress over the sprint" /></div>
}

function App() {
  const [view, setView] = createSignal<View>('loading')
  const [error, setError] = createSignal('')
  const [t, setT] = createSignal<TrelloIframe>()
  const [boardId, setBoardId] = createSignal('')
  const [lists, setLists] = createSignal<TrelloList[]>([])
  const [settings, setSettings] = createSignal<SprintSettings>()
  const [points, setPoints] = createSignal<BurndownPoint[]>([])
  const [saving, setSaving] = createSignal(false)
  const [timeZone, setTimeZone] = createSignal(initialTimeZone)
  const [startDate, setStartDate] = createSignal(today())
  const [endDate, setEndDate] = createSignal(addDays(today(), 14))
  const [backlogListId, setBacklogListId] = createSignal('')
  const [inProgressListId, setInProgressListId] = createSignal('')
  const [doneListId, setDoneListId] = createSignal('')
  const [loadedAt, setLoadedAt] = createSignal('')
  const [savedNotice, setSavedNotice] = createSignal(false)
  const [projected, setProjected] = createSignal(false)

  async function loadChart(savedSettings: SprintSettings, iframe = t()) {
    if (!iframe || !apiKey) return false
    setView('loading')
    try {
      const token = await authorize(iframe)
      const history = await getSprintHistory(boardId(), savedSettings, token, apiKey)
      setPoints(calculateBurndown(savedSettings, history))
      setSettings(savedSettings)
      setProjected(sprintIsProjected(savedSettings))
      setLoadedAt(new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', timeZone: savedSettings.timeZone }).format(new Date()))
      setError('')
      setSavedNotice(false)
      setView('chart')
      return true
    } catch (cause) {
      if (cause instanceof TrelloApiError && cause.status === 401) {
        await (await iframe.getRestApi()).clearToken().catch(() => undefined)
        setError(`${savedNotice() ? 'Sprint settings were saved. ' : ''}Your Trello read authorization expired. Reconnect to continue.`)
        setView('authorize')
      } else {
        setError(`${savedNotice() ? 'Sprint settings were saved. ' : ''}${cause instanceof Error ? cause.message : 'Could not load the burndown chart.'}`)
        setView('chart-error')
      }
      return false
    }
  }

  async function loadBoard(iframe: TrelloIframe) {
    if (!apiKey) {
      setError('Add VITE_TRELLO_API_KEY to .env.local, then build and deploy the Power-Up.')
      setView('error')
      return
    }
    try {
      const context = iframe.getContext()
      if (!context.board?.id) throw new Error('Open burndown_charts from a Trello board.')
      setBoardId(context.board.id)
      const restApi = await iframe.getRestApi()
      if (!(await restApi.isAuthorized())) {
        setView('authorize')
        return
      }
      const token = await authorize(iframe)
      const [boardLists, stored] = await Promise.all([
        getLists(context.board.id, token, apiKey),
        iframe.get('board', 'shared', 'sprintSettings'),
      ])
      setLists(boardLists)
      const savedSettings = normalizeSprintSettings(stored)
      if (savedSettings) {
        setSettings(savedSettings)
        setTimeZone(savedSettings.timeZone)
        setStartDate(savedSettings.startDate)
        setEndDate(savedSettings.endDate)
        setBacklogListId(savedSettings.backlogListId)
        setInProgressListId(savedSettings.inProgressListId)
        setDoneListId(savedSettings.doneListId)
        await loadChart(savedSettings, iframe)
      } else {
        setView('setup')
      }
    } catch (cause) {
      if (cause instanceof TrelloApiError && cause.status === 401) {
        await (await iframe.getRestApi()).clearToken().catch(() => undefined)
        setError('Your Trello read authorization expired. Reconnect to continue.')
        setView('authorize')
        return
      }
      setError(cause instanceof Error ? cause.message : 'Could not connect to this Trello board.')
      setView('error')
    }
  }

  onSettled(() => {
    const iframe = window.TrelloPowerUp?.iframe({ appKey: apiKey, appName })
    if (!iframe) {
      setError('This page needs to be opened from the Burndown charts button on a Trello board.')
      setView('error')
      return
    }
    setT(iframe)
    void loadBoard(iframe)
  })

  async function connect() {
    const iframe = t()
    if (!iframe) return
    setError('')
    setView('loading')
    try {
      await authorize(iframe)
      if (new URLSearchParams(window.location.search).has('authorize')) {
        await iframe.closePopup()
        return
      }
      await loadBoard(iframe)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Trello authorization was cancelled.')
      setView('authorize')
    }
  }

  async function refresh() {
    const value = settings()
    if (value) await loadChart(value)
  }

  async function saveSettings(event: SubmitEvent) {
    event.preventDefault()
    const iframe = t()
    const next: SprintSettings = {
      startDate: startDate(),
      endDate: endDate(),
      backlogListId: backlogListId(),
      inProgressListId: inProgressListId(),
      doneListId: doneListId(),
      timeZone: timeZone(),
    }
    const validationError = validateSprintSettings(next)
    if (validationError) {
      setError(validationError)
      return
    }
    if (!iframe) return
    setError('')
    setSaving(true)
    try {
      await iframe.set('board', 'shared', 'sprintSettings', next)
      setSettings(next)
      setPoints([])
      setSavedNotice(true)
      await loadChart(next, iframe)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save sprint settings. Check that you can edit this board.')
      setView('setup')
    } finally {
      setSaving(false)
    }
  }

  function editSettings() {
    const value = settings()
    if (value) {
      setStartDate(value.startDate)
      setEndDate(value.endDate)
      setBacklogListId(value.backlogListId)
      setInProgressListId(value.inProgressListId)
      setDoneListId(value.doneListId)
      setTimeZone(value.timeZone)
    }
    setError('')
    setView('setup')
  }

  const latestPoint = () => [...points()].reverse().find((point) => point.remaining !== null)
  const initialCount = () => points()[0]?.ideal ?? 0
  const remainingCount = () => latestPoint()?.remaining ?? 0
  const selectedListName = (id: string) => lists().find((list) => list.id === id)?.name ?? 'Trello list'

  return (
    <main class="app-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="Burndown charts home">
          <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
          <span>burndown<span class="brand-light">_charts</span></span>
        </a>
        <span class="board-tag">TRELLO POWER-UP</span>
      </header>

      <Show when={view() === 'loading'}>
        <section class="center-state" aria-live="polite"><span class="spinner" /><p>Loading board activity…</p></section>
      </Show>

      <Show when={view() === 'authorize'}>
        <section class="center-state connect-state">
          <div class="empty-icon">↗</div>
          <p class="eyebrow">ONE-TIME SETUP</p>
          <h1>Connect to Trello</h1>
          <p>This Power-Up requests Trello’s read-only API permission. It can read cards, lists, and activity on boards you can access, but cannot change them.</p>
          <Show when={error()}><p class="inline-error" role="alert">{error()}</p></Show>
          <button class="primary-button" onClick={connect}>Authorize read-only access</button>
        </section>
      </Show>

      <Show when={view() === 'setup'}>
        <section class="setup-layout">
          <div class="intro-copy">
            <p class="eyebrow">SPRINT SETUP</p>
            <h1>Choose your sprint workflow</h1>
            <p>Select the dates and Trello lists that define this sprint. Card movement history builds the daily burndown.</p>
          </div>
          <form class="setup-card" onSubmit={saveSettings}>
            <div class="form-section">
              <h2>Sprint timeframe</h2>
              <div class="date-grid">
                <label>Starts<input type="date" required value={startDate()} onInput={(event) => setStartDate(event.currentTarget.value)} /></label>
                <label>Ends<input type="date" required value={endDate()} onInput={(event) => setEndDate(event.currentTarget.value)} /></label>
              </div>
              <label class="timezone-row">Sprint time zone
                <input list="sprint-time-zones" value={timeZone()} onInput={(event) => setTimeZone(event.currentTarget.value)} placeholder="America/Sao_Paulo" />
                <datalist id="sprint-time-zones"><For each={timeZones}>{(zone) => <option value={zone} />}</For></datalist>
              </label>
            </div>
            <div class="form-section">
              <h2>Board lists</h2>
              <p class="form-hint">Count cards while they are in Backlog or In Progress; Done is tracked separately.</p>
              <ListSelect label="Backlog" value={backlogListId()} lists={lists()} onChange={setBacklogListId} />
              <ListSelect label="In Progress" value={inProgressListId()} lists={lists()} onChange={setInProgressListId} />
              <ListSelect label="Done" value={doneListId()} lists={lists()} onChange={setDoneListId} />
            </div>
            <Show when={error()}><p class="error-banner" role="alert">{error()}</p></Show>
            <div class="form-actions">
              <Show when={settings() && points().length && !error()}><button type="button" class="text-button" onClick={() => setView('chart')}>Cancel</button></Show>
              <button class="primary-button" type="submit" disabled={saving() || !lists().length}>{saving() ? 'Saving…' : 'Save sprint'}</button>
            </div>
          </form>
        </section>
      </Show>

      <Show when={view() === 'chart'}>
        <section class="dashboard">
          <div class="dashboard-heading">
            <div>
              <p class="eyebrow">SPRINT BURNDOWN</p>
              <h1>Cards remaining</h1>
              <p class="subheading">{settings()?.startDate} <span aria-hidden="true">→</span> {settings()?.endDate}</p>
              <p class="timezone-caption">All sprint days use {settings()?.timeZone}</p>
            </div>
            <div class="heading-actions">
              <button class="secondary-button" onClick={editSettings}>Sprint settings</button>
              <button class="primary-button refresh-button" onClick={refresh} aria-label="Refresh chart">↻ <span>Refresh</span></button>
            </div>
          </div>
          <div class="stats-grid">
            <StatCard label="Remaining" value={remainingCount()} detail="In Backlog or In Progress" tone="green" />
            <StatCard label="Completed" value={latestPoint()?.completed ?? 0} detail="In Done after entering during the sprint, including cards created there" />
            <StatCard label={projected() ? 'Projected initial-day scope' : 'Initial-day scope'} value={initialCount()} detail={projected() ? 'Based on current board state' : 'Cards in Backlog or In Progress'} />
          </div>
          <div class="chart-card">
            <div class="chart-heading">
              <div><h2>Progress over time</h2><p>{projected() ? 'Projected ideal pace based on current board state' : 'Actual card count compared with an ideal pace'}</p></div>
              <span class="updated-at">Updated {loadedAt()}</span>
            </div>
            <BurndownChart points={points()} projected={projected()} />
          </div>
          <div class="workflow-note">
            <span class="workflow-dot" aria-hidden="true"></span>
            <p><strong>{selectedListName(settings()!.backlogListId)}</strong> → <strong>{selectedListName(settings()!.inProgressListId)}</strong> → <strong>{selectedListName(settings()!.doneListId)}</strong></p>
            <span class="scope-note">Scope changes appear on their activity dates</span>
          </div>
          <p class="history-disclosure">History is reconstructed from activity Trello still provides. Deleted cards or unavailable activity can make past chart values incomplete.</p>
        </section>
      </Show>

      <Show when={view() === 'chart-error'}>
        <section class="center-state error-state">
          <div class="empty-icon">!</div>
          <h1>Couldn’t load the chart</h1>
          <p role="alert">{error()}</p>
          <div class="form-actions">
            <button class="secondary-button" onClick={editSettings}>Sprint settings</button>
            <button class="primary-button" onClick={refresh}>Retry chart</button>
          </div>
        </section>
      </Show>

      <Show when={view() === 'error'}>
        <section class="center-state error-state">
          <div class="empty-icon">!</div>
          <p class="eyebrow">NEEDS ATTENTION</p>
          <h1>Couldn’t load the board</h1>
          <p role="alert">{error()}</p>
          <div class="form-actions">
            <Show when={settings()}><button class="secondary-button" onClick={editSettings}>Sprint settings</button></Show>
            <button class="primary-button" onClick={() => t() && loadBoard(t()!)}>Try again</button>
          </div>
        </section>
      </Show>

      <footer class="footer"><span>burndown_charts</span><span>Board data stays in Trello</span></footer>
    </main>
  )
}

function ListSelect(props: { label: string; value: string; lists: TrelloList[]; onChange: (value: string) => void }) {
  return (
    <label class="select-row">
      <span>{props.label}</span>
      <select required value={props.value} onChange={(event) => props.onChange(event.currentTarget.value)}>
        <option value="" disabled>Select a list</option>
        <For each={props.lists}>{(list) => <option value={list.id}>{list.name}</option>}</For>
      </select>
    </label>
  )
}

function StatCard(props: { label: string; value: number; detail: string; tone?: string }) {
  return <article class={`stat-card ${props.tone ?? ''}`}><p>{props.label}</p><strong>{props.value}</strong><span>{props.detail}</span></article>
}

export default App
