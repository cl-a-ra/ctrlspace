import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import './App.css'

type AppStatus = 'online' | 'degraded' | 'unknown'
type AppRecord = {
  id: string
  name: string
  url: string
  repositoryUrl: string
  repositoryFullName: string
  repositoryDescription: string
  repositoryPrivate: boolean | null
  repositoryDefaultBranch: string
  folderName: string
  category: string
  collection: string
  icon: string
  tint: string
  status: AppStatus
  favorite: boolean
}
type Project = {
  name: string
  description: string
  progress: number
  status: string
  initials: string
  color: string
  updated: string
}
type View = 'overview' | 'applications' | 'projects' | 'activity'
type ThemePreference = 'system' | 'light' | 'dark'
type GitHubRepository = {
  id: number
  name: string
  fullName: string
  htmlUrl: string
  description: string | null
  isPrivate: boolean
  defaultBranch: string
  updatedAt: string
}

function isGitHubRepository(value: unknown): value is GitHubRepository {
  if (typeof value !== 'object' || value === null) return false
  const repository = value as Record<string, unknown>
  return Number.isSafeInteger(repository.id)
    && typeof repository.name === 'string'
    && typeof repository.fullName === 'string'
    && typeof repository.htmlUrl === 'string'
    && (repository.description === null || typeof repository.description === 'string')
    && typeof repository.isPrivate === 'boolean'
    && typeof repository.defaultBranch === 'string'
    && typeof repository.updatedAt === 'string'
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: 'read' }) => Promise<FileSystemDirectoryHandle>
}

const DIRECTORY_DB_NAME = 'ctrlspace-local-folders'
const DIRECTORY_STORE_NAME = 'app-folders'

const initialApps: AppRecord[] = [
  { id: 'app-1', name: 'Ops Workspace', url: '', repositoryUrl: '', repositoryFullName: '', repositoryDescription: '', repositoryPrivate: null, repositoryDefaultBranch: '', folderName: '', category: 'Productivity', collection: '', icon: 'O', tint: 'violet', status: 'unknown', favorite: true },
  { id: 'app-2', name: 'Signal Studio', url: '', repositoryUrl: '', repositoryFullName: '', repositoryDescription: '', repositoryPrivate: null, repositoryDefaultBranch: '', folderName: '', category: 'Design', collection: '', icon: 'S', tint: 'blue', status: 'unknown', favorite: true },
  { id: 'app-3', name: 'Northstar Docs', url: '', repositoryUrl: '', repositoryFullName: '', repositoryDescription: '', repositoryPrivate: null, repositoryDefaultBranch: '', folderName: '', category: 'Documentation', collection: '', icon: 'N', tint: 'mint', status: 'unknown', favorite: false },
  { id: 'app-4', name: 'Pulse Monitor', url: '', repositoryUrl: '', repositoryFullName: '', repositoryDescription: '', repositoryPrivate: null, repositoryDefaultBranch: '', folderName: '', category: 'Monitoring', collection: '', icon: 'P', tint: 'orange', status: 'unknown', favorite: false },
]

const projects: Project[] = [
  { name: 'Project Atlas', description: 'Application portfolio and access hub', progress: 68, status: 'In progress', initials: 'AT', color: 'violet', updated: 'Updated 2h ago' },
  { name: 'Research Console', description: 'Shared workspace for research teams', progress: 42, status: 'In progress', initials: 'RC', color: 'blue', updated: 'Updated yesterday' },
  { name: 'Pulse API', description: 'Service health and metrics foundation', progress: 86, status: 'On track', initials: 'PA', color: 'mint', updated: 'Updated 3 days ago' },
]

const activity = [
  { type: 'deployment', title: 'Deployment monitoring is ready to connect', detail: 'Connect a provider to see release history here', time: 'Getting started', color: 'mint' },
  { type: 'task', title: 'Your workspace has been created', detail: 'CTRLSPACE is ready for your team', time: 'Just now', color: 'violet' },
  { type: 'repo', title: 'Repository activity will appear here', detail: 'Connect a GitHub repository to get started', time: 'When connected', color: 'blue' },
]

const navItems: { id: View; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'applications', label: 'Applications', icon: 'layers' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'activity', label: 'Activity', icon: 'pulse' },
]

function isAppRecord(value: unknown): value is AppRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.url !== 'string' ||
    (record.repositoryUrl !== undefined && typeof record.repositoryUrl !== 'string') ||
    (record.repositoryFullName !== undefined && typeof record.repositoryFullName !== 'string') ||
    (record.repositoryDescription !== undefined && typeof record.repositoryDescription !== 'string') ||
    (record.repositoryPrivate !== undefined && record.repositoryPrivate !== null && typeof record.repositoryPrivate !== 'boolean') ||
    (record.repositoryDefaultBranch !== undefined && typeof record.repositoryDefaultBranch !== 'string') ||
    (record.folderName !== undefined && typeof record.folderName !== 'string') ||
    typeof record.category !== 'string' ||
    (record.collection !== undefined && typeof record.collection !== 'string') ||
    typeof record.icon !== 'string' ||
    typeof record.tint !== 'string' ||
    typeof record.favorite !== 'boolean' ||
    !['online', 'degraded', 'unknown'].includes(String(record.status)) ||
    !['violet', 'blue', 'mint', 'orange'].includes(record.tint)
  ) return false

  for (const urlValue of [record.url, record.repositoryUrl ?? '']) {
    if (urlValue === '') continue
    try {
      const url = new URL(urlValue)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    } catch (error) {
      if (error instanceof TypeError) return false
      throw error
    }
  }
  return true
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
    folder: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z" /><path d="M3.5 10h17" /></>,
    pulse: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.2 1-1.5 2.6-1.5-.5a8 8 0 0 1-1.7 1l-.3 1.6h-3l-.3-1.6a8 8 0 0 1-1.7-1l-1.5.5-1.5-2.6 1.2-1a7 7 0 0 1 0-2l-1.2-1 1.5-2.6 1.5.5a8 8 0 0 1 1.7-1l.3-1.6h3l.3 1.6a8 8 0 0 1 1.7 1l1.5-.5 1.5 2.6-1.2 1a7 7 0 0 1 0 2Z" /></>,
    spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? paths.grid}
    </svg>
  )
}

function loadApps(): AppRecord[] {
  const stored = window.localStorage.getItem('ctrlspace.apps.v1')
  if (!stored) return initialApps
  try {
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every(isAppRecord)) {
      return parsed.map((app) => ({
        ...app,
        collection: app.collection ?? '',
        repositoryUrl: app.repositoryUrl ?? '',
        repositoryFullName: app.repositoryFullName ?? '',
        repositoryDescription: app.repositoryDescription ?? '',
        repositoryPrivate: app.repositoryPrivate ?? null,
        repositoryDefaultBranch: app.repositoryDefaultBranch ?? '',
        folderName: app.folderName ?? '',
      }))
    }
    console.error('Saved CTRLSPACE applications have an unexpected format.')
    return initialApps
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('Saved CTRLSPACE applications could not be parsed.', error)
      return initialApps
    }
    throw error
  }
}

function saveDirectoryHandle(appId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIRECTORY_DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DIRECTORY_STORE_NAME)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open local folder storage.'))
    request.onblocked = () => reject(new Error('Local folder storage is blocked by another open CTRLSPACE tab.'))
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(DIRECTORY_STORE_NAME, 'readwrite')
      transaction.objectStore(DIRECTORY_STORE_NAME).put(handle, appId)
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
      transaction.onerror = () => {
        database.close()
        reject(transaction.error ?? new Error('Could not save the local folder link.'))
      }
      transaction.onabort = () => {
        database.close()
        reject(transaction.error ?? new Error('Saving the local folder link was cancelled.'))
      }
    }
  })
}

function loadCollections(): string[] {
  const stored = window.localStorage.getItem('ctrlspace.collections.v1')
  if (stored === null) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return [...new Set(parsed.map((item) => item.trim()).filter(Boolean))]
    }
    console.error('Saved CTRLSPACE collections have an unexpected format.')
    return []
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('Saved CTRLSPACE collections could not be parsed.', error)
      return []
    }
    throw error
  }
}

function loadThemePreference(): ThemePreference {
  const stored = window.localStorage.getItem('ctrlspace.theme.v1')
  if (stored === null) return 'system'
  if (stored === 'system' || stored === 'light' || stored === 'dark') return stored
  console.error('Saved CTRLSPACE theme preference has an unexpected value.')
  return 'system'
}

function App() {
  const [currentView, setCurrentView] = useState<View>(() =>
    new URLSearchParams(window.location.search).get('import') === '1' ? 'applications' : 'overview',
  )
  const [themePreference, setThemePreference] = useState<ThemePreference>(loadThemePreference)
  const [apps, setApps] = useState<AppRecord[]>(loadApps)
  const [collections, setCollections] = useState<string[]>(loadCollections)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [category, setCategory] = useState('All applications')
  const [activeCollection, setActiveCollection] = useState('All collections')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [isAddOpen, setIsAddOpen] = useState(() =>
    new URLSearchParams(window.location.search).get('import') === '1',
  )
  const [isCollectionOpen, setIsCollectionOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [collectionError, setCollectionError] = useState('')
  const [collectionName, setCollectionName] = useState('')
  const [portal, setPortal] = useState('Personal')
  const [appName, setAppName] = useState('')
  const [appUrl, setAppUrl] = useState('')
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [githubConfigured, setGithubConfigured] = useState<boolean | null>(null)
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubRepositories, setGithubRepositories] = useState<GitHubRepository[]>([])
  const [githubRepositoryQuery, setGithubRepositoryQuery] = useState('')
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubError, setGithubError] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('github') !== 'error') return ''
    return params.get('reason') === 'state'
      ? 'GitHub setup could not be verified. Please start the connection again.'
      : 'GitHub did not complete the repository setup.'
  })
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [appCategory, setAppCategory] = useState('Productivity')
  const [appCollection, setAppCollection] = useState('')

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)')
    const applyTheme = () => {
      const resolvedTheme = themePreference === 'system'
        ? systemTheme.matches ? 'light' : 'dark'
        : themePreference
      document.documentElement.dataset.theme = resolvedTheme
      document.documentElement.style.colorScheme = resolvedTheme
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content',
        resolvedTheme === 'light' ? '#f5f6fa' : '#0b0c13',
      )
    }
    applyTheme()
    systemTheme.addEventListener('change', applyTheme)
    window.localStorage.setItem('ctrlspace.theme.v1', themePreference)
    return () => systemTheme.removeEventListener('change', applyTheme)
  }, [themePreference])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    const shouldImport = params.get('import') === '1'
    if (params.has('github') || params.has('import')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    async function checkGitHubStatus() {
      try {
        const response = await fetch('/api/github/status')
        const result: unknown = await response.json()
        if (!response.ok || typeof result !== 'object' || result === null) {
          throw new Error('Could not check the GitHub connection.')
        }
        const status = result as { configured?: unknown; connected?: unknown }
        if (typeof status.configured !== 'boolean' || typeof status.connected !== 'boolean') {
          throw new Error('The GitHub connection response was invalid.')
        }
        if (!active) return
        setGithubConfigured(status.configured)
        setGithubConnected(status.connected)
        if (status.connected && shouldImport) await loadGitHubRepositories()
      } catch (error) {
        if (!active) return
        console.error('GitHub connection status could not be loaded.', error)
        setGithubConfigured(null)
        setGithubError('Could not reach the CTRLSPACE server. Check that it is running and try again.')
      }
    }
    void checkGitHubStatus()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!isAddOpen && !isCollectionOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAddOpen(false)
        setIsCollectionOpen(false)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    document.getElementById(isAddOpen ? 'app-url' : 'collection-name')?.focus()
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isAddOpen, isCollectionOpen])

  const filteredApps = useMemo(() => apps.filter((app) => {
    const matchesQuery = `${app.name} ${app.category} ${app.collection} ${app.url} ${app.repositoryUrl}`.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = category === 'All applications' || app.category === category
    const matchesCollection = activeCollection === 'All collections'
      || (activeCollection === 'Unfiled' ? !app.collection : app.collection === activeCollection)
    return matchesQuery && matchesCategory && matchesCollection
  }), [apps, activeCollection, category, query])

  const categories = useMemo(() => ['All applications', ...new Set(apps.map((app) => app.category))], [apps])
  const collectionOptions = useMemo(() => [...collections, 'Unfiled'], [collections])
  const filteredGitHubRepositories = useMemo(() => githubRepositories.filter((repository) =>
    `${repository.fullName} ${repository.description ?? ''}`.toLowerCase().includes(githubRepositoryQuery.toLowerCase()),
  ), [githubRepositories, githubRepositoryQuery])

  function saveApps(nextApps: AppRecord[]) {
    window.localStorage.setItem('ctrlspace.apps.v1', JSON.stringify(nextApps))
    setApps(nextApps)
  }

  function saveCollections(nextCollections: string[]) {
    window.localStorage.setItem('ctrlspace.collections.v1', JSON.stringify(nextCollections))
    setCollections(nextCollections)
  }

  function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanName = collectionName.trim()
    if (!cleanName) {
      setCollectionError('Enter a name for this collection.')
      return
    }
    if ([...collections, 'Unfiled', 'All collections'].some((name) => name.toLowerCase() === cleanName.toLowerCase())) {
      setCollectionError('A collection with that name already exists.')
      return
    }
    saveCollections([...collections, cleanName])
    setActiveCollection(cleanName)
    setCollectionName('')
    setCollectionError('')
    setIsCollectionOpen(false)
  }

  function assignCollection(id: string, collection: string) {
    saveApps(apps.map((app) => app.id === id ? { ...app, collection: collection === 'Unfiled' ? '' : collection } : app))
  }

  async function loadGitHubRepositories() {
    setGithubError('')
    setGithubLoading(true)
    try {
      const response = await fetch('/api/github/repositories')
      const result: unknown = await response.json()
      if (!response.ok || typeof result !== 'object' || result === null || !Array.isArray((result as { repositories?: unknown }).repositories)) {
        throw new Error(typeof (result as { error?: unknown })?.error === 'string'
          ? (result as { error: string }).error
          : 'Could not load GitHub repositories.')
      }
      const repositories = (result as { repositories: unknown[] }).repositories
      if (!repositories.every(isGitHubRepository)) throw new Error('GitHub returned an invalid repository list.')
      setGithubRepositories(repositories)
      setGithubConnected(true)
    } catch (error) {
      console.error('GitHub repositories could not be loaded.', error)
      setGithubError(error instanceof Error ? error.message : 'Could not load GitHub repositories.')
    } finally {
      setGithubLoading(false)
    }
  }

  async function connectGitHub() {
    setGithubError('')
    try {
      const response = await fetch('/api/github/status')
      const status = await response.json() as { configured?: unknown; connected?: unknown }
      if (!response.ok || typeof status.configured !== 'boolean' || typeof status.connected !== 'boolean') {
        throw new Error('Could not check the GitHub connection.')
      }
      setGithubConfigured(status.configured)
      setGithubConnected(status.connected)
      if (status.connected) {
        await loadGitHubRepositories()
        return
      }
      if (!status.configured) {
        setGithubError('GitHub import needs to be configured by the CTRLSPACE administrator.')
        return
      }
    } catch (error) {
      console.error('GitHub connection could not be checked.', error)
      setGithubError(error instanceof Error ? error.message : 'Could not check the GitHub connection.')
      return
    }
    window.location.assign('/api/github/install')
  }

  async function disconnectGitHub() {
    setGithubError('')
    try {
      const response = await fetch('/api/github/disconnect', { method: 'POST' })
      const result = await response.json() as { error?: unknown }
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not disconnect GitHub.')
      setGithubConnected(false)
      setGithubRepositories([])
    } catch (error) {
      console.error('GitHub could not be disconnected.', error)
      setGithubError(error instanceof Error ? error.message : 'Could not disconnect GitHub.')
    }
  }

  async function importGitHubRepository(repository: GitHubRepository) {
    setGithubError('')
    try {
      const response = await fetch('/api/github/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId: repository.id }),
      })
      const result = await response.json() as { repository?: GitHubRepository; error?: unknown }
      if (!response.ok || !isGitHubRepository(result.repository)) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Could not import this repository.')
      }
      const imported = result.repository
      if (apps.some((app) => app.repositoryUrl.replace(/\/$/, '').toLowerCase() === imported.htmlUrl.replace(/\/$/, '').toLowerCase())) {
        setGithubError(`${imported.fullName} is already in your application library.`)
        return
      }
      const name = imported.name
      const newApp: AppRecord = {
        id: crypto.randomUUID(),
        name,
        url: '',
        repositoryUrl: imported.htmlUrl,
        repositoryFullName: imported.fullName,
        repositoryDescription: imported.description ?? '',
        repositoryPrivate: imported.isPrivate,
        repositoryDefaultBranch: imported.defaultBranch,
        folderName: '',
        category: 'Development',
        collection: appCollection,
        icon: name.charAt(0).toUpperCase(),
        tint: ['violet', 'blue', 'mint', 'orange'][apps.length % 4],
        status: 'unknown',
        favorite: false,
      }
      saveApps([newApp, ...apps])
      setAppName('')
      setAppUrl('')
      setRepositoryUrl('')
      setAppCategory('Productivity')
      setAppCollection('')
      setIsAddOpen(false)
    } catch (error) {
      console.error('GitHub repository import failed.', error)
      setGithubError(error instanceof Error ? error.message : 'Could not import this repository.')
    }
  }

  async function chooseProjectFolder() {
    setFormError('')
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker
    if (!picker) {
      setFormError('Local folder linking is unavailable in this browser. Try a recent version of Chrome or Edge.')
      return
    }
    try {
      setDirectoryHandle(await picker({ mode: 'read' }))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('The selected local folder could not be accessed.', error)
      setFormError('The selected folder could not be accessed. Check browser permissions and try again.')
    }
  }

  async function addApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    const cleanUrlInput = appUrl.trim()
    const cleanRepositoryInput = repositoryUrl.trim()
    if (!cleanUrlInput && !cleanRepositoryInput && !directoryHandle) {
      setFormError('Add a website URL, Git repository, or local folder to continue.')
      return
    }

    let parsedUrl: URL | null = null
    if (cleanUrlInput) {
      try {
        parsedUrl = new URL(cleanUrlInput)
      } catch {
        setFormError('Enter a complete website address, including https://.')
        return
      }
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        setFormError('Only http:// and https:// website addresses are supported.')
        return
      }
    }
    let parsedRepositoryUrl: URL | null = null
    if (cleanRepositoryInput) {
      try {
        parsedRepositoryUrl = new URL(cleanRepositoryInput)
      } catch {
        setFormError('Enter a complete repository URL, including https://.')
        return
      }
      if (parsedRepositoryUrl.protocol !== 'https:' && parsedRepositoryUrl.protocol !== 'http:') {
        setFormError('Repository links must use http:// or https://.')
        return
      }
    }
    const appId = crypto.randomUUID()
    if (directoryHandle) {
      try {
        await saveDirectoryHandle(appId, directoryHandle)
      } catch (error) {
        console.error('The local folder link could not be saved.', error)
        setFormError('Could not save the folder permission in this browser. Try selecting the folder again.')
        return
      }
    }
    const cleanUrl = parsedUrl?.toString() ?? ''
    const cleanRepositoryUrl = parsedRepositoryUrl?.toString() ?? ''
    const generatedName = parsedUrl?.hostname.replace(/^www\./, '')
      || parsedRepositoryUrl?.pathname.split('/').filter(Boolean).pop()?.replace(/\.git$/, '')
      || directoryHandle?.name
      || 'New application'
    const displayName = appName.trim() || generatedName
    const newApp: AppRecord = {
      id: appId,
      name: displayName,
      url: cleanUrl,
      repositoryUrl: cleanRepositoryUrl,
      repositoryFullName: '',
      repositoryDescription: '',
      repositoryPrivate: null,
      repositoryDefaultBranch: '',
      folderName: directoryHandle?.name ?? '',
      category: appCategory,
      collection: appCollection,
      icon: displayName.charAt(0).toUpperCase(),
      tint: ['violet', 'blue', 'mint', 'orange'][apps.length % 4],
      status: 'unknown',
      favorite: false,
    }
    saveApps([newApp, ...apps])
    setAppName('')
    setAppUrl('')
    setRepositoryUrl('')
    setDirectoryHandle(null)
    setAppCategory('Productivity')
    setAppCollection('')
    setIsAddOpen(false)
  }

  function toggleFavorite(id: string) {
    saveApps(apps.map((app) => app.id === id ? { ...app, favorite: !app.favorite } : app))
  }

  const pageTitle = {
    overview: 'Overview',
    applications: 'Applications',
    projects: 'Projects',
    activity: 'Activity',
  }[currentView]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setCurrentView('overview') }} aria-label="CTRLSPACE home">
          <img className="brand-logo" src="/ctrlspace-mark.png" alt="" />
          <span className="brand-name">CTRL<span>SPACE</span></span>
        </a>

        <div className="workspace-switcher">
          <div className="workspace-avatar">P</div>
          <div className="workspace-copy"><strong>P-typed</strong><span>Workspace</span></div>
          <span className="switch-chevron"><Icon name="chevron" size={15} /></span>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button key={item.id} className={`nav-item ${currentView === item.id ? 'active' : ''}`} onClick={() => setCurrentView(item.id)} aria-label={item.label} aria-current={currentView === item.id ? 'page' : undefined}>
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
              {item.id === 'applications' && <span className="nav-count">{apps.length}</span>}
            </button>
          ))}
        </nav>

        <div className="nav-label portal-label">PORTALS</div>
        <div className="portal-nav" aria-label="Portal selector">
          {['Personal', 'Business', 'Developer'].map((item, index) => (
            <button key={item} className={`portal-item ${portal === item ? 'selected' : ''}`} onClick={() => setPortal(item)}>
              <span className={`portal-dot portal-dot-${index}`} />
              {item}
              {portal === item && <span className="portal-current">CURRENT</span>}
            </button>
          ))}
          <button className="portal-item" disabled title="Platform administration is planned for a later phase">
            <span className="portal-dot" />
            Platform admin
            <span className="portal-current">PLANNED</span>
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="storage-card">
            <div className="storage-head"><span>Workspace setup</span><span>1/4</span></div>
            <div className="storage-bar"><span /></div>
            <p>Connect your tools to unlock the full picture.</p>
            <button onClick={() => setCurrentView('applications')}>Continue setup <Icon name="arrow" size={14} /></button>
          </div>
          <button className="nav-item settings-link" disabled title="Settings are planned for a later phase"><Icon name="settings" size={17} /><span>Settings</span></button>
          <div className="profile">
            <div className="profile-avatar">CK</div>
            <div className="profile-copy"><strong>Clara K.</strong><span>Workspace admin</span></div>
            <button className="profile-more" aria-label="Profile options">•••</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <div className={`search-box ${searchOpen ? 'search-open' : ''}`}>
                <button type="button" className="search-toggle" aria-label={searchOpen ? 'Close search' : 'Open search'} onClick={() => {
                  setSearchOpen((open) => !open)
                  if (!searchOpen) window.setTimeout(() => document.getElementById('global-search')?.focus(), 0)
                }}><Icon name="search" size={16} /></button>
                <input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." aria-label="Search applications and projects" />
                <kbd>⌘ K</kbd>
            </div>
            <div className="theme-control" role="group" aria-label="Theme preference">
              {(['system', 'light', 'dark'] as const).map((preference) => (
                <button
                  key={preference}
                  type="button"
                  className={themePreference === preference ? 'theme-choice active' : 'theme-choice'}
                  onClick={() => setThemePreference(preference)}
                  aria-pressed={themePreference === preference}
                  aria-label={`${preference[0].toUpperCase()}${preference.slice(1)} theme`}
                >
                  {preference === 'system' ? 'System' : preference[0].toUpperCase() + preference.slice(1)}
                </button>
              ))}
            </div>
            <button className="icon-button notification-button" aria-label="Notifications are not available in this preview" disabled><Icon name="bell" size={18} /></button>
            <div className="topbar-avatar">CK</div>
          </div>
        </header>

        <div className="page-content">
          {currentView === 'overview' && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" /> WEDNESDAY, OCTOBER 21, 2026</div>
                  <h1>Good morning, Clara <span className="wave">✳</span></h1>
                  <p className="welcome-subtitle">Your digital workspace, all in one place.</p>
                </div>
                <button className="primary-button" onClick={() => setIsAddOpen(true)}><Icon name="plus" size={17} /> Add application</button>
              </section>

              <div className="preview-notice"><span>PREVIEW DATA</span><p>Projects, activity, and health are examples; applications you add are saved locally in this browser.</p></div>

              <section className="metrics-grid" aria-label="Workspace summary">
                <Metric icon="layers" label="Applications" value={String(apps.length).padStart(2, '0')} trend="in your workspace" tone="violet" />
                <Metric icon="folder" label="Example projects" value="03" trend="sample workspace data" tone="blue" />
                <Metric icon="pulse" label="Connected integrations" value="00" trend="not connected in preview" tone="mint" />
                <Metric icon="clock" label="Monitoring checks" value="00" trend="not configured" tone="orange" />
              </section>

              <section className="overview-grid">
                <div className="panel health-panel">
                  <div className="panel-heading">
                    <div><div className="section-kicker">SYSTEM PULSE</div><h2>Workspace health</h2></div>
                    <span className="status-pill status-pending"><span /> Awaiting integrations</span>
                  </div>
                  <div className="health-summary">
                    <div className="health-value">Not connected<span>Live status appears when monitoring is connected</span></div>
                    <div className="health-art" aria-hidden="true">
                      {['API', 'WEB', 'DB', 'CI'].map((module, index) => (
                        <div className={`health-module module-${index}`} key={module}>
                          <span>{module}</span><i />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="health-foot">
                    <div className="health-key"><span className="key-dot muted-dot" /><div><strong>Availability</strong><span>No checks configured</span></div></div>
                    <div className="health-key"><span className="key-dot muted-dot" /><div><strong>Response time</strong><span>Connect a health check</span></div></div>
                    <button className="text-button" onClick={() => setCurrentView('applications')}>Set up monitoring <Icon name="arrow" size={14} /></button>
                  </div>
                </div>

                <div className="panel activity-panel">
                  <div className="panel-heading">
                    <div><div className="section-kicker">LATEST UPDATES</div><h2>Activity</h2></div>
                    <button className="more-button" aria-label="More activity options" disabled>•••</button>
                  </div>
                  <div className="activity-list">
                    {activity.slice(0, 3).map((item) => (
                      <div className="activity-item" key={item.title}>
                        <div className={`activity-icon ${item.color}`}><Icon name={item.type === 'deployment' ? 'pulse' : item.type === 'task' ? 'spark' : 'layers'} size={15} /></div>
                        <div className="activity-copy"><strong>{item.title}</strong><span>{item.detail}</span></div>
                        <time>{item.time}</time>
                      </div>
                    ))}
                  </div>
                  <button className="panel-footer-link" onClick={() => setCurrentView('activity')}>View activity log <Icon name="arrow" size={14} /></button>
                </div>
              </section>

              <section className="section-block">
                <div className="section-heading">
                  <div><div className="section-kicker">EXAMPLE PROJECTS</div><h2>Projects <span className="subtle-count">03</span></h2></div>
                  <button className="text-button" onClick={() => setCurrentView('projects')}>All projects <Icon name="arrow" size={14} /></button>
                </div>
                <div className="project-grid">
                  {projects.map((project) => <ProjectCard key={project.name} project={project} />)}
                </div>
              </section>

              <section className="section-block apps-block">
                <div className="section-heading">
                  <div><div className="section-kicker">QUICK ACCESS</div><h2>Applications <span className="subtle-count">{String(apps.length).padStart(2, '0')}</span></h2></div>
                  <div className="section-actions">
                    <button className="text-button" onClick={() => setCurrentView('applications')}>Browse library <Icon name="arrow" size={14} /></button>
                    <button className="small-add-button" onClick={() => setIsAddOpen(true)} aria-label="Add application"><Icon name="plus" size={16} /></button>
                  </div>
                </div>
                <div className="app-grid">
                  {apps.slice(0, 4).map((app) => <ApplicationCard key={app.id} app={app} collections={collectionOptions} onFavorite={toggleFavorite} onCollectionChange={assignCollection} />)}
                  <button className="add-card" onClick={() => setIsAddOpen(true)}><span className="add-card-icon"><Icon name="plus" size={19} /></span><strong>Add an application</strong><span>Bring your tools together</span></button>
                </div>
              </section>
              <footer className="page-footer"><span>CTRLSPACE <span className="footer-divider">/</span> YOUR DIGITAL OPERATIONS HUB</span><span>Workspace data is stored on this device</span></footer>
            </>
          )}

          {currentView === 'applications' && (
            <>
              <section className="welcome-row compact-welcome">
                <div><div className="eyebrow"><span className="eyebrow-line" /> RESOURCE LIBRARY</div><h1>Applications</h1><p className="welcome-subtitle">Your team's tools and websites, organized in one place.</p></div>
                <button className="primary-button" onClick={() => setIsAddOpen(true)}><Icon name="plus" size={17} /> Add application</button>
              </section>
              <div className="library-toolbar">
                <div className="filter-tabs" role="tablist" aria-label="Filter by category">
                  {categories.map((item) => <button key={item} className={category === item ? 'filter-tab active' : 'filter-tab'} onClick={() => setCategory(item)}>{item}</button>)}
                </div>
                <div className="library-actions">
                  <label className="collection-filter-label">
                    <span>Collection</span>
                    <select className="collection-filter" value={activeCollection} onChange={(event) => setActiveCollection(event.target.value)} aria-label="Filter by collection">
                      <option>All collections</option>
                      {collections.map((item) => <option key={item}>{item}</option>)}
                      <option>Unfiled</option>
                    </select>
                  </label>
                  <button className="outline-button collection-create-button" onClick={() => { setCollectionError(''); setIsCollectionOpen(true) }}>
                    <Icon name="plus" size={14} /> New collection
                  </button>
                  <div className="view-toggle" aria-label="Application layout">
                    <button className={layout === 'grid' ? 'selected' : ''} onClick={() => setLayout('grid')} aria-label="Grid view"><Icon name="grid" size={16} /></button>
                    <button className={layout === 'list' ? 'selected' : ''} onClick={() => setLayout('list')} aria-label="List view"><Icon name="layers" size={16} /></button>
                  </div>
                </div>
              </div>
              {filteredApps.length > 0 ? <div className={`app-grid library-grid ${layout === 'list' ? 'list-layout' : ''}`}>{filteredApps.map((app) => <ApplicationCard key={app.id} app={app} collections={collectionOptions} onFavorite={toggleFavorite} onCollectionChange={assignCollection} />)}</div> : <div className="empty-state"><span><Icon name="search" size={22} /></span><h3>No applications found</h3><p>Try another search or add a new application to your library.</p><button className="primary-button" onClick={() => setIsAddOpen(true)}><Icon name="plus" size={16} /> Add application</button></div>}
              <footer className="page-footer"><span>{filteredApps.length} OF {apps.length} APPLICATIONS</span><span>Local workspace · Integrations not connected</span></footer>
            </>
          )}

          {currentView === 'projects' && (
            <>
              <section className="welcome-row compact-welcome">
                <div><div className="eyebrow"><span className="eyebrow-line" /> TEAM DELIVERY</div><h1>Projects</h1><p className="welcome-subtitle">A shared view of the work your teams are moving forward.</p></div>
                <button className="outline-button" disabled title="Project creation is planned for a later phase"><Icon name="plus" size={17} /> Project setup planned</button>
              </section>
              <div className="preview-notice"><span>EXAMPLE PROJECTS</span><p>These sample cards are illustrative and are not connected to a project database.</p></div>
              <div className="project-grid project-library">{projects.map((project) => <ProjectCard key={project.name} project={project} />)}</div>
              <div className="integration-note"><span className="note-icon"><Icon name="spark" size={17} /></span><div><strong>Connect your repositories</strong><p>Link GitHub to bring commits, pull requests, builds, and deployment updates into each project.</p></div>              <span className="text-button planned-link">Developer integrations planned <Icon name="arrow" size={14} /></span></div>
            </>
          )}

          {currentView === 'activity' && (
            <>
              <section className="welcome-row compact-welcome">
                <div><div className="eyebrow"><span className="eyebrow-line" /> WORKSPACE TIMELINE</div><h1>Activity</h1><p className="welcome-subtitle">A running history of meaningful changes across your workspace.</p></div>
                <button className="outline-button"><Icon name="clock" size={16} /> All time <Icon name="chevron" size={14} /></button>
              </section>
              <div className="preview-notice"><span>EXAMPLE ACTIVITY</span><p>This timeline is a placeholder until your workspace is connected to project and deployment data.</p></div>
              <div className="panel timeline-panel">
                <div className="timeline-date">TODAY <span>OCT 21</span></div>
                {activity.map((item) => <div className="timeline-item" key={item.title}><div className={`activity-icon ${item.color}`}><Icon name={item.type === 'deployment' ? 'pulse' : item.type === 'task' ? 'spark' : 'layers'} size={15} /></div><div className="timeline-copy"><strong>{item.title}</strong><p>{item.detail}</p></div><time>{item.time}</time></div>)}
                <div className="timeline-empty"><span>More activity will appear here as your workspace grows.</span></div>
              </div>
            </>
          )}
        </div>
      </main>

      {isAddOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsAddOpen(false) }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-heading"><div><div className="section-kicker">RESOURCE LIBRARY</div><h2 id="modal-title">Add an application</h2></div><button className="icon-button" onClick={() => setIsAddOpen(false)} aria-label="Close dialog"><Icon name="close" size={19} /></button></div>
            <p className="modal-intro">Add a website, Git repository, or a folder from this device. You can combine sources; nothing in a local folder is uploaded.</p>
            <section className="github-import-section" aria-label="Import a GitHub repository">
              <div className="github-import-heading">
                <div><strong>Import from GitHub</strong><p>Choose a repository installed for CTRLSPACE.</p></div>
                <div className="github-import-actions">
                  {githubConnected && <button type="button" className="github-disconnect-button" onClick={disconnectGitHub}>Disconnect</button>}
                  <button type="button" className="outline-button" onClick={githubConnected ? loadGitHubRepositories : connectGitHub} disabled={githubLoading}>
                    {githubLoading ? 'Loading…' : githubConnected ? 'Refresh' : 'Connect GitHub'}
                  </button>
                </div>
              </div>
              {githubConfigured === false && <p className="github-setup-hint">GitHub import is not configured yet. The CTRLSPACE administrator must set up the GitHub App on the server.</p>}
              {githubError && <p className="form-error" role="alert">{githubError}</p>}
              {githubConnected && (
                <div className="github-repository-picker">
                  <label className="visually-hidden" htmlFor="github-repository-search">Filter GitHub repositories</label>
                  <input id="github-repository-search" className="form-input" type="search" placeholder="Filter repositories…" value={githubRepositoryQuery} onChange={(event) => setGithubRepositoryQuery(event.target.value)} />
                  {githubLoading ? <p className="github-picker-message">Loading repositories…</p>
                    : filteredGitHubRepositories.length > 0
                      ? <ul className="github-repository-list">
                          {filteredGitHubRepositories.map((repository) => (
                            <li key={repository.id}>
                              <div className="github-repository-copy">
                                <strong>{repository.fullName}</strong>
                                <span>{repository.description || (repository.isPrivate ? 'Private repository' : 'Public repository')}</span>
                              </div>
                              <button type="button" className="text-button" onClick={() => importGitHubRepository(repository)}>Import</button>
                            </li>
                          ))}
                        </ul>
                      : <p className="github-picker-message">{githubRepositories.length ? 'No repositories match your filter.' : 'No repositories are available. Install CTRLSPACE on a GitHub account and select repositories to import.'}</p>}
                </div>
              )}
            </section>
            <form onSubmit={addApplication}>
              <label className="form-label" htmlFor="app-url">Website URL <span>OPTIONAL</span></label>
              <input id="app-url" className="form-input" type="url" placeholder="https://example.com" value={appUrl} onChange={(event) => setAppUrl(event.target.value)} />
              <label className="form-label" htmlFor="repository-url">Git repository URL <span>OPTIONAL</span></label>
              <input id="repository-url" className="form-input" type="url" placeholder="https://github.com/company/project" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} />
              <label className="form-label">Local project folder <span>OPTIONAL</span></label>
              <div className="folder-picker-row">
                <button type="button" className="outline-button" onClick={chooseProjectFolder}>
                  <Icon name="folder" size={15} /> {directoryHandle ? 'Change folder' : 'Choose folder'}
                </button>
                <span className="selected-folder" title={directoryHandle?.name}>{directoryHandle?.name ?? 'No folder selected'}</span>
              </div>
              <p className="folder-permission-note">Choose an existing local project folder to link it. Files stay on this device and are not copied or uploaded.</p>
              <label className="form-label" htmlFor="app-name">Display name <span>OPTIONAL</span></label>
              <input id="app-name" className="form-input" type="text" placeholder="e.g. Research dashboard" value={appName} onChange={(event) => setAppName(event.target.value)} maxLength={60} />
              <label className="form-label" htmlFor="app-category">Category</label>
              <select id="app-category" className="form-input" value={appCategory} onChange={(event) => setAppCategory(event.target.value)}>
                <option>Productivity</option><option>Development</option><option>Design</option><option>Documentation</option><option>Monitoring</option><option>Research</option><option>Other</option>
              </select>
              <label className="form-label" htmlFor="app-collection">Collection</label>
              <select id="app-collection" className="form-input" value={appCollection} onChange={(event) => setAppCollection(event.target.value)}>
                <option value="">Unfiled</option>
                {collections.map((item) => <option key={item}>{item}</option>)}
              </select>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setIsAddOpen(false)}>Cancel</button><button type="submit" className="primary-button"><Icon name="plus" size={16} /> Add to library</button></div>
            </form>
            <div className="modal-footnote"><Icon name="check" size={14} /> Saved locally on this device</div>
          </section>
        </div>
      )}

      {isCollectionOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCollectionOpen(false) }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="collection-modal-title">
            <div className="modal-heading">
              <div><div className="section-kicker">APPLICATION LIBRARY</div><h2 id="collection-modal-title">Create a collection</h2></div>
              <button className="icon-button" onClick={() => setIsCollectionOpen(false)} aria-label="Close dialog"><Icon name="close" size={19} /></button>
            </div>
            <p className="modal-intro">Group related applications together. You can assign apps from their cards or while adding them.</p>
            <form onSubmit={createCollection}>
              <label className="form-label" htmlFor="collection-name">Collection name</label>
              <input id="collection-name" className="form-input" type="text" value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="e.g. Design tools" maxLength={40} required />
              {collectionError && <p className="form-error" role="alert">{collectionError}</p>}
              <div className="modal-actions">
                <button type="button" className="outline-button" onClick={() => setIsCollectionOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button"><Icon name="plus" size={16} /> Create collection</button>
              </div>
            </form>
            <div className="modal-footnote"><Icon name="check" size={14} /> Saved locally on this device</div>
          </section>
        </div>
      )}
    </div>
  )
}

function Metric({ icon, label, value, trend, tone }: { icon: string; label: string; value: string; trend: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon name={icon} size={17} /></div><div className="metric-label">{label}</div><div className="metric-bottom"><strong>{value}</strong><span>{trend}</span></div></article>
}

function ApplicationCard({ app, collections, onFavorite, onCollectionChange }: {
  app: AppRecord
  collections: string[]
  onFavorite: (id: string) => void
  onCollectionChange: (id: string, collection: string) => void
}) {
  const [faviconAvailable, setFaviconAvailable] = useState(Boolean(app.url))
  const faviconUrl = app.url ? `${new URL(app.url).origin}/favicon.ico` : ''

  return (
    <article className="application-card">
      <div className="application-card-top">
        <div className={`application-icon ${app.tint}`}>
          {faviconAvailable ? <img src={faviconUrl} alt="" onError={() => setFaviconAvailable(false)} /> : app.icon}
        </div>
        <div className="application-card-actions">
          <select className="application-collection-select" value={app.collection || 'Unfiled'} onChange={(event) => onCollectionChange(app.id, event.target.value)} aria-label={`Move ${app.name} to a collection`}>
            {collections.map((collection) => <option key={collection}>{collection}</option>)}
          </select>
          <button className={`favorite-button ${app.favorite ? 'is-favorite' : ''}`} onClick={() => onFavorite(app.id)} aria-label={app.favorite ? `Unpin ${app.name}` : `Pin ${app.name}`}><Icon name="star" size={16} /></button>
        </div>
      </div>
      <div className="application-title-row"><h3>{app.name}</h3><span className={`tiny-status ${app.status}`} title={app.status === 'unknown' ? 'Status unknown until monitoring is connected' : app.status} /></div>
      <div className="application-meta"><span>{app.category}</span><span className="meta-separator">·</span><span title={app.repositoryDescription}>{app.url ? new URL(app.url).hostname : app.repositoryFullName || (app.repositoryUrl ? new URL(app.repositoryUrl).hostname : app.folderName || 'No source connected')}</span></div>
      <div className="application-card-footer">
        <span className={`app-status-text ${app.status}`}>{app.status === 'unknown' ? 'STATUS UNKNOWN' : app.status.toUpperCase()}</span>
        <div className="application-launch-actions">
          {app.folderName && <span className="local-folder-badge" title={`Folder linked on this device: ${app.folderName}`}>LOCAL FOLDER</span>}
          {app.repositoryUrl && <a href={app.repositoryUrl} target="_blank" rel="noreferrer" className="launch-button" aria-label={`Open ${app.name} repository`} title="Open repository"><Icon name="layers" size={15} /></a>}
          {app.url ? <a href={app.url} target="_blank" rel="noreferrer" className="launch-button" aria-label={`Open ${app.name}`} title="Open website"><Icon name="external" size={15} /></a> : !app.repositoryUrl && !app.folderName && <span className="launch-disabled" title="Add a website URL to launch this application"><Icon name="external" size={15} /></span>}
        </div>
      </div>
    </article>
  )
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="project-card">
      <div className="project-card-header"><div className={`project-avatar ${project.color}`}>{project.initials}</div>      <button className="more-button" aria-label={`More options for ${project.name}`} disabled>•••</button></div>
      <div className="project-card-title"><h3>{project.name}</h3><span className="project-status"><i />{project.status}</span></div>
      <p className="project-description">{project.description}</p>
      <div className="progress-heading"><span>Project progress</span><strong>{project.progress}%</strong></div>
      <div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div>
      <div className="project-card-footer"><span className="project-members"><i>CK</i><i>JM</i><i>+2</i></span><span>{project.updated}</span></div>
    </article>
  )
}

export default App
