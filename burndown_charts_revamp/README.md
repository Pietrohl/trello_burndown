# burndown_charts

A Trello Power-Up that plots a sprint burndown from card movement history. It is a static SolidJS app built with Vite and TypeScript. Chart.js and the Trello Power-Up SDK load from their public CDNs; board settings stay in Trello Power-Up data, and board activity is fetched directly from Trello with read-only access.

## Local development

1. Copy `.env.example` to `.env.local` and set `VITE_TRELLO_API_KEY` to the API key generated for this Power-Up in Trello's app admin.
2. Run `npm run dev` and use the Vite HTTPS tunnel or a deployed HTTPS URL as the Power-Up connector URL. Trello requires HTTPS for the connector.
3. In the Power-Up admin portal, enable `board-buttons`, `on-enable`, `show-settings`, `authorization-status`, and `show-authorization`.

`VITE_TRELLO_API_KEY` is a public app identifier embedded in the frontend build. User authorization is read-only and Trello stores the resulting user token privately.

## Commands

- `npm run dev` starts Vite.
- `npm run build` type-checks and builds the app and connector pages into `dist/`.
- `npm test` checks the history reconstruction logic with Node's built-in test runner.

## Sprint behavior

Set the sprint dates and choose distinct Backlog, In Progress, and Done lists. The actual line counts cards not in Done. A card that enters the selected workflow during the sprint is included from the first day; its recorded Trello list changes determine its status on later days. Future sprint dates show the ideal line without actual values. Refresh the board button to recalculate from activity history.

## Install on your board

1. Build and deploy `dist/` to any static HTTPS host.
2. Register a custom Power-Up in [Trello app admin](https://trello.com/apps/admin) for the Workspace that owns your board. Set its connector URL to `https://<your-host>/connector.html` and generate its Trello API key.
3. Build again with that key in `.env.local`, deploy the updated `dist/`, then enable the Power-Up on a board in that Workspace.

The Power-Up is currently intended for private Workspace installation. Public directory listing requires a separate Trello review.
