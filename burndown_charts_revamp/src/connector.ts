import type { TrelloIframe } from './trello-types'

const apiKey = import.meta.env.VITE_TRELLO_API_KEY
const appName = 'burndown_charts'
const appUrl = new URL('./', window.location.href).toString()

function openModal(t: TrelloIframe) {
  return t.modal({ title: 'Burndown charts', url: appUrl, fullscreen: true })
}

if (window.TrelloPowerUp && apiKey) {
  window.TrelloPowerUp.initialize({
    'board-buttons': () => [{
      text: 'Burndown charts',
      icon: { dark: `${appUrl}burndown-white.svg`, light: `${appUrl}burndown-dark.svg` },
      condition: 'always',
      callback: openModal,
    }],
    'on-enable': openModal,
    'show-settings': openModal,
    'authorization-status': async (t) => ({ authorized: await (await t.getRestApi()).isAuthorized() }),
    'show-authorization': (t) => t.popup({ title: 'Connect Trello', url: `${appUrl}?authorize=1`, height: 120 }),
  }, { appKey: apiKey, appName })
}
