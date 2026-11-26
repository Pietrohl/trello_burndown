# burndown_charts

A static Trello Power-Up built with Vite, TypeScript, and SolidJS. It fetches board cards and activity directly from Trello with read-only access. Board sprint settings are shared through Trello Power-Up data; there is no app server or snapshot storage.

Chart.js 4.6.2 is bundled into the app from `src/vendor/chart.umd.min.js`; its upstream MIT license ships in `dist/CHARTJS-LICENSE.md`. The Trello Power-Up SDK remains loaded from Trello’s CDN.

## Local development and build

1. Copy `.env.example` to `.env.local` and set `VITE_TRELLO_API_KEY` to the key generated for this Power-Up in Trello app admin.
2. Run `npm run dev` for local development. Trello requires an HTTPS connector URL for an installed Power-Up.
3. Run `npm test` for history, settings, and mocked Trello API tests; run `npm run build` for the production bundle.

The API key is a public app identifier embedded in the frontend. Trello stores each member’s read token in private Power-Up data. Authorization uses Trello’s `read` scope: the app can read boards the member can access, including cards, lists, and activity, and cannot make board changes.

## Host security headers

Serve `dist/` over HTTPS and set a response-header CSP compatible with the connector and modal pages. For example:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self';
script-src 'self' https://p.trellocdn.com;
style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline';
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://api.trello.com;
img-src 'self' data:;
frame-ancestors https://trello.com https://*.trello.com
```

Keep `frame-ancestors` in the HTTP response header; it is not supported in a CSP `<meta>` tag. The style-attribute allowance supports Chart.js canvas sizing. Chart.js itself is bundled into the app, not loaded from a third-party script host.

## Sprint behavior

- Each board shares sprint start/end dates, an IANA time zone, and distinct Backlog, In Progress, and Done lists.
- New board settings default to the browser’s time zone. Older saved settings without a time zone are interpreted as UTC until edited.
- Days, API query boundaries, activity timestamps, and “today” use the saved zone, including daylight-saving transitions.
- Remaining counts cards only while they are in Backlog or In Progress. Activity entering or leaving those lists changes scope on that local calendar day.
- Completed counts distinct sprint cards currently in Done at the latest displayed day, if they entered Done during the sprint. Reopened cards stop counting until they return to Done.
- History is reconstructed from Trello’s available activity, including relevant cards that have left the board. Trello may no longer provide deleted or older activity, so historical values can be incomplete; the app does not create snapshots.

## Install on a board

1. Register a custom Power-Up in [Trello app admin](https://trello.com/apps/admin) for the Workspace that owns the board. Set its connector URL to `https://<your-host>/connector.html` and enable `board-buttons`, `on-enable`, `show-settings`, `authorization-status`, and `show-authorization`.
2. Generate its Trello API key, set it in `.env.local`, build, and deploy the contents of `dist/` to a static HTTPS host with the CSP above.
3. Enable the custom Power-Up on a board in that Workspace and configure the sprint.

For a live-board smoke check, authorize read access, configure a short sprint, move a card through Backlog → In Progress → Done, reopen it, and move a second card to another board. Confirm daily scope and completion counts update after refresh. Public directory publication requires separate Trello review.
