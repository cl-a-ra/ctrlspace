# CTRLSPACE

CTRLSPACE is a responsive PWA foundation for P-typed's application and project workspace.

## Run locally

```sh
npm.cmd install
npm.cmd run dev
```

Create a production build with `npm.cmd run build`. Preview the built app and API together with `npm.cmd run preview`, or run the production server with `npm.cmd start`.

## Included in this first slice

- Responsive dark workspace shell with overview, application library, project, and activity views.
- Add applications with a website URL, Git repository URL, a local project folder, or any combination; search and filter by category, pin favorites, and switch between grid and list layouts. Local folders are linked on this device with browser permission and their files are not copied or uploaded.
- Import GitHub repositories selected for the CTRLSPACE GitHub App. The server mints short-lived installation tokens, keeps private app credentials off the browser, and returns repository metadata only; imported app records remain local to the current browser.
- Create collections, assign applications to them, and filter the library by collection. Applications and collections are stored in the current browser's local storage. A site's `/favicon.ico` is displayed when available; otherwise CTRLSPACE uses an initial.
- PWA manifest and a production service worker for caching the app shell and previously loaded same-origin assets.
- System-aware Dark/Light appearance with a visible theme selector; user choices are saved locally in this browser.
- Reduced-motion styling and basic keyboard support for the add-application dialog.

## Configure GitHub repository import

1. Create a GitHub App for CTRLSPACE. Set its **Setup URL** to `APP_BASE_URL/api/github/callback`; use `http://127.0.0.1:5173/api/github/callback` for local development.
2. Grant only the **Metadata: read-only** repository permission. Do not enable webhook events for this repository-picker feature.
3. Copy `.env.example` to `.env`, then fill in the GitHub App ID, URL slug, and private key. Store the PEM private key on one line with newline characters encoded as `\n`. Never commit `.env`.
4. Run `npm.cmd run dev`, open the app, and choose **Add application → Connect GitHub**. GitHub asks the user to install CTRLSPACE and select which repositories the app may access.

The GitHub App installation is limited to the repositories selected during GitHub's installation flow. CTRLSPACE does not download repository source code or persist GitHub access tokens. The server keeps installation sessions in memory, so a server restart requires reconnecting. For production, configure `APP_BASE_URL` with the HTTPS app origin, set the same HTTPS Setup URL on the GitHub App, and provide secrets through the hosting provider's secret manager. Imported application records are currently stored in the importing browser, not shared between users.

## Current boundaries

Project cards, project progress, health, and activity are clearly marked example content. Organization permissions, shared server-side application storage, Git commits/builds, billing integrations, real monitoring, project/task editing, and push notifications are not implemented yet. The application library is local to one browser and is not shared across users or devices.
