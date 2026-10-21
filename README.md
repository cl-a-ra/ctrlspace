# CTRLSPACE

CTRLSPACE is a responsive PWA for organizing and managing applications, websites, and projects.

## Run locally

```sh
npm.cmd install
npm.cmd run dev
```

Create a production build with `npm.cmd run build`. Preview the built app and API together with `npm.cmd run preview`, or run the production server with `npm.cmd start`.

## Included in this first slice

- Responsive dark workspace shell with overview, application library, project, and activity views.
- Separate Personal, Business, Developer, and Platform Admin portal destinations. Personal opens the individual workspace; Business summarizes the local app inventory and project delivery; Developer focuses on open project tasks and bugs; Platform Admin stays locked until a verified server-side administrator identity and authorization source exist. Portal-aware navigation keeps dashboard, activity, and settings journeys connected; linking from Business inventory/project progress and Developer task/bug lists opens the corresponding app or project workflow. Business and Developer previews clearly disclose that their data is browser-local, not shared company data. Global search (Ctrl/Cmd+K) searches applications, projects, tasks, and bugs and opens the selected result.
- Add applications with a website URL, Git repository URL, a local project folder, or any combination; when a website URL is provided, CTRLSPACE can retrieve its page title for the application name and falls back to the domain if no title is available. Search and filter by category, pin favorites, switch between grid and list layouts, and remove applications from the library. Local folders are linked on this device with browser permission and can be browsed as a read-only file-name listing; file contents are not copied or uploaded.
- Import GitHub repositories selected for the CTRLSPACE GitHub App. The server mints short-lived installation tokens, keeps private app credentials off the browser, and returns repository metadata only; imported app records remain local to the current browser.
- Create and delete collections, assign applications to them, and filter the library by collection. Deleting a collection moves its applications to Unfiled. Applications and collections are stored in the current browser's local storage. A site's `/favicon.ico` is displayed when available; otherwise CTRLSPACE uses an initial.
- See your six most recently opened websites or repositories on the Overview. Opening a resource updates its last-opened time locally in this browser.
- Create projects and tasks with descriptions, priorities, responsible developer names, start dates, and due dates; update assignments and task status, and track completion progress. Project data is stored in this browser only; developer names are not linked to accounts.
- Report project-linked bugs with a description, category, severity, optional responsible developer, and related commit/deployment URL; filter reports by category, update status or assignment, and delete resolved or unwanted reports. Bug reports, including creation and update timestamps, are stored locally in this browser; assignments are developer names rather than account-linked users.
- See overdue tasks, deadlines due within seven days, unresolved bug reminders, and degraded/offline website checks in the Overview and reminder center. Selecting a reminder opens its project or application. Alerts are derived from local data; browser push notifications are not implemented.
- Schedule optional reminders for bugs; unresolved bugs due within seven days appear on the Overview, and resolved bugs are excluded. Reminder dates can be changed or cleared from the project bug list; reminders are local and do not use browser notifications.
- Check registered public websites on demand to see HTTP reachability, status, and response time. The latest result is saved with the application on this device; checks do not run in the background and are not application-level health tests.
- Review a local activity timeline for application launches and organization, plus project, task, and bug changes. Filter by activity type or clear the history; the latest 100 events are stored in this browser only.
- Open profile options to review the current local/account storage mode and sign out when authenticated. The workspace setup count reflects available applications, projects, GitHub, and website-check setup.
- Use Settings as an appearance hub to change the local display name, choose system/light/dark themes, select system, code, or terminal interface fonts, and pick from six tech-inspired accent color schemes. Theme, palette, and font choices persist locally and work offline. Export a JSON workspace backup; the backup is downloaded locally and does not include browser folder permissions.
- PWA manifest and a production service worker for caching the app shell and previously loaded same-origin assets.
- System-aware Dark/Light appearance with a visible theme selector; user choices are saved locally in this browser.
- Reduced-motion styling and basic keyboard support for the add-application dialog.

## Configure GitHub repository import

1. Create a GitHub App for CTRLSPACE. Set its **Setup URL** to `APP_BASE_URL/api/github/callback`; use `http://127.0.0.1:5173/api/github/callback` for local development.
2. Grant only the **Metadata: read-only** repository permission. Do not enable webhook events for this repository-picker feature.
3. Copy `.env.example` to `.env`, then fill in the GitHub App ID, URL slug, and private key. Store the PEM private key on one line with newline characters encoded as `\n`. Never commit `.env`.
4. Run `npm.cmd run dev`, open the app, and choose **Add application → Connect GitHub**. GitHub asks the user to install CTRLSPACE and select which repositories the app may access.

The GitHub App installation is limited to the repositories selected during GitHub's installation flow. CTRLSPACE does not download repository source code or persist GitHub access tokens. The server keeps installation sessions in memory, so a server restart requires reconnecting. For production, configure `APP_BASE_URL` with the HTTPS app origin, set the same HTTPS Setup URL on the GitHub App, and provide secrets through the hosting provider's secret manager. Imported application records are currently stored in the importing browser, not shared between users.

## Configure account sign-in with Supabase

1. Create a Supabase project. Under **Authentication → Providers**, enable Email for email/password registration and sign-in. Enable email confirmation if desired. Enable Google separately if you also want Google sign-in, then configure its OAuth client and callback URL in Google Cloud.
2. Under **Authentication → URL Configuration**, set the Site URL to the deployed CTRLSPACE origin and allow the redirect URLs for local development (`http://127.0.0.1:5173`) and each deployed origin. Email confirmation and password recovery return to the app origin.
3. Configure Supabase's email/SMTP settings for confirmation and recovery messages. The built-in email service is suitable for development/testing; configure a trusted SMTP provider for reliable production delivery.
4. Copy the Supabase project URL and publishable/anon key into `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart the development server. These are browser client settings; never put a Supabase service-role key in a `VITE_` variable.
5. With Supabase configured, users can create an account with email/password, confirm their email when confirmation is enabled, sign in with email/password or Google, request a password-recovery link, and choose a new password from that link. CTRLSPACE requires authentication and keeps each account's current workspace data in a separate browser-local storage namespace.

Email delivery and account creation depend on the Supabase project configuration; this repository does not contain project credentials. Applications, projects, tasks, bugs, collections, and activity are still stored in that browser; this is not yet PostgreSQL-backed cross-device synchronization, organization membership, or role-based authorization. Without Supabase settings, the existing local-only mode remains available. If only one of the two Supabase settings is present, CTRLSPACE shows a configuration error rather than silently falling back to local mode.

## Current boundaries

Project, task, and bug data, applications, collections, health-check results, and activity history remain local to one browser and are not shared across devices. When Google sign-in is configured, local workspace data is separated by signed-in account on that browser; it is not uploaded to PostgreSQL. Portal pages provide distinct navigation and local summaries, not separate data scopes or authorization. Platform Admin is intentionally locked; the application has no verified platform-admin identity or server-side authorization source. Website checks run only when requested and report HTTP reachability; scheduled background checks, application-level health tests, organization membership and permissions, shared server-side application storage, Git commits/builds, billing integrations, document sharing, and push notifications are not implemented yet. Account-linked developer assignments and automatic commit/deployment integrations are not implemented yet. The activity timeline records changes made in CTRLSPACE, not external GitHub, deployment, or monitoring events.
