import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigStatus, workspaceStorageKey } from './supabase'
import './App.css'

type AppStatus = 'online' | 'offline' | 'degraded' | 'unknown'
function isAppStatus(value: unknown): value is AppStatus {
  return ['online', 'offline', 'degraded', 'unknown'].includes(String(value))
}

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
  lastCheckedAt?: string
  lastOpenedAt?: string
  responseTimeMs?: number
  statusDetail?: string
}
type Project = {
  id: string
  name: string
  description: string
  color: string
  tasks: ProjectTask[]
  bugs: ProjectBug[]
}
type ProjectTask = {
  id: string
  title: string
  description: string
  assignee: string
  status: 'todo' | 'in-progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  startDate: string
  dueDate: string
}
type BugSeverity = 'low' | 'medium' | 'high' | 'critical'
type BugStatus = 'open' | 'in-progress' | 'resolved'
const bugCategories = ['functionality', 'interface', 'performance', 'security', 'data', 'compatibility', 'other'] as const
type BugCategory = typeof bugCategories[number]
type ProjectBug = {
  id: string
  title: string
  description: string
  category: BugCategory
  severity: BugSeverity
  status: BugStatus
  assignee: string
  relatedUrl: string
  reminderDate: string
  createdAt: string
  updatedAt: string
}
type ActivityCategory = 'application' | 'project' | 'task' | 'bug'
type WorkspaceActivity = {
  id: string
  category: ActivityCategory
  title: string
  detail: string
  createdAt: string
}
type View = 'overview' | 'applications' | 'projects' | 'activity' | 'settings'
type ThemePreference = 'system' | 'light' | 'dark'
type AccentPreference = 'nebula' | 'cyber' | 'matrix' | 'arctic' | 'ember' | 'synthwave'
type FontPreference = 'system' | 'code' | 'terminal'
const accentPalettes: { id: AccentPreference; name: string; color: string }[] = [
  { id: 'nebula', name: 'Nebula violet', color: '#a58aff' },
  { id: 'cyber', name: 'Cyber cyan', color: '#32d9ff' },
  { id: 'matrix', name: 'Matrix green', color: '#6ee787' },
  { id: 'arctic', name: 'Arctic blue', color: '#62a6ff' },
  { id: 'ember', name: 'Solar ember', color: '#ff9e64' },
  { id: 'synthwave', name: 'Synthwave pink', color: '#ff68c8' },
]
type SearchResult = {
  id: string
  type: 'application' | 'project' | 'task' | 'bug'
  title: string
  detail: string
  projectId?: string
}
type WorkspaceNotification = {
  id: string
  type: 'task' | 'bug' | 'health'
  title: string
  detail: string
  projectId?: string
  appId?: string
}
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
type PermissionedDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (options: { mode: 'read' }) => Promise<PermissionState>
  requestPermission: (options: { mode: 'read' }) => Promise<PermissionState>
}
type LocalFolderEntry = { name: string; kind: 'directory' | 'file' }

const DIRECTORY_DB_NAME = 'ctrlspace-local-folders'
const DIRECTORY_STORE_NAME = 'app-folders'

const initialApps: AppRecord[] = [
  { id: 'app-1', name: 'Ops Workspace', url: '', repositoryUrl: '', repositoryFullName: '', repositoryDescription: '', repositoryPrivate: null, repositoryDefaultBranch: '', folderName: '', category: 'Productivity', collection: '', icon: 'O', tint: 'violet', status: 'unknown', favorite: true },
  { id: 'app-2', name: 'Signal Studio', url: '', repositoryUrl: '', repositoryFullName: '', repositoryDescription: '', repositoryPrivate: null, repositoryDefaultBranch: '', folderName: '', category: 'Design', collection: '', icon: 'S', tint: 'blue', status: 'unknown', favorite: true },
  { id: 'app-3', name: 'Northstar Docs', url: '', repositoryUrl: '', repositoryFullName: '', repositoryDescription: '', repositoryPrivate: null, repositoryDefaultBranch: '', folderName: '', category: 'Documentation', collection: '', icon: 'N', tint: 'mint', status: 'unknown', favorite: false },
  { id: 'app-4', name: 'Pulse Monitor', url: '', repositoryUrl: '', repositoryFullName: '', repositoryDescription: '', repositoryPrivate: null, repositoryDefaultBranch: '', folderName: '', category: 'Monitoring', collection: '', icon: 'P', tint: 'orange', status: 'unknown', favorite: false },
]

const projectColors = ['violet', 'blue', 'mint']

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
    (record.lastCheckedAt !== undefined && (typeof record.lastCheckedAt !== 'string' || Number.isNaN(Date.parse(record.lastCheckedAt)))) ||
    (record.lastOpenedAt !== undefined && (typeof record.lastOpenedAt !== 'string' || Number.isNaN(Date.parse(record.lastOpenedAt)))) ||
    (record.responseTimeMs !== undefined && (typeof record.responseTimeMs !== 'number' || !Number.isFinite(record.responseTimeMs) || record.responseTimeMs < 0)) ||
    (record.statusDetail !== undefined && typeof record.statusDetail !== 'string') ||
    !['online', 'offline', 'degraded', 'unknown'].includes(String(record.status)) ||
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
    trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="m5 7 1 13h12l1-13M9 7V4h6v3" /></>,
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

function loadApps(storageKey = 'ctrlspace.apps.v1'): AppRecord[] {
  const stored = window.localStorage.getItem(storageKey)
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

function isDirectoryHandle(value: unknown): value is PermissionedDirectoryHandle {
  if (typeof value !== 'object' || value === null) return false
  const handle = value as { kind?: unknown; name?: unknown; values?: unknown; queryPermission?: unknown; requestPermission?: unknown }
  return handle.kind === 'directory'
    && typeof handle.name === 'string'
    && typeof handle.values === 'function'
    && typeof handle.queryPermission === 'function'
    && typeof handle.requestPermission === 'function'
}

function loadDirectoryHandle(appId: string): Promise<PermissionedDirectoryHandle | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIRECTORY_DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
        request.result.createObjectStore(DIRECTORY_STORE_NAME)
      }
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open local folder storage.'))
    request.onblocked = () => reject(new Error('Local folder storage is blocked by another open CTRLSPACE tab.'))
    request.onsuccess = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
        database.close()
        resolve(null)
        return
      }
      const transaction = database.transaction(DIRECTORY_STORE_NAME, 'readonly')
      const lookup = transaction.objectStore(DIRECTORY_STORE_NAME).get(appId)
      lookup.onerror = () => {
        database.close()
        reject(lookup.error ?? new Error('Could not retrieve the local folder link.'))
      }
      lookup.onsuccess = () => {
        const value: unknown = lookup.result
        database.close()
        if (value === undefined) resolve(null)
        else if (isDirectoryHandle(value)) resolve(value)
        else reject(new Error('The saved local folder link is invalid.'))
      }
    }
  })
}

function deleteDirectoryHandle(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIRECTORY_DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DIRECTORY_STORE_NAME)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open local folder storage.'))
    request.onblocked = () => reject(new Error('Local folder storage is blocked by another open CTRLSPACE tab.'))
    request.onsuccess = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
        database.close()
        resolve()
        return
      }
      const transaction = database.transaction(DIRECTORY_STORE_NAME, 'readwrite')
      transaction.objectStore(DIRECTORY_STORE_NAME).delete(appId)
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
      transaction.onerror = () => {
        database.close()
        reject(transaction.error ?? new Error('Could not remove the local folder link.'))
      }
      transaction.onabort = () => {
        database.close()
        reject(transaction.error ?? new Error('Removing the local folder link was cancelled.'))
      }
    }
  })
}

function loadCollections(storageKey = 'ctrlspace.collections.v1'): string[] {
  const stored = window.localStorage.getItem(storageKey)
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

function isProjectTask(value: unknown): value is ProjectTask {
  if (typeof value !== 'object' || value === null) return false
  const task = value as Record<string, unknown>
  return typeof task.id === 'string'
    && typeof task.title === 'string'
    && (task.description === undefined || typeof task.description === 'string')
    && (task.assignee === undefined || typeof task.assignee === 'string')
    && ['todo', 'in-progress', 'done'].includes(String(task.status))
    && ['low', 'medium', 'high'].includes(String(task.priority))
    && (task.startDate === undefined || typeof task.startDate === 'string')
    && typeof task.dueDate === 'string'
}

function isBugCategory(value: unknown): value is BugCategory {
  return typeof value === 'string' && bugCategories.some((category) => category === value)
}

function isSafeBugReferenceUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isProjectBug(value: unknown): value is ProjectBug {
  if (typeof value !== 'object' || value === null) return false
  const bug = value as Record<string, unknown>
  return typeof bug.id === 'string'
    && typeof bug.title === 'string'
    && typeof bug.description === 'string'
    && (bug.category === undefined || isBugCategory(bug.category))
    && ['low', 'medium', 'high', 'critical'].includes(String(bug.severity))
    && ['open', 'in-progress', 'resolved'].includes(String(bug.status))
    && (bug.assignee === undefined || typeof bug.assignee === 'string')
    && (bug.relatedUrl === undefined || isSafeBugReferenceUrl(bug.relatedUrl))
    && (bug.reminderDate === undefined || typeof bug.reminderDate === 'string' && (bug.reminderDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(bug.reminderDate)))
    && typeof bug.createdAt === 'string'
    && !Number.isNaN(Date.parse(bug.createdAt))
    && typeof bug.updatedAt === 'string'
    && !Number.isNaN(Date.parse(bug.updatedAt))
}

function isProject(value: unknown): value is Project {
  if (typeof value !== 'object' || value === null) return false
  const project = value as Record<string, unknown>
  return typeof project.id === 'string'
    && typeof project.name === 'string'
    && typeof project.description === 'string'
    && typeof project.color === 'string'
    && projectColors.includes(project.color)
    && Array.isArray(project.tasks)
    && project.tasks.every(isProjectTask)
    && (project.bugs === undefined || (Array.isArray(project.bugs) && project.bugs.every(isProjectBug)))
}

function loadProjects(storageKey = 'ctrlspace.projects.v1'): Project[] {
  const stored = window.localStorage.getItem(storageKey)
  if (stored === null) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every(isProject)) {
      return parsed.map((project) => ({
        ...project,
        tasks: project.tasks.map((task) => ({ ...task, description: task.description ?? '', assignee: task.assignee ?? '', startDate: task.startDate ?? '' })),
        bugs: (project.bugs ?? []).map((bug) => ({ ...bug, category: bug.category ?? 'other', assignee: bug.assignee ?? '', relatedUrl: bug.relatedUrl ?? '', reminderDate: bug.reminderDate ?? '' })),
      }))
    }
    console.error('Saved CTRLSPACE projects have an unexpected format.')
    return []
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('Saved CTRLSPACE projects could not be parsed.', error)
      return []
    }
    throw error
  }
}

function isWorkspaceActivity(value: unknown): value is WorkspaceActivity {
  if (typeof value !== 'object' || value === null) return false
  const activity = value as Record<string, unknown>
  return typeof activity.id === 'string'
    && ['application', 'project', 'task', 'bug'].includes(String(activity.category))
    && typeof activity.title === 'string'
    && typeof activity.detail === 'string'
    && typeof activity.createdAt === 'string'
    && !Number.isNaN(Date.parse(activity.createdAt))
}

function loadActivity(storageKey = 'ctrlspace.activity.v1'): WorkspaceActivity[] {
  const stored = window.localStorage.getItem(storageKey)
  if (stored === null) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every(isWorkspaceActivity)) return parsed.slice(0, 100)
    console.error('Saved CTRLSPACE activity has an unexpected format.')
    return []
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('Saved CTRLSPACE activity could not be parsed.', error)
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

function loadFontPreference(): FontPreference {
  const stored = window.localStorage.getItem('ctrlspace.font.v1')
  if (stored === 'system' || stored === 'code' || stored === 'terminal') return stored
  if (stored !== null) console.error('Saved CTRLSPACE font preference has an unexpected value.')
  return 'system'
}

function loadAccentPreference(): AccentPreference {
  const stored = window.localStorage.getItem('ctrlspace.accent.v1')
  const savedPalette = accentPalettes.find((palette) => palette.id === stored)
  if (savedPalette) return savedPalette.id
  if (stored !== null) console.error('Saved CTRLSPACE color scheme has an unexpected value.')
  return 'nebula'
}

function loadLocalDisplayName() {
  const stored = window.localStorage.getItem('ctrlspace.display-name.v1')?.trim()
  return stored ? stored.slice(0, 60) : 'Clara K.'
}

function App() {
  const [currentView, setCurrentView] = useState<View>(() =>
    new URLSearchParams(window.location.search).get('import') === '1' ? 'applications' : 'overview',
  )
  const [themePreference, setThemePreference] = useState<ThemePreference>(loadThemePreference)
  const [accentPreference, setAccentPreference] = useState<AccentPreference>(loadAccentPreference)
  const [fontPreference, setFontPreference] = useState<FontPreference>(loadFontPreference)
  const [localDisplayName, setLocalDisplayName] = useState(loadLocalDisplayName)
  const [displayNameDraft, setDisplayNameDraft] = useState(loadLocalDisplayName)
  const [displayNameError, setDisplayNameError] = useState('')
  const [apps, setApps] = useState<AppRecord[]>(loadApps)
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(supabaseConfigStatus !== 'missing')
  const [workspaceOwnerId, setWorkspaceOwnerId] = useState<string | null>(null)
  const [authError, setAuthError] = useState('')
  const [today, setToday] = useState(() => localDateKey(new Date()))
  const [activities, setActivities] = useState<WorkspaceActivity[]>(loadActivity)
  const [activityFilter, setActivityFilter] = useState<'all' | ActivityCategory>('all')
  const [checkingAppId, setCheckingAppId] = useState<string | null>(null)
  const [checkError, setCheckError] = useState<{ appId: string; message: string } | null>(null)
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
  const [isProjectOpen, setIsProjectOpen] = useState(false)
  const [isTaskOpen, setIsTaskOpen] = useState(false)
  const [isBugOpen, setIsBugOpen] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [collectionError, setCollectionError] = useState('')
  const [projectError, setProjectError] = useState('')
  const [taskError, setTaskError] = useState('')
  const [bugError, setBugError] = useState('')
  const [collectionName, setCollectionName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskPriority, setTaskPriority] = useState<ProjectTask['priority']>('medium')
  const [taskStartDate, setTaskStartDate] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [bugTitle, setBugTitle] = useState('')
  const [bugDescription, setBugDescription] = useState('')
  const [bugCategory, setBugCategory] = useState<BugCategory>('functionality')
  const [bugCategoryFilter, setBugCategoryFilter] = useState<'all' | BugCategory>('all')
  const [bugSeverity, setBugSeverity] = useState<BugSeverity>('medium')
  const [bugAssignee, setBugAssignee] = useState('')
  const [bugRelatedUrl, setBugRelatedUrl] = useState('')
  const [bugReminderDate, setBugReminderDate] = useState('')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [folderContents, setFolderContents] = useState<{
    appName: string
    entries: LocalFolderEntry[]
    error: string
    hasMore: boolean
  } | null>(null)
  const [folderLoading, setFolderLoading] = useState(false)
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
  const [websiteMetadataTitle, setWebsiteMetadataTitle] = useState('')
  const [websiteMetadataUrl, setWebsiteMetadataUrl] = useState('')
  const [websiteMetadataLoading, setWebsiteMetadataLoading] = useState(false)
  const [websiteMetadataError, setWebsiteMetadataError] = useState('')
  const websiteMetadataLookup = useRef<{ url: string; controller: AbortController; promise: Promise<string | null> } | null>(null)
  const [isAddingApplication, setIsAddingApplication] = useState(false)
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [appCategory, setAppCategory] = useState('Productivity')
  const [appCollection, setAppCollection] = useState('')

  const acceptAuthUser = useCallback((user: User | null) => {
    setAuthUser(user)
    if (!supabase || !user) return
    try {
      const localKeys = ['ctrlspace.apps.v1', 'ctrlspace.collections.v1', 'ctrlspace.projects.v1', 'ctrlspace.activity.v1']
      for (const key of localKeys) {
        const scopedKey = workspaceStorageKey(user.id, key)
        if (window.localStorage.getItem(scopedKey) !== null) continue
        const localValue = window.localStorage.getItem(key)
        if (localValue === null) continue
        window.localStorage.setItem(scopedKey, localValue)
        window.localStorage.removeItem(key)
      }
      setApps(loadApps(workspaceStorageKey(user.id, 'ctrlspace.apps.v1')))
      setCollections(loadCollections(workspaceStorageKey(user.id, 'ctrlspace.collections.v1')))
      setProjects(loadProjects(workspaceStorageKey(user.id, 'ctrlspace.projects.v1')))
      setActivities(loadActivity(workspaceStorageKey(user.id, 'ctrlspace.activity.v1')))
      setWorkspaceOwnerId(user.id)
      setAuthError('')
    } catch (error) {
      console.error('The local workspace could not be prepared for this account.', error)
      setAuthError('Could not load this account’s local workspace. Check browser storage and try again.')
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      return
    }
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      acceptAuthUser(session?.user ?? null)
      setAuthLoading(false)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        console.error('Supabase session could not be loaded.', error)
        setAuthError('Could not check your sign-in session. Refresh and try again.')
      } else {
        acceptAuthUser(data.session?.user ?? null)
      }
      setAuthLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [acceptAuthUser])

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
    document.documentElement.dataset.font = fontPreference
    window.localStorage.setItem('ctrlspace.font.v1', fontPreference)
  }, [fontPreference])

  useEffect(() => {
    document.documentElement.dataset.accent = accentPreference
    window.localStorage.setItem('ctrlspace.accent.v1', accentPreference)
  }, [accentPreference])

  useEffect(() => {
    let timer: number
    const scheduleNextDay = () => {
      const now = new Date()
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = window.setTimeout(() => {
        setToday(localDateKey(new Date()))
        scheduleNextDay()
      }, tomorrow.getTime() - now.getTime() + 250)
    }
    scheduleNextDay()
    return () => window.clearTimeout(timer)
  }, [])

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
    if (!isAddOpen && !isCollectionOpen && !isProjectOpen && !isTaskOpen && !isBugOpen && !folderContents) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAddOpen(false)
        setIsCollectionOpen(false)
        setIsProjectOpen(false)
        setIsTaskOpen(false)
        setIsBugOpen(false)
        setFolderContents(null)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    const focusTarget = isAddOpen ? 'app-url' : isCollectionOpen ? 'collection-name' : isProjectOpen ? 'project-name' : isTaskOpen ? 'task-title' : isBugOpen ? 'bug-title' : 'close-folder-browser'
    document.getElementById(focusTarget)?.focus()
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isAddOpen, isCollectionOpen, isProjectOpen, isTaskOpen, isBugOpen, folderContents])

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        window.setTimeout(() => document.getElementById('global-search')?.focus(), 0)
      } else if (event.key === 'Escape') {
        setSearchOpen(false)
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('keydown', handleSearchShortcut)
    return () => document.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  useEffect(() => {
    if (!profileMenuOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('.profile')) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [profileMenuOpen])

  const filteredApps = useMemo(() => apps.filter((app) => {
    const matchesQuery = `${app.name} ${app.category} ${app.collection} ${app.url} ${app.repositoryUrl}`.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = category === 'All applications' || app.category === category
    const matchesCollection = activeCollection === 'All collections'
      || (activeCollection === 'Unfiled' ? !app.collection : app.collection === activeCollection)
    return matchesQuery && matchesCategory && matchesCollection
  }), [apps, activeCollection, category, query])
  const searchResults = useMemo<SearchResult[]>(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    const applicationResults = apps
      .filter((app) => `${app.name} ${app.category} ${app.collection} ${app.url} ${app.repositoryUrl}`.toLowerCase().includes(term))
      .map((app): SearchResult => ({ id: app.id, type: 'application', title: app.name, detail: `Application · ${app.category}` }))
    const projectResults = projects.flatMap((project): SearchResult[] => {
      const results: SearchResult[] = []
      if (`${project.name} ${project.description}`.toLowerCase().includes(term)) {
        results.push({ id: project.id, type: 'project', title: project.name, detail: 'Project' })
      }
      for (const task of project.tasks) {
        if (`${task.title} ${task.description} ${task.assignee}`.toLowerCase().includes(term)) {
          results.push({ id: task.id, type: 'task', title: task.title, detail: `Task · ${project.name}`, projectId: project.id })
        }
      }
      for (const bug of project.bugs) {
        if (`${bug.title} ${bug.description} ${bug.assignee}`.toLowerCase().includes(term)) {
          results.push({ id: bug.id, type: 'bug', title: bug.title, detail: `Bug · ${project.name}`, projectId: project.id })
        }
      }
      return results
    })
    return [...applicationResults, ...projectResults].slice(0, 8)
  }, [apps, projects, query])

  const categories = useMemo(() => ['All applications', ...new Set(apps.map((app) => app.category))], [apps])
  const recentlyOpenedApps = useMemo(() => apps
    .filter((app) => app.lastOpenedAt)
    .sort((left, right) => Date.parse(right.lastOpenedAt ?? '') - Date.parse(left.lastOpenedAt ?? ''))
    .slice(0, 6), [apps])
  const collectionOptions = useMemo(() => [...collections, 'Unfiled'], [collections])
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const visibleProjectBugs = activeProject?.bugs.filter((bug) =>
    bugCategoryFilter === 'all' || bug.category === bugCategoryFilter,
  ) ?? []
  const taskReminders = useMemo(() => {
    return projects.flatMap((project) => project.tasks
      .filter((task) => task.dueDate && task.status !== 'done')
      .map((task) => ({
        projectId: project.id,
        projectName: project.name,
        task,
        daysUntilDue: daysBetweenDateKeys(today, task.dueDate),
      }))
      .filter((reminder) => reminder.daysUntilDue <= 7))
      .sort((left, right) => left.daysUntilDue - right.daysUntilDue)
  }, [projects, today])
  const bugReminders = useMemo(() => projects.flatMap((project) => project.bugs
    .filter((bug) => bug.reminderDate && bug.status !== 'resolved')
    .map((bug) => ({
      projectId: project.id,
      projectName: project.name,
      bug,
      daysUntilDue: daysBetweenDateKeys(today, bug.reminderDate),
    }))
    .filter((reminder) => reminder.daysUntilDue <= 7))
    .sort((left, right) => left.daysUntilDue - right.daysUntilDue), [projects, today])
  const monitoredApps = apps.filter((app) => app.url)
  const checkedApps = monitoredApps.filter((app) => app.lastCheckedAt)
  const workspaceNotifications: WorkspaceNotification[] = [
    ...taskReminders.map((reminder) => ({
      id: `task-${reminder.projectId}-${reminder.task.id}`,
      type: 'task' as const,
      title: reminder.task.title,
      detail: `${reminder.projectName} · ${formatReminderDue(reminder.daysUntilDue, reminder.task.dueDate)}`,
      projectId: reminder.projectId,
    })),
    ...bugReminders.map((reminder) => ({
      id: `bug-${reminder.projectId}-${reminder.bug.id}`,
      type: 'bug' as const,
      title: reminder.bug.title,
      detail: `${reminder.projectName} · ${formatReminderDue(reminder.daysUntilDue, reminder.bug.reminderDate)}`,
      projectId: reminder.projectId,
    })),
    ...checkedApps.filter((app) => app.status === 'offline' || app.status === 'degraded').map((app) => ({
      id: `health-${app.id}`,
      type: 'health' as const,
      title: `${app.name} is ${app.status}`,
      detail: app.statusDetail || 'Website health check needs attention.',
      appId: app.id,
    })),
  ]
  const setupSteps = [
    { id: 'application', done: apps.length > 0, label: 'Add application' },
    { id: 'project', done: projects.length > 0, label: 'Create project' },
    { id: 'github', done: githubConnected, label: 'Connect GitHub' },
    { id: 'monitoring', done: checkedApps.length > 0, label: 'Check a website' },
  ]
  const completedSetupSteps = setupSteps.filter((step) => step.done).length
  const nextSetupStep = setupSteps.find((step) => !step.done)
  const averageResponseTime = checkedApps.length
    ? Math.round(checkedApps.reduce((total, app) => total + (app.responseTimeMs ?? 0), 0) / checkedApps.length)
    : null
  const filteredActivities = useMemo(() => activityFilter === 'all'
    ? activities
    : activities.filter((item) => item.category === activityFilter), [activities, activityFilter])
  const filteredGitHubRepositories = useMemo(() => githubRepositories.filter((repository) =>
    `${repository.fullName} ${repository.description ?? ''}`.toLowerCase().includes(githubRepositoryQuery.toLowerCase()),
  ), [githubRepositories, githubRepositoryQuery])

  function saveApps(nextApps: AppRecord[]) {
    window.localStorage.setItem(workspaceStorageKey(authUser?.id ?? null, 'ctrlspace.apps.v1'), JSON.stringify(nextApps))
    setApps(nextApps)
  }

  function saveCollections(nextCollections: string[]) {
    window.localStorage.setItem(workspaceStorageKey(authUser?.id ?? null, 'ctrlspace.collections.v1'), JSON.stringify(nextCollections))
    setCollections(nextCollections)
  }

  function saveProjects(nextProjects: Project[]) {
    window.localStorage.setItem(workspaceStorageKey(authUser?.id ?? null, 'ctrlspace.projects.v1'), JSON.stringify(nextProjects))
    setProjects(nextProjects)
  }

  function recordActivity(category: ActivityCategory, title: string, detail: string) {
    const nextActivities = [{
      id: crypto.randomUUID(),
      category,
      title,
      detail,
      createdAt: new Date().toISOString(),
    }, ...activities].slice(0, 100)
    window.localStorage.setItem(workspaceStorageKey(authUser?.id ?? null, 'ctrlspace.activity.v1'), JSON.stringify(nextActivities))
    setActivities(nextActivities)
  }

  function clearActivity() {
    if (!window.confirm('Clear all activity from this browser? This cannot be undone.')) return
    window.localStorage.setItem(workspaceStorageKey(authUser?.id ?? null, 'ctrlspace.activity.v1'), '[]')
    setActivities([])
  }

  async function checkApplication(app: AppRecord) {
    if (!app.url || checkingAppId) return
    setCheckingAppId(app.id)
    setCheckError(null)
    try {
      const response = await fetch('/api/website/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: app.url }),
      })
      const result: unknown = await response.json()
      if (typeof result !== 'object' || result === null) throw new Error('The health check response was invalid.')
      const data = result as { status?: unknown; statusCode?: unknown; latencyMs?: unknown; detail?: unknown; error?: unknown }
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not check this website.')
      if (!isAppStatus(data.status) || data.status === 'unknown'
        || !(data.statusCode === null || (typeof data.statusCode === 'number' && Number.isInteger(data.statusCode)))
        || typeof data.latencyMs !== 'number' || !Number.isFinite(data.latencyMs) || data.latencyMs < 0
        || typeof data.detail !== 'string') {
        throw new Error('The health check response was invalid.')
      }
      const checkedAt = new Date().toISOString()
      const updatedApp = {
        ...app,
        status: data.status,
        lastCheckedAt: checkedAt,
        responseTimeMs: data.latencyMs,
        statusDetail: data.detail,
      }
      saveApps(apps.map((item) => item.id === app.id ? updatedApp : item))
      recordActivity('application', 'Checked website health', `${app.name} · ${updatedApp.status} · ${updatedApp.responseTimeMs} ms`)
    } catch (error) {
      console.error('Website health check failed.', error)
      setCheckError({ appId: app.id, message: error instanceof Error ? error.message : 'Could not check this website.' })
    } finally {
      setCheckingAppId(null)
    }
  }

  function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = projectName.trim()
    if (!name) {
      setProjectError('Enter a project name.')
      return
    }
    if (projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
      setProjectError('A project with that name already exists.')
      return
    }
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      description: projectDescription.trim(),
      color: projectColors[projects.length % projectColors.length],
      tasks: [],
      bugs: [],
    }
    saveProjects([project, ...projects])
    recordActivity('project', 'Created project', project.name)
    setActiveProjectId(project.id)
    setProjectName('')
    setProjectDescription('')
    setProjectError('')
    setIsProjectOpen(false)
  }

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = taskTitle.trim()
    const project = projects.find((item) => item.id === activeProjectId)
    if (!project || !title) {
      setTaskError('Enter a task title.')
      return
    }
    if (taskStartDate && taskDueDate && taskStartDate > taskDueDate) {
      setTaskError('The start date must be on or before the due date.')
      return
    }
    const task: ProjectTask = {
      id: crypto.randomUUID(),
      title,
      description: taskDescription.trim(),
      assignee: taskAssignee.trim(),
      status: 'todo',
      priority: taskPriority,
      startDate: taskStartDate,
      dueDate: taskDueDate,
    }
    saveProjects(projects.map((project) =>
      project.id === activeProjectId ? { ...project, tasks: [...project.tasks, task] } : project,
    ))
    recordActivity('task', 'Added task', `${task.title} · ${project.name}${task.assignee ? ` · Assigned to ${task.assignee}` : ''}`)
    setTaskTitle('')
    setTaskDescription('')
    setTaskAssignee('')
    setTaskPriority('medium')
    setTaskStartDate('')
    setTaskDueDate('')
    setTaskError('')
    setIsTaskOpen(false)
  }

  function createBug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = bugTitle.trim()
    const project = projects.find((item) => item.id === activeProjectId)
    if (!project || !title) {
      setBugError('Enter a bug title.')
      return
    }
    const relatedUrl = bugRelatedUrl.trim()
    if (!isSafeBugReferenceUrl(relatedUrl)) {
      setBugError('Enter a valid HTTP or HTTPS link.')
      return
    }
    const now = new Date().toISOString()
    const bug: ProjectBug = {
      id: crypto.randomUUID(),
      title,
      description: bugDescription.trim(),
      category: bugCategory,
      severity: bugSeverity,
      status: 'open',
      assignee: bugAssignee.trim(),
      relatedUrl,
      reminderDate: bugReminderDate,
      createdAt: now,
      updatedAt: now,
    }
    saveProjects(projects.map((item) => item.id === project.id ? { ...item, bugs: [...item.bugs, bug] } : item))
    recordActivity('bug', 'Reported bug', `${bug.title} · ${project.name} · ${formatBugCategory(bug.category)} · ${bug.severity}${bug.assignee ? ` · Assigned to ${bug.assignee}` : ''}`)
    setBugTitle('')
    setBugDescription('')
    setBugCategory('functionality')
    setBugSeverity('medium')
    setBugAssignee('')
    setBugRelatedUrl('')
    setBugReminderDate('')
    setBugError('')
    setIsBugOpen(false)
  }

  function updateBug(projectId: string, bugId: string, status: BugStatus) {
    const project = projects.find((item) => item.id === projectId)
    const bug = project?.bugs.find((item) => item.id === bugId)
    if (!project || !bug || bug.status === status) return
    const updatedAt = new Date().toISOString()
    saveProjects(projects.map((item) => item.id !== projectId ? item : {
      ...item,
      bugs: item.bugs.map((entry) => entry.id === bugId ? { ...entry, status, updatedAt } : entry),
    }))
    recordActivity('bug', `Changed bug to ${status === 'in-progress' ? 'in progress' : status}`, `${bug.title} · ${project.name}`)
  }

  function updateBugReminder(projectId: string, bugId: string, reminderDate: string) {
    const project = projects.find((item) => item.id === projectId)
    const bug = project?.bugs.find((item) => item.id === bugId)
    if (!project || !bug || bug.reminderDate === reminderDate) return
    const updatedAt = new Date().toISOString()
    saveProjects(projects.map((item) => item.id !== projectId ? item : {
      ...item,
      bugs: item.bugs.map((entry) => entry.id === bugId ? { ...entry, reminderDate, updatedAt } : entry),
    }))
    recordActivity('bug', reminderDate ? 'Scheduled bug reminder' : 'Removed bug reminder', `${bug.title} · ${project.name}${reminderDate ? ` · ${formatDueDate(reminderDate)}` : ''}`)
  }

  function updateBugAssignee(projectId: string, bugId: string, assignee: string) {
    const project = projects.find((item) => item.id === projectId)
    const bug = project?.bugs.find((item) => item.id === bugId)
    const normalizedAssignee = assignee.trim()
    if (!project || !bug || bug.assignee === normalizedAssignee) return
    const updatedAt = new Date().toISOString()
    saveProjects(projects.map((item) => item.id !== projectId ? item : {
      ...item,
      bugs: item.bugs.map((entry) => entry.id === bugId ? { ...entry, assignee: normalizedAssignee, updatedAt } : entry),
    }))
    recordActivity('bug', normalizedAssignee ? 'Assigned bug' : 'Unassigned bug', `${bug.title} · ${project.name}${normalizedAssignee ? ` · ${normalizedAssignee}` : ''}`)
  }

  function deleteBug(projectId: string, bugId: string) {
    const project = projects.find((item) => item.id === projectId)
    const bug = project?.bugs.find((item) => item.id === bugId)
    if (!project || !bug || !window.confirm(`Delete bug "${bug.title}"? This cannot be undone.`)) return
    saveProjects(projects.map((item) => item.id === projectId
      ? { ...item, bugs: item.bugs.filter((entry) => entry.id !== bugId) }
      : item))
    recordActivity('bug', 'Deleted bug', `${bug.title} · ${project.name}`)
  }

  function updateTask(projectId: string, taskId: string, update: Partial<ProjectTask>) {
    const project = projects.find((item) => item.id === projectId)
    const task = project?.tasks.find((item) => item.id === taskId)
    if (!project || !task) return
    const normalizedUpdate = typeof update.assignee === 'string'
      ? { ...update, assignee: update.assignee.trim() }
      : update
    saveProjects(projects.map((project) => project.id !== projectId ? project : {
      ...project,
      tasks: project.tasks.map((task) => task.id === taskId ? { ...task, ...normalizedUpdate } : task),
    }))
    if (update.status && update.status !== task.status) {
      recordActivity('task', `Changed task to ${update.status === 'in-progress' ? 'in progress' : update.status}`, `${task.title} · ${project.name}`)
    }
    if (typeof normalizedUpdate.assignee === 'string' && normalizedUpdate.assignee !== task.assignee) {
      const assignee = normalizedUpdate.assignee
      recordActivity('task', assignee ? 'Assigned task' : 'Unassigned task', `${task.title} · ${project.name}${assignee ? ` · ${assignee}` : ''}`)
    }
  }

  function deleteTask(projectId: string, taskId: string) {
    const project = projects.find((item) => item.id === projectId)
    const task = project?.tasks.find((item) => item.id === taskId)
    if (!project || !task || !window.confirm(`Delete task "${task.title}"? This cannot be undone.`)) return
    saveProjects(projects.map((item) => item.id === projectId
      ? { ...item, tasks: item.tasks.filter((task) => task.id !== taskId) }
      : item))
    recordActivity('task', 'Deleted task', `${task.title} · ${project.name}`)
  }

  function deleteProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId)
    if (!project || !window.confirm(`Delete "${project.name}" and its tasks and bugs? This cannot be undone.`)) return
    saveProjects(projects.filter((item) => item.id !== projectId))
    recordActivity('project', 'Deleted project', project.name)
    setActiveProjectId(null)
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
    recordActivity('application', 'Created collection', cleanName)
    setActiveCollection(cleanName)
    setCollectionName('')
    setCollectionError('')
    setIsCollectionOpen(false)
  }

  function deleteCollection(name: string) {
    if (!collections.includes(name) || !window.confirm(`Delete collection "${name}"? Applications in it will move to Unfiled.`)) return
    const affectedApps = apps.filter((app) => app.collection === name)
    saveCollections(collections.filter((collection) => collection !== name))
    if (affectedApps.length > 0) {
      saveApps(apps.map((app) => app.collection === name ? { ...app, collection: '' } : app))
    }
    recordActivity('application', 'Deleted collection', `${name} · ${affectedApps.length} application${affectedApps.length === 1 ? '' : 's'} moved to Unfiled`)
    setActiveCollection('All collections')
  }

  function assignCollection(id: string, collection: string) {
    const app = apps.find((item) => item.id === id)
    const nextCollection = collection === 'Unfiled' ? '' : collection
    if (!app || app.collection === nextCollection) return
    saveApps(apps.map((item) => item.id === id ? { ...item, collection: nextCollection } : item))
    recordActivity('application', 'Changed application collection', `${app.name} · ${collection}`)
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

  function lookupWebsiteTitle(value: string) {
    const url = new URL(value).toString()
    if (websiteMetadataLookup.current?.url === url) return websiteMetadataLookup.current.promise
    websiteMetadataLookup.current?.controller.abort()
    const controller = new AbortController()
    setWebsiteMetadataLoading(true)
    setWebsiteMetadataError('')
    const promise = (async () => {
      try {
        const response = await fetch('/api/website/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        })
        const result: unknown = await response.json()
        if (typeof result !== 'object' || result === null) throw new Error('The website metadata response was invalid.')
        const data = result as { title?: unknown; error?: unknown }
        if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not retrieve the website title.')
        if (data.title !== null && typeof data.title !== 'string') throw new Error('The website metadata response was invalid.')
        return data.title
      } finally {
        if (websiteMetadataLookup.current?.controller === controller) {
          websiteMetadataLookup.current = null
          setWebsiteMetadataLoading(false)
        }
      }
    })()
    websiteMetadataLookup.current = { url, controller, promise }
    return promise
  }

  function previewWebsiteTitle(value: string) {
    if (appName.trim() || !value.trim()) return
    let url: URL
    try {
      url = new URL(value.trim())
    } catch {
      return
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return
    const normalizedUrl = url.toString()
    void lookupWebsiteTitle(normalizedUrl).then((title) => {
      if (websiteMetadataLookup.current || websiteMetadataUrl === normalizedUrl) return
      setWebsiteMetadataUrl(normalizedUrl)
      setWebsiteMetadataTitle(title ?? '')
      if (!title) setWebsiteMetadataError('No page title was found. CTRLSPACE will use the website domain instead.')
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Website title preview could not be loaded.', error)
      setWebsiteMetadataError('Could not retrieve the website title. You can still add it using the website domain.')
    })
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
      recordActivity('application', 'Imported GitHub repository', imported.fullName)
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
    if (isAddingApplication) return
    setIsAddingApplication(true)
    try {
      let fetchedWebsiteTitle = ''
      if (parsedUrl && !appName.trim()) {
        if (websiteMetadataUrl === parsedUrl.toString()) {
          fetchedWebsiteTitle = websiteMetadataTitle
        } else {
          try {
            fetchedWebsiteTitle = await lookupWebsiteTitle(parsedUrl.toString()) ?? ''
            setWebsiteMetadataUrl(parsedUrl.toString())
            setWebsiteMetadataTitle(fetchedWebsiteTitle)
            if (!fetchedWebsiteTitle) setWebsiteMetadataError('No page title was found. CTRLSPACE will use the website domain instead.')
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return
            console.error('Website title lookup failed while adding an application.', error)
            setWebsiteMetadataError('Could not retrieve the website title. CTRLSPACE will use the website domain instead.')
          }
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
      const displayName = appName.trim() || fetchedWebsiteTitle || generatedName
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
      recordActivity('application', 'Added application', displayName)
      setAppName('')
      setAppUrl('')
      setWebsiteMetadataTitle('')
      setWebsiteMetadataUrl('')
      setWebsiteMetadataError('')
      setRepositoryUrl('')
      setDirectoryHandle(null)
      setAppCategory('Productivity')
      setAppCollection('')
      setIsAddOpen(false)
    } finally {
      setIsAddingApplication(false)
    }
  }

  function toggleFavorite(id: string) {
    const app = apps.find((item) => item.id === id)
    if (!app) return
    saveApps(apps.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item))
    recordActivity('application', app.favorite ? 'Unpinned application' : 'Pinned application', app.name)
  }

  async function deleteApplication(id: string) {
    const app = apps.find((item) => item.id === id)
    if (!app || !window.confirm(`Remove "${app.name}" from your application library? This cannot be undone.`)) return
    if (app.folderName) {
      try {
        await deleteDirectoryHandle(app.id)
      } catch (error) {
        console.error('The local folder link could not be removed.', error)
        window.alert('Could not remove the local folder link. The application was kept in your library.')
        return
      }
    }
    saveApps(apps.filter((item) => item.id !== id))
    recordActivity('application', 'Removed application', app.name)
  }

  async function browseLocalFolder(app: AppRecord) {
    if (!app.folderName) return
    setFolderContents({ appName: app.name, entries: [], error: '', hasMore: false })
    setFolderLoading(true)
    try {
      const handle = await loadDirectoryHandle(app.id)
      if (!handle) throw new Error('The saved folder link was not found. Remove and add this application again to reconnect it.')
      let permission = await handle.queryPermission({ mode: 'read' })
      if (permission !== 'granted') permission = await handle.requestPermission({ mode: 'read' })
      if (permission !== 'granted') throw new Error('Folder access was not granted. Allow read access and try again.')
      const entries: LocalFolderEntry[] = []
      let hasMore = false
      for await (const entry of handle.values()) {
        if (entries.length === 200) {
          hasMore = true
          break
        }
        entries.push({ name: entry.name, kind: entry.kind })
      }
      entries.sort((left, right) =>
        Number(right.kind === 'directory') - Number(left.kind === 'directory')
        || left.name.localeCompare(right.name),
      )
      setFolderContents({ appName: app.name, entries, error: '', hasMore })
    } catch (error) {
      console.error('The local folder could not be opened.', error)
      setFolderContents({
        appName: app.name,
        entries: [],
        error: error instanceof Error ? error.message : 'The local folder could not be opened.',
        hasMore: false,
      })
    } finally {
      setFolderLoading(false)
    }
  }

  function recordAppLaunch(app: AppRecord, destination: 'website' | 'repository') {
    const lastOpenedAt = new Date().toISOString()
    saveApps(apps.map((item) => item.id === app.id ? { ...item, lastOpenedAt } : item))
    recordActivity('application', `Opened ${destination}`, app.name)
  }

  async function signInWithGoogle() {
    if (!supabase) return
    setAuthError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      console.error('Google sign-in could not be started.', error)
      setAuthError('Google sign-in could not be started. Check the Supabase Google provider settings and try again.')
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('The account could not be signed out.', error)
      setAuthError('Could not sign out. Please try again.')
    }
  }

  function saveLocalDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = displayNameDraft.trim()
    if (!name) {
      setDisplayNameError('Enter a display name.')
      return
    }
    try {
      window.localStorage.setItem('ctrlspace.display-name.v1', name.slice(0, 60))
      setLocalDisplayName(name.slice(0, 60))
      setDisplayNameDraft(name.slice(0, 60))
      setDisplayNameError('')
    } catch (error) {
      console.error('The local display name could not be saved.', error)
      setDisplayNameError('Could not save your display name. Check browser storage and try again.')
    }
  }

  function exportWorkspaceData() {
    const backup = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      applications: apps,
      collections,
      projects,
      activity: activities,
      themePreference,
      accentPreference,
      fontPreference,
    }
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `ctrlspace-backup-${localDateKey(new Date())}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }

  const profileName = authUser
    ? typeof authUser.user_metadata.full_name === 'string' ? authUser.user_metadata.full_name : authUser.email ?? 'Signed-in user'
    : localDisplayName
  const profileInitials = profileName.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
  const pageTitle = {
    overview: 'Overview',
    applications: 'Applications',
    projects: 'Projects',
    activity: 'Activity',
    settings: 'Settings',
  }[currentView]
  const activePortal = currentView === 'applications' ? 'Business' : currentView === 'projects' ? 'Developer' : 'Personal'
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(`${today}T00:00:00`)).toUpperCase()
  const currentHour = new Date().getHours()
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening'

  if (supabaseConfigStatus === 'incomplete') {
    return <AuthGate error="Supabase is only partially configured. Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env." />
  }
  if (supabase && authLoading) return <AuthGate loading />
  if (supabase && authUser && authError) return <AuthGate error={authError} onSignOut={signOut} />
  if (supabase && !authUser) return <AuthGate error={authError} onSignIn={signInWithGoogle} />
  if (supabase && authUser && workspaceOwnerId !== authUser.id) return <AuthGate loading />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setCurrentView('overview') }} aria-label="CTRLSPACE home">
          <img className="brand-logo" src="/ctrlspace-mark.png" alt="" />
          <span className="brand-name">CTRL<span>SPACE</span></span>
        </a>

        <div className="workspace-switcher">
          <div className="workspace-avatar">P</div>
          <div className="workspace-copy"><strong>Workspace</strong><span>Local hub</span></div>
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
          {([
            { label: 'Personal', view: 'overview' as const },
            { label: 'Business', view: 'applications' as const },
            { label: 'Developer', view: 'projects' as const },
          ]).map((item, index) => (
            <button key={item.label} className={`portal-item ${activePortal === item.label ? 'selected' : ''}`} onClick={() => {
              setCurrentView(item.view)
              if (item.view !== 'projects') setActiveProjectId(null)
            }} aria-current={activePortal === item.label ? 'page' : undefined}>
              <span className={`portal-dot portal-dot-${index}`} />
              {item.label}
              {activePortal === item.label && <span className="portal-current">CURRENT</span>}
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
            <div className="storage-head"><span>Workspace setup</span><span>{completedSetupSteps}/4</span></div>
            <div className="storage-bar"><span style={{ width: `${completedSetupSteps / setupSteps.length * 100}%` }} /></div>
            <p>{nextSetupStep ? 'Complete the next step to set up your workspace.' : 'Your workspace setup is complete.'}</p>
            <button disabled={!nextSetupStep} onClick={() => {
              if (!nextSetupStep) return
              if (nextSetupStep.id === 'application' || nextSetupStep.id === 'github') {
                setCurrentView('applications')
                setFormError('')
                setIsAddOpen(true)
              } else if (nextSetupStep.id === 'project') {
                setCurrentView('projects')
                setProjectError('')
                setIsProjectOpen(true)
              } else {
                setCurrentView('applications')
              }
            }}>{nextSetupStep?.label ?? 'Setup complete'} <Icon name="arrow" size={14} /></button>
          </div>
          <button className={`nav-item settings-link ${currentView === 'settings' ? 'active' : ''}`} onClick={() => setCurrentView('settings')} aria-label="Settings" aria-current={currentView === 'settings' ? 'page' : undefined}><Icon name="settings" size={17} /><span>Settings</span></button>
          <div className="profile">
            <button type="button" className="profile-avatar" onClick={() => setProfileMenuOpen((open) => !open)} aria-label="Profile options" aria-expanded={profileMenuOpen}>{profileInitials}</button>
            <div className="profile-copy"><strong>{profileName}</strong><span>{authUser ? 'Signed in with Google' : 'Local workspace'}</span></div>
            {profileMenuOpen && <div className="profile-menu" role="dialog" aria-label="Profile options">
              <strong>{profileName}</strong>
              <span>{authUser?.email ?? 'Local workspace · saved in this browser'}</span>
              {authUser && <button type="button" onClick={() => { setProfileMenuOpen(false); void signOut() }}>Sign out</button>}
            </div>}
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
                <input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications, projects, tasks, bugs..." aria-label="Search applications, projects, tasks, and bugs" />
                <kbd>Ctrl K</kbd>
                {searchOpen && query.trim() && <div className="search-results" role="listbox" aria-label="Search results">
                  {searchResults.length > 0
                    ? searchResults.map((result) => <button key={`${result.type}-${result.id}`} type="button" role="option" className="search-result" onClick={() => {
                        setSearchOpen(false)
                        if (result.type === 'application') {
                          setCurrentView('applications')
                          setQuery(result.title)
                        } else {
                          setCurrentView('projects')
                          setActiveProjectId(result.projectId ?? result.id)
                          setQuery('')
                        }
                      }}>
                        <span className={`search-result-type ${result.type}`}>{result.type === 'application' ? 'APP' : result.type.toUpperCase()}</span>
                        <span className="search-result-copy"><strong>{result.title}</strong><small>{result.detail}</small></span>
                      </button>)
                    : <p className="search-empty">No matching applications, projects, tasks, or bugs.</p>}
                </div>}
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
            <div className="notification-wrapper">
              <button type="button" className="icon-button notification-button" aria-label={`Open reminder center, ${workspaceNotifications.length} items`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
                <Icon name="bell" size={18} />
                {workspaceNotifications.length > 0 && <span className="notification-count">{workspaceNotifications.length > 99 ? '99+' : workspaceNotifications.length}</span>}
              </button>
              {notificationsOpen && <div className="notification-menu" role="dialog" aria-label="Reminder center">
                <div className="notification-menu-heading"><strong>Reminder center</strong><span>Local alerts · no push notifications</span></div>
                {workspaceNotifications.length > 0
                  ? workspaceNotifications.slice(0, 8).map((item) => <button type="button" key={item.id} className="notification-item" onClick={() => {
                      setNotificationsOpen(false)
                      if (item.projectId) {
                        setActiveProjectId(item.projectId)
                        setCurrentView('projects')
                      } else if (item.appId) {
                        setCurrentView('applications')
                        setQuery(apps.find((app) => app.id === item.appId)?.name ?? '')
                      }
                    }}>
                      <span className={`notification-kind ${item.type}`}><Icon name={item.type === 'health' ? 'pulse' : item.type === 'bug' ? 'pulse' : 'clock'} size={13} /></span>
                      <span className="notification-item-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                    </button>)
                  : <p className="notification-empty">No task, bug, or website alerts need attention.</p>}
              </div>}
            </div>
            {authUser && <button className="sign-out-button" onClick={signOut}>Sign out</button>}
            <div className="topbar-avatar">{profileInitials}</div>
          </div>
        </header>

        <div className="page-content">
          {currentView === 'overview' && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" /> {todayLabel}</div>
                  <h1>{greeting}, {profileName.split(/[\s@.]+/).filter(Boolean)[0] ?? 'there'} <span className="wave" aria-hidden="true">💻</span></h1>
                  <p className="welcome-subtitle">Your digital workspace, all in one place.</p>
                </div>
                <button className="primary-button" onClick={() => setIsAddOpen(true)}><Icon name="plus" size={17} /> Add application</button>
              </section>

              <div className="preview-notice"><span>LOCAL WORKSPACE</span><p>Projects, activity, and website check results are saved in this browser. Checks run only when you request them.</p></div>

              <section className="metrics-grid" aria-label="Workspace summary">
                <Metric icon="layers" label="Applications" value={String(apps.length).padStart(2, '0')} trend="in your workspace" tone="violet" />
                <Metric icon="folder" label="Projects" value={String(projects.length).padStart(2, '0')} trend="saved on this device" tone="blue" />
                <Metric icon="pulse" label="Connected integrations" value={githubConnected ? '01' : '00'} trend={githubConnected ? 'GitHub connected' : 'not connected'} tone="mint" />
                <Metric icon="clock" label="Websites checked" value={String(checkedApps.length).padStart(2, '0')} trend={`${monitoredApps.length} website${monitoredApps.length === 1 ? '' : 's'} available`} tone="orange" />
              </section>

              <section className="overview-grid">
                <div className="panel health-panel">
                  <div className="panel-heading">
                    <div><div className="section-kicker">SYSTEM PULSE</div><h2>Workspace health</h2></div>
                    <span className={`status-pill ${checkedApps.length ? 'status-checked' : 'status-pending'}`}><span /> {checkedApps.length ? `${checkedApps.length} CHECKED` : 'NOT CHECKED YET'}</span>
                  </div>
                  <div className="health-summary">
                    <div className="health-value">{checkedApps.length
                      ? `${checkedApps.filter((app) => app.status === 'online').length} online`
                      : 'No websites checked'}
                      <span>{checkedApps.length
                        ? `${checkedApps.filter((app) => app.status === 'degraded').length} degraded · ${checkedApps.filter((app) => app.status === 'offline').length} offline · ${monitoredApps.length - checkedApps.length} unchecked`
                        : 'Choose Check on a website card to test reachability.'}</span>
                    </div>
                    <div className="health-art" aria-hidden="true">
                      {[
                        { label: 'ONLINE', count: checkedApps.filter((app) => app.status === 'online').length },
                        { label: 'DEGRADED', count: checkedApps.filter((app) => app.status === 'degraded').length },
                        { label: 'OFFLINE', count: checkedApps.filter((app) => app.status === 'offline').length },
                        { label: 'UNCHECKED', count: monitoredApps.length - checkedApps.length },
                      ].map((module, index) => (
                        <div className={`health-module module-${index}`} key={module.label}>
                          <span>{module.label}</span><i>{module.count}</i>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="health-foot">
                    <div className="health-key"><span className={`key-dot ${checkedApps.length ? 'online-dot' : 'muted-dot'}`} /><div><strong>Availability</strong><span>{checkedApps.length} of {monitoredApps.length} websites checked</span></div></div>
                    <div className="health-key"><span className="key-dot muted-dot" /><div><strong>Avg. response</strong><span>{averageResponseTime === null ? 'No measurements yet' : `${averageResponseTime} ms`}</span></div></div>
                    <button className="text-button" onClick={() => setCurrentView('applications')}>Check websites <Icon name="arrow" size={14} /></button>
                  </div>
                </div>

                <div className="panel activity-panel">
                  <div className="panel-heading">
                    <div><div className="section-kicker">LATEST UPDATES</div><h2>Activity</h2></div>
                  </div>
                  <div className="activity-list">
                    {activities.slice(0, 3).map((item) => (
                      <div className="activity-item" key={item.id}>
                        <div className={`activity-icon ${activityColor(item.category)}`}><Icon name={activityIcon(item.category)} size={15} /></div>
                        <div className="activity-copy"><strong>{item.title}</strong><span>{item.detail}</span></div>
                        <time>{formatActivityTime(item.createdAt)}</time>
                      </div>
                    ))}
                    {activities.length === 0 && <p className="activity-empty">Workspace changes will appear here.</p>}
                  </div>
                  <button className="panel-footer-link" onClick={() => setCurrentView('activity')}>View activity log <Icon name="arrow" size={14} /></button>
                </div>
              </section>

              <section className="section-block reminder-section" aria-labelledby="task-reminders-heading">
                <div className="section-heading">
                  <div><div className="section-kicker">PROJECT PLANNER</div><h2 id="task-reminders-heading">Task reminders <span className="subtle-count">{taskReminders.length.toString().padStart(2, '0')}</span></h2></div>
                  <button className="text-button" onClick={() => setCurrentView('projects')}>View projects <Icon name="arrow" size={14} /></button>
                </div>
                {taskReminders.length > 0
                  ? <div className="reminder-list">
                      {taskReminders.slice(0, 6).map((reminder) => (
                        <button className={`reminder-item ${reminder.daysUntilDue < 0 ? 'overdue' : reminder.daysUntilDue === 0 ? 'due-today' : ''}`} key={`${reminder.projectId}-${reminder.task.id}`} onClick={() => { setActiveProjectId(reminder.projectId); setCurrentView('projects') }}>
                          <span className="reminder-indicator" />
                          <span className="reminder-copy"><strong>{reminder.task.title}</strong><span>{reminder.projectName}</span></span>
                          <span className="reminder-due">{formatReminderDue(reminder.daysUntilDue, reminder.task.dueDate)}</span>
                        </button>
                      ))}
                      {taskReminders.length > 6 && <p className="reminder-overflow">And {taskReminders.length - 6} more due tasks</p>}
                    </div>
                  : <div className="reminder-empty">No overdue tasks or deadlines in the next 7 days.</div>}
              </section>

              <section className="section-block reminder-section" aria-labelledby="bug-reminders-heading">
                <div className="section-heading">
                  <div><div className="section-kicker">ISSUE TRACKER</div><h2 id="bug-reminders-heading">Bug reminders <span className="subtle-count">{bugReminders.length.toString().padStart(2, '0')}</span></h2></div>
                  <button className="text-button" onClick={() => setCurrentView('projects')}>View projects <Icon name="arrow" size={14} /></button>
                </div>
                {bugReminders.length > 0
                  ? <div className="reminder-list">
                      {bugReminders.slice(0, 6).map((reminder) => (
                        <button className={`reminder-item ${reminder.daysUntilDue < 0 ? 'overdue' : reminder.daysUntilDue === 0 ? 'due-today' : ''}`} key={`${reminder.projectId}-${reminder.bug.id}`} onClick={() => { setActiveProjectId(reminder.projectId); setCurrentView('projects') }}>
                          <span className="reminder-indicator" />
                          <span className="reminder-copy"><strong>{reminder.bug.title}</strong><span>{reminder.projectName} · {reminder.bug.severity} severity</span></span>
                          <span className="reminder-due">{formatReminderDue(reminder.daysUntilDue, reminder.bug.reminderDate)}</span>
                        </button>
                      ))}
                      {bugReminders.length > 6 && <p className="reminder-overflow">And {bugReminders.length - 6} more bug reminders</p>}
                    </div>
                  : <div className="reminder-empty">No unresolved bug reminders due in the next 7 days.</div>}
              </section>

              <section className="section-block">
                <div className="section-heading">
                  <div><div className="section-kicker">PERSONAL PORTAL</div><h2>Recently opened <span className="subtle-count">{String(recentlyOpenedApps.length).padStart(2, '0')}</span></h2></div>
                  <button className="text-button" onClick={() => setCurrentView('applications')}>Browse library <Icon name="arrow" size={14} /></button>
                </div>
                {recentlyOpenedApps.length > 0
                  ? <div className="recent-app-list">
                      {recentlyOpenedApps.map((app) => (
                        <div className="recent-app-row" key={app.id}>
                          <div className={`recent-app-icon ${app.tint}`}>{app.icon}</div>
                          <div className="recent-app-copy"><strong>{app.name}</strong><span>{app.category} · Opened {formatActivityTime(app.lastOpenedAt ?? '')}</span></div>
                          <div className="recent-app-actions">
                            {app.repositoryUrl && <a href={app.repositoryUrl} target="_blank" rel="noreferrer" aria-label={`Open ${app.name} repository`} title="Open repository" onClick={() => recordAppLaunch(app, 'repository')}><Icon name="layers" size={15} /></a>}
                            {app.url && <a href={app.url} target="_blank" rel="noreferrer" aria-label={`Open ${app.name}`} title="Open website" onClick={() => recordAppLaunch(app, 'website')}><Icon name="external" size={15} /></a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  : <div className="reminder-empty">Your opened applications and repositories will appear here.</div>}
              </section>

              <section className="section-block">
                <div className="section-heading">
                  <div><div className="section-kicker">PROJECT SPACE</div><h2>Projects <span className="subtle-count">{String(projects.length).padStart(2, '0')}</span></h2></div>
                  <button className="text-button" onClick={() => setCurrentView('projects')}>All projects <Icon name="arrow" size={14} /></button>
                </div>
                {projects.length > 0
                  ? <div className="project-grid">{projects.slice(0, 3).map((project) => <ProjectCard key={project.id} project={project} onOpen={() => { setActiveProjectId(project.id); setCurrentView('projects') }} />)}</div>
                  : <div className="project-empty-inline"><span>No projects yet</span><button className="text-button" onClick={() => { setProjectError(''); setIsProjectOpen(true) }}>Create your first project <Icon name="arrow" size={14} /></button></div>}
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
                  {apps.slice(0, 4).map((app) => <ApplicationCard key={app.id} app={app} collections={collectionOptions} onFavorite={toggleFavorite} onCollectionChange={assignCollection} onLaunch={recordAppLaunch} onOpenFolder={browseLocalFolder} onDelete={deleteApplication} onCheck={checkApplication} isChecking={checkingAppId === app.id} isCheckPending={Boolean(checkingAppId)} checkError={checkError?.appId === app.id ? checkError.message : ''} />)}
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
                  {collections.includes(activeCollection) && <button className="outline-button collection-create-button" onClick={() => deleteCollection(activeCollection)} aria-label={`Delete collection ${activeCollection}`} title={`Delete ${activeCollection} and move its applications to Unfiled`}>
                    <Icon name="trash" size={13} /> Delete collection
                  </button>}
                  <div className="view-toggle" aria-label="Application layout">
                    <button className={layout === 'grid' ? 'selected' : ''} onClick={() => setLayout('grid')} aria-label="Grid view"><Icon name="grid" size={16} /></button>
                    <button className={layout === 'list' ? 'selected' : ''} onClick={() => setLayout('list')} aria-label="List view"><Icon name="layers" size={16} /></button>
                  </div>
                </div>
              </div>
              {filteredApps.length > 0 ? <div className={`app-grid library-grid ${layout === 'list' ? 'list-layout' : ''}`}>{filteredApps.map((app) => <ApplicationCard key={app.id} app={app} collections={collectionOptions} onFavorite={toggleFavorite} onCollectionChange={assignCollection} onLaunch={recordAppLaunch} onOpenFolder={browseLocalFolder} onDelete={deleteApplication} onCheck={checkApplication} isChecking={checkingAppId === app.id} isCheckPending={Boolean(checkingAppId)} checkError={checkError?.appId === app.id ? checkError.message : ''} />)}</div> : <div className="empty-state"><span><Icon name="search" size={22} /></span><h3>No applications found</h3><p>Try another search or add a new application to your library.</p><button className="primary-button" onClick={() => setIsAddOpen(true)}><Icon name="plus" size={16} /> Add application</button></div>}
              <footer className="page-footer"><span>{filteredApps.length} OF {apps.length} APPLICATIONS</span><span>Local workspace · Integrations not connected</span></footer>
            </>
          )}

          {currentView === 'projects' && (
            <>
              <section className="welcome-row compact-welcome">
                <div>
                  {activeProject && <button className="text-button project-back-button" onClick={() => setActiveProjectId(null)}><Icon name="chevron" size={14} /> All projects</button>}
                  <div className="eyebrow"><span className="eyebrow-line" /> PROJECT WORKSPACE</div>
                  <h1>{activeProject?.name ?? 'Projects'}</h1>
                  <p className="welcome-subtitle">{activeProject?.description || (activeProject ? 'Keep project work and tasks organized in one place.' : 'Create projects and track the work moving them forward.')}</p>
                </div>
                {activeProject
                  ? <div className="project-header-actions"><button className="outline-button danger-outline" onClick={() => deleteProject(activeProject.id)}>Delete project</button><button className="outline-button" onClick={() => { setBugError(''); setIsBugOpen(true) }}><Icon name="plus" size={17} /> Report bug</button><button className="primary-button" onClick={() => { setTaskError(''); setIsTaskOpen(true) }}><Icon name="plus" size={17} /> Add task</button></div>
                  : <button className="primary-button" onClick={() => { setProjectError(''); setIsProjectOpen(true) }}><Icon name="plus" size={17} /> New project</button>}
              </section>
              {activeProject ? (
                <>
                  <div className="project-summary-row">
                    <div className="project-summary-card"><span>TASKS</span><strong>{activeProject.tasks.length}</strong></div>
                    <div className="project-summary-card"><span>COMPLETED</span><strong>{activeProject.tasks.filter((task) => task.status === 'done').length}</strong></div>
                    <div className="project-summary-card"><span>PROGRESS</span><strong>{projectProgress(activeProject)}%</strong></div>
                  </div>
                  <div className="task-list-heading"><h2>Project tasks</h2><span>Saved on this device</span></div>
                  {activeProject.tasks.length > 0 ? (
                    <ul className="project-task-list">
                      {activeProject.tasks.map((task) => (
                        <li className={`project-task-row ${task.status === 'done' ? 'task-complete' : ''}`} key={task.id}>
                          <div className="task-title-cell"><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}{(task.startDate || task.dueDate) && <span>{task.startDate ? `Starts ${formatDueDate(task.startDate)}` : ''}{task.startDate && task.dueDate ? ' · ' : ''}{task.dueDate ? `Due ${formatDueDate(task.dueDate)}` : ''}</span>}</div>
                          <span className={`task-priority priority-${task.priority}`}>{task.priority}</span>
                          <AssigneeInput key={`${task.id}-${task.assignee}`} title={task.title} assignee={task.assignee} onSave={(assignee) => updateTask(activeProject.id, task.id, { assignee })} />
                          <select className="task-status-select" aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => updateTask(activeProject.id, task.id, { status: event.target.value as ProjectTask['status'] })}>
                            <option value="todo">To do</option><option value="in-progress">In progress</option><option value="done">Done</option>
                          </select>
                          <button className="task-delete-button" aria-label={`Delete ${task.title}`} onClick={() => deleteTask(activeProject.id, task.id)}><Icon name="close" size={15} /></button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="empty-state project-task-empty"><span><Icon name="check" size={22} /></span><h3>No tasks yet</h3><p>Add the first task to start tracking this project.</p><button className="primary-button" onClick={() => { setTaskError(''); setIsTaskOpen(true) }}><Icon name="plus" size={16} /> Add a task</button></div>
                  )}
                  <div className="task-list-heading bug-list-heading"><h2>Reported bugs</h2><div className="bug-list-controls"><label><span className="visually-hidden">Filter bugs by category</span><select className="form-input bug-category-filter" aria-label="Filter bugs by category" value={bugCategoryFilter} onChange={(event) => setBugCategoryFilter(event.target.value === 'all' ? 'all' : isBugCategory(event.target.value) ? event.target.value : 'all')}><option value="all">All categories</option>{bugCategories.map((item) => <option key={item} value={item}>{formatBugCategory(item)}</option>)}</select></label><span>{activeProject.bugs.length} · Saved on this device</span></div></div>
                  {activeProject.bugs.length > 0 && visibleProjectBugs.length > 0 ? (
                    <ul className="project-task-list project-bug-list">
                      {visibleProjectBugs.map((bug) => (
                        <li className={`project-bug-row bug-${bug.status}`} key={bug.id}>
                          <div className="bug-copy"><div className="bug-title-line"><strong>{bug.title}</strong><span className={`bug-category category-${bug.category}`}>{formatBugCategory(bug.category)}</span><span className={`bug-severity severity-${bug.severity}`}>{bug.severity}</span></div><p>{bug.description || 'No description provided.'}</p>{bug.relatedUrl && <a className="bug-related-link" href={bug.relatedUrl} target="_blank" rel="noopener noreferrer"><Icon name="external" size={12} /> Related commit/deployment · {new URL(bug.relatedUrl).hostname}</a>}<time dateTime={bug.createdAt}>Reported {formatActivityTime(bug.createdAt)}</time></div>
                          <AssigneeInput key={`${bug.id}-${bug.assignee}`} title={bug.title} assignee={bug.assignee} inputClassName="task-status-select bug-assignee-input" formClassName="task-assignee-control bug-assignee-control" onSave={(assignee) => updateBugAssignee(activeProject.id, bug.id, assignee)} />
                          <input className="task-status-select bug-reminder-input" type="date" aria-label={`Reminder date for bug ${bug.title}`} value={bug.reminderDate} onChange={(event) => updateBugReminder(activeProject.id, bug.id, event.target.value)} />
                          <select className="task-status-select bug-status-select" aria-label={`Status for bug ${bug.title}`} value={bug.status} onChange={(event) => updateBug(activeProject.id, bug.id, event.target.value as BugStatus)}>
                            <option value="open">Open</option><option value="in-progress">In progress</option><option value="resolved">Resolved</option>
                          </select>
                          <button className="task-delete-button" aria-label={`Delete bug ${bug.title}`} onClick={() => deleteBug(activeProject.id, bug.id)}><Icon name="close" size={15} /></button>
                        </li>
                      ))}
                    </ul>
                  ) : activeProject.bugs.length > 0 ? (
                    <div className="empty-state project-task-empty bug-empty"><span><Icon name="search" size={22} /></span><h3>No bugs in this category</h3><p>Choose another category to see more bug reports.</p><button className="text-button" onClick={() => setBugCategoryFilter('all')}>Show all categories</button></div>
                  ) : (
                    <div className="empty-state project-task-empty bug-empty"><span><Icon name="pulse" size={22} /></span><h3>No bugs reported</h3><p>Keep track of problems found in this project.</p><button className="outline-button" onClick={() => { setBugError(''); setIsBugOpen(true) }}><Icon name="plus" size={16} /> Report a bug</button></div>
                  )}
                </>
              ) : projects.length > 0 ? (
                <div className="project-grid project-library">{projects.map((project) => <ProjectCard key={project.id} project={project} onOpen={() => setActiveProjectId(project.id)} />)}</div>
              ) : (
                <div className="empty-state project-empty-state"><span><Icon name="folder" size={22} /></span><h3>Your project space is ready</h3><p>Create a project, then add tasks and track progress as work gets done.</p><button className="primary-button" onClick={() => { setProjectError(''); setIsProjectOpen(true) }}><Icon name="plus" size={16} /> Create a project</button></div>
              )}
            </>
          )}

          {currentView === 'activity' && (
            <>
              <section className="welcome-row compact-welcome">
                <div><div className="eyebrow"><span className="eyebrow-line" /> WORKSPACE TIMELINE</div><h1>Activity</h1><p className="welcome-subtitle">A running history of changes saved in this browser.</p></div>
                <div className="activity-actions">
                  <label className="activity-filter-label"><span className="visually-hidden">Filter activity</span>
                    <select className="form-input" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as 'all' | ActivityCategory)}>
                      <option value="all">All activity</option><option value="application">Applications</option><option value="project">Projects</option><option value="task">Tasks</option><option value="bug">Bugs</option>
                    </select>
                  </label>
                  <button className="outline-button" onClick={clearActivity} disabled={activities.length === 0}>Clear activity</button>
                </div>
              </section>
              <div className="panel timeline-panel">
                {filteredActivities.length > 0
                  ? filteredActivities.map((item) => <div className="timeline-item" key={item.id}><div className={`activity-icon ${activityColor(item.category)}`}><Icon name={activityIcon(item.category)} size={15} /></div><div className="timeline-copy"><strong>{item.title}</strong><p>{item.detail}</p></div><time dateTime={item.createdAt}>{formatActivityTime(item.createdAt)}</time></div>)
                  : <div className="timeline-empty">{activities.length === 0 ? 'Workspace changes will appear here as you add applications, organize collections, and update projects.' : 'No activity matches this filter.'}</div>}
              </div>
            </>
          )}

          {currentView === 'settings' && (
            <>
              <section className="welcome-row compact-welcome">
                <div><div className="eyebrow"><span className="eyebrow-line" /> WORKSPACE PREFERENCES</div><h1>Settings</h1><p className="welcome-subtitle">Manage your local profile, appearance, and workspace backup.</p></div>
              </section>
              <div className="settings-grid">
                <section className="panel settings-card" aria-labelledby="settings-profile-heading">
                  <div className="section-kicker">PROFILE</div>
                  <h2 id="settings-profile-heading">Your profile</h2>
                  {authUser
                    ? <div className="settings-account"><strong>{profileName}</strong><span>{authUser.email ?? 'Google account'}</span><p>Your profile name comes from Google while signed in.</p></div>
                    : <form onSubmit={saveLocalDisplayName}>
                        <label className="form-label" htmlFor="local-display-name">Display name</label>
                        <input id="local-display-name" className="form-input" value={displayNameDraft} onChange={(event) => setDisplayNameDraft(event.target.value)} maxLength={60} required />
                        {displayNameError && <p className="form-error" role="alert">{displayNameError}</p>}
                        <button className="primary-button settings-save-button" type="submit">Save profile</button>
                      </form>}
                </section>
                <section className="panel settings-card" aria-labelledby="settings-appearance-heading">
                  <div className="section-kicker">APPEARANCE</div>
                  <h2 id="settings-appearance-heading">Theme preference</h2>
                  <p>Choose a fixed theme or follow your device setting.</p>
                  <div className="settings-theme-options" role="group" aria-label="Theme preference">
                    {(['system', 'light', 'dark'] as const).map((preference) => <button key={preference} type="button" className={themePreference === preference ? 'selected' : ''} aria-pressed={themePreference === preference} onClick={() => setThemePreference(preference)}>{preference[0].toUpperCase() + preference.slice(1)}</button>)}
                  </div>
                  <h2 className="settings-font-heading">Color scheme</h2>
                  <p>Pick a tech-inspired accent palette for controls, highlights, and focus states.</p>
                  <div className="settings-palette-options" role="group" aria-label="Color scheme">
                    {accentPalettes.map((palette) => (
                      <button
                        key={palette.id}
                        type="button"
                        className={accentPreference === palette.id ? 'selected' : ''}
                        aria-pressed={accentPreference === palette.id}
                        onClick={() => setAccentPreference(palette.id)}
                      >
                        <span className="settings-palette-swatch" style={{ backgroundColor: palette.color }} />
                        {palette.name}
                      </button>
                    ))}
                  </div>
                  <h2 className="settings-font-heading">Interface font</h2>
                  <p>Choose a readable system face or a code-inspired monospace style.</p>
                  <div className="settings-theme-options settings-font-options" role="group" aria-label="Interface font">
                    {(['system', 'code', 'terminal'] as const).map((preference) => <button key={preference} type="button" className={fontPreference === preference ? 'selected' : ''} aria-pressed={fontPreference === preference} onClick={() => setFontPreference(preference)}>{preference === 'system' ? 'System' : preference === 'code' ? 'Code' : 'Terminal'}</button>)}
                  </div>
                </section>
                <section className="panel settings-card settings-data-card" aria-labelledby="settings-data-heading">
                  <div className="section-kicker">DATA & PRIVACY</div>
                  <h2 id="settings-data-heading">Workspace data</h2>
                  <p>{authUser ? 'Your data is scoped to this account in this browser, but is not synced to PostgreSQL.' : 'Your applications, projects, tasks, bugs, and activity are stored in this browser.'}</p>
                  <div className="settings-data-counts"><span>{apps.length} applications</span><span>{projects.length} projects</span><span>{activities.length} activity events</span></div>
                  <button className="outline-button" type="button" onClick={exportWorkspaceData}>Export workspace backup</button>
                  <small>Local folder permissions are not included in the backup. Files are never uploaded by this export.</small>
                </section>
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
              <input id="app-url" className="form-input" type="url" placeholder="https://example.com" value={appUrl} onChange={(event) => {
                websiteMetadataLookup.current?.controller.abort()
                websiteMetadataLookup.current = null
                setWebsiteMetadataLoading(false)
                setWebsiteMetadataTitle('')
                setWebsiteMetadataUrl('')
                setWebsiteMetadataError('')
                setAppUrl(event.target.value)
              }} onBlur={(event) => previewWebsiteTitle(event.target.value)} />
              {websiteMetadataLoading && <p className="metadata-hint">Looking up the website title…</p>}
              {!websiteMetadataLoading && websiteMetadataTitle && <p className="metadata-hint">Website title found: {websiteMetadataTitle}</p>}
              {!websiteMetadataLoading && websiteMetadataError && <p className="metadata-error">{websiteMetadataError}</p>}
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
              <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setIsAddOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={isAddingApplication}><Icon name="plus" size={16} /> {isAddingApplication ? 'Adding…' : 'Add to library'}</button></div>
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

      {isProjectOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsProjectOpen(false) }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
            <div className="modal-heading"><div><div className="section-kicker">PROJECT WORKSPACE</div><h2 id="project-modal-title">Create a project</h2></div><button className="icon-button" onClick={() => setIsProjectOpen(false)} aria-label="Close dialog"><Icon name="close" size={19} /></button></div>
            <p className="modal-intro">Start a project and keep its tasks and progress together. Project data is saved in this browser.</p>
            <form onSubmit={createProject}>
              <label className="form-label" htmlFor="project-name">Project name</label>
              <input id="project-name" className="form-input" type="text" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Website refresh" maxLength={60} required />
              <label className="form-label" htmlFor="project-description">Description <span>OPTIONAL</span></label>
              <textarea id="project-description" className="form-input project-description-input" value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="What is this project working toward?" maxLength={240} />
              {projectError && <p className="form-error" role="alert">{projectError}</p>}
              <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setIsProjectOpen(false)}>Cancel</button><button type="submit" className="primary-button"><Icon name="plus" size={16} /> Create project</button></div>
            </form>
            <div className="modal-footnote"><Icon name="check" size={14} /> Stored locally on this device</div>
          </section>
        </div>
      )}

      {isTaskOpen && activeProject && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsTaskOpen(false) }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
            <div className="modal-heading"><div><div className="section-kicker">{activeProject.name}</div><h2 id="task-modal-title">Add a task</h2></div><button className="icon-button" onClick={() => setIsTaskOpen(false)} aria-label="Close dialog"><Icon name="close" size={19} /></button></div>
            <p className="modal-intro">Add a task to track the next piece of work in this project.</p>
            <form onSubmit={createTask}>
              <label className="form-label" htmlFor="task-title">Task</label>
              <input id="task-title" className="form-input" type="text" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="e.g. Review the first draft" maxLength={120} required />
              <label className="form-label" htmlFor="task-description">Description <span>OPTIONAL</span></label>
              <textarea id="task-description" className="form-input project-description-input" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="What needs to be done?" maxLength={1000} />
              <label className="form-label" htmlFor="task-assignee">Responsible developer <span>OPTIONAL</span></label>
              <input id="task-assignee" className="form-input" type="text" value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)} placeholder="Developer name" maxLength={80} />
              <label className="form-label" htmlFor="task-priority">Priority</label>
              <select id="task-priority" className="form-input" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as ProjectTask['priority'])}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
              <label className="form-label" htmlFor="task-start-date">Start date <span>OPTIONAL</span></label>
              <input id="task-start-date" className="form-input" type="date" value={taskStartDate} onChange={(event) => setTaskStartDate(event.target.value)} />
              <label className="form-label" htmlFor="task-due-date">Due date <span>OPTIONAL</span></label>
              <input id="task-due-date" className="form-input" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
              {taskError && <p className="form-error" role="alert">{taskError}</p>}
              <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setIsTaskOpen(false)}>Cancel</button><button type="submit" className="primary-button"><Icon name="plus" size={16} /> Add task</button></div>
            </form>
            <div className="modal-footnote"><Icon name="check" size={14} /> Stored locally on this device</div>
          </section>
        </div>
      )}
      {isBugOpen && activeProject && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsBugOpen(false) }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="bug-modal-title">
            <div className="modal-heading"><div><div className="section-kicker">{activeProject.name}</div><h2 id="bug-modal-title">Report a bug</h2></div><button className="icon-button" onClick={() => setIsBugOpen(false)} aria-label="Close dialog"><Icon name="close" size={19} /></button></div>
            <p className="modal-intro">Describe an issue to keep it visible with this project's work.</p>
            <form onSubmit={createBug}>
              <label className="form-label" htmlFor="bug-title">Bug title</label>
              <input id="bug-title" className="form-input" type="text" value={bugTitle} onChange={(event) => setBugTitle(event.target.value)} placeholder="e.g. Save button does not respond" maxLength={120} required />
              <label className="form-label" htmlFor="bug-description">Description <span>OPTIONAL</span></label>
              <textarea id="bug-description" className="form-input project-description-input" value={bugDescription} onChange={(event) => setBugDescription(event.target.value)} placeholder="What happened, and what did you expect?" maxLength={1000} />
              <label className="form-label" htmlFor="bug-category">Category</label>
              <select id="bug-category" className="form-input" value={bugCategory} onChange={(event) => setBugCategory(isBugCategory(event.target.value) ? event.target.value : 'other')}>
                {bugCategories.map((item) => <option key={item} value={item}>{formatBugCategory(item)}</option>)}
              </select>
              <label className="form-label" htmlFor="bug-severity">Severity</label>
              <select id="bug-severity" className="form-input" value={bugSeverity} onChange={(event) => setBugSeverity(event.target.value as BugSeverity)}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
              <label className="form-label" htmlFor="bug-assignee">Responsible developer <span>OPTIONAL</span></label>
              <input id="bug-assignee" className="form-input" type="text" value={bugAssignee} onChange={(event) => setBugAssignee(event.target.value)} placeholder="Developer name" maxLength={80} />
              <label className="form-label" htmlFor="bug-related-url">Related commit or deployment URL <span>OPTIONAL</span></label>
              <input id="bug-related-url" className="form-input" type="url" value={bugRelatedUrl} onChange={(event) => setBugRelatedUrl(event.target.value)} placeholder="https://github.com/... or deployment URL" />
              <label className="form-label" htmlFor="bug-reminder-date">Reminder date <span>OPTIONAL</span></label>
              <input id="bug-reminder-date" className="form-input" type="date" value={bugReminderDate} onChange={(event) => setBugReminderDate(event.target.value)} />
              {bugError && <p className="form-error" role="alert">{bugError}</p>}
              <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setIsBugOpen(false)}>Cancel</button><button type="submit" className="primary-button"><Icon name="plus" size={16} /> Report bug</button></div>
            </form>
            <div className="modal-footnote"><Icon name="check" size={14} /> Stored locally on this device</div>
          </section>
        </div>
      )}
      {folderContents && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFolderContents(null) }}>
          <section className="modal-card folder-browser-modal" role="dialog" aria-modal="true" aria-labelledby="folder-browser-title">
            <div className="modal-heading">
              <div><div className="section-kicker">LOCAL FOLDER</div><h2 id="folder-browser-title">{folderContents.appName}</h2></div>
              <button id="close-folder-browser" className="icon-button" onClick={() => setFolderContents(null)} aria-label="Close folder browser"><Icon name="close" size={19} /></button>
            </div>
            <p className="modal-intro">Read-only listing from the folder linked on this device. CTRLSPACE does not copy or upload these files.</p>
            {folderLoading
              ? <p className="folder-browser-status" role="status">Opening folder…</p>
              : folderContents.error
                ? <p className="form-error" role="alert">{folderContents.error}</p>
                : folderContents.entries.length > 0
                  ? <>
                      <ul className="folder-browser-list">
                        {folderContents.entries.map((entry) => <li key={`${entry.kind}-${entry.name}`}><Icon name={entry.kind === 'directory' ? 'folder' : 'layers'} size={14} /><span>{entry.name}</span><small>{entry.kind === 'directory' ? 'FOLDER' : 'FILE'}</small></li>)}
                      </ul>
                      {folderContents.hasMore && <p className="folder-browser-status">Showing the first 200 items.</p>}
                    </>
                  : <p className="folder-browser-status">This folder is empty.</p>}
            <div className="modal-actions"><button className="primary-button" onClick={() => setFolderContents(null)}>Done</button></div>
          </section>
        </div>
      )}
    </div>
  )
}

function activityIcon(category: ActivityCategory) {
  return category === 'application' ? 'layers' : category === 'project' ? 'folder' : category === 'bug' ? 'pulse' : 'spark'
}

function activityColor(category: ActivityCategory) {
  return category === 'application' ? 'blue' : category === 'project' ? 'violet' : category === 'bug' ? 'orange' : 'mint'
}

function formatBugCategory(category: BugCategory) {
  return category === 'interface' ? 'Interface' : category === 'functionality' ? 'Functionality' : category === 'performance' ? 'Performance' : category === 'security' ? 'Security' : category === 'data' ? 'Data' : category === 'compatibility' ? 'Compatibility' : 'Other'
}

function formatActivityTime(value: string) {
  const timestamp = new Date(value)
  const elapsedMinutes = Math.floor((Date.now() - timestamp.getTime()) / 60000)
  if (elapsedMinutes < 1) return 'Just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 7) return `${elapsedDays}d ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(timestamp)
}

function Metric({ icon, label, value, trend, tone }: { icon: string; label: string; value: string; trend: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon name={icon} size={17} /></div><div className="metric-label">{label}</div><div className="metric-bottom"><strong>{value}</strong><span>{trend}</span></div></article>
}

function AuthGate({ loading = false, error = '', onSignIn, onSignOut }: {
  loading?: boolean
  error?: string
  onSignIn?: () => Promise<void>
  onSignOut?: () => Promise<void>
}) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <img className="brand-logo" src="/ctrlspace-mark.png" alt="" />
        <div className="eyebrow"><span className="eyebrow-line" /> SECURE WORKSPACE</div>
        <h1>Welcome to CTRLSPACE</h1>
        <p className="welcome-subtitle">Sign in with your Google account to open your personal workspace.</p>
        {loading
          ? <p className="auth-loading" role="status">Checking your secure session…</p>
          : error && <p className="form-error auth-error" role="alert">{error}</p>}
        {onSignIn && <button className="primary-button auth-submit" onClick={() => { void onSignIn() }}>Continue with Google</button>}
        {onSignOut && <button className="outline-button auth-submit" onClick={() => { void onSignOut() }}>Sign out and retry</button>}
        <p className="auth-note">Your local workspace data is kept separately for each signed-in account on this browser.</p>
      </section>
    </main>
  )
}

function ApplicationCard({ app, collections, onFavorite, onCollectionChange, onLaunch, onOpenFolder, onDelete, onCheck, isChecking, isCheckPending, checkError }: {
  app: AppRecord
  collections: string[]
  onFavorite: (id: string) => void
  onCollectionChange: (id: string, collection: string) => void
  onLaunch: (app: AppRecord, destination: 'website' | 'repository') => void
  onOpenFolder: (app: AppRecord) => void
  onDelete: (id: string) => void
  onCheck: (app: AppRecord) => void
  isChecking: boolean
  isCheckPending: boolean
  checkError: string
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
      <div className="application-title-row"><h3>{app.name}</h3><span className={`tiny-status ${app.status}`} title={app.statusDetail || (app.status === 'unknown' ? 'Not checked yet' : app.status)} /></div>
      <div className="application-meta"><span>{app.category}</span><span className="meta-separator">·</span><span title={app.repositoryDescription}>{app.url ? new URL(app.url).hostname : app.repositoryFullName || (app.repositoryUrl ? new URL(app.repositoryUrl).hostname : app.folderName || 'No source connected')}</span></div>
      <div className="application-card-footer">
        <span className={`app-status-text ${app.status}`} title={app.lastCheckedAt ? `Last checked ${new Date(app.lastCheckedAt).toLocaleString()}` : undefined}>
          {app.status === 'unknown' ? 'NOT CHECKED' : app.status.toUpperCase()}{app.responseTimeMs !== undefined ? ` · ${app.responseTimeMs} MS` : ''}
        </span>
        <div className="application-launch-actions">
          {app.url && <button type="button" className="monitor-check-button" onClick={() => onCheck(app)} disabled={isCheckPending} aria-label={isChecking ? `Checking ${app.name}` : `Check status of ${app.name}`} title={isChecking ? 'Checking website' : 'Check website now'}><Icon name="pulse" size={14} /> {isChecking ? 'Checking…' : 'Check'}</button>}
          <button type="button" className="application-remove-button" onClick={() => onDelete(app.id)} aria-label={`Remove ${app.name} from library`} title="Remove application"><Icon name="trash" size={14} /></button>
          {app.folderName && <button type="button" className="folder-browse-button" onClick={() => onOpenFolder(app)} aria-label={`Browse ${app.folderName} folder`} title={`Browse ${app.folderName}`}><Icon name="folder" size={14} /></button>}
          {app.folderName && <span className="local-folder-badge" title={`Folder linked on this device: ${app.folderName}`}>LOCAL FOLDER</span>}
          {app.repositoryUrl && <a href={app.repositoryUrl} target="_blank" rel="noreferrer" className="launch-button" aria-label={`Open ${app.name} repository`} title="Open repository" onClick={() => onLaunch(app, 'repository')}><Icon name="layers" size={15} /></a>}
          {app.url ? <a href={app.url} target="_blank" rel="noreferrer" className="launch-button" aria-label={`Open ${app.name}`} title="Open website" onClick={() => onLaunch(app, 'website')}><Icon name="external" size={15} /></a> : !app.repositoryUrl && !app.folderName && <span className="launch-disabled" title="Add a website URL to launch this application"><Icon name="external" size={15} /></span>}
        </div>
      </div>
      {checkError && <p className="status-check-error" role="alert">{checkError}</p>}
      {app.lastCheckedAt && <time className="status-checked-at" dateTime={app.lastCheckedAt}>Checked {formatActivityTime(app.lastCheckedAt)} · {app.statusDetail}</time>}
    </article>
  )
}

function projectProgress(project: Project) {
  if (project.tasks.length === 0) return 0
  return Math.round((project.tasks.filter((task) => task.status === 'done').length / project.tasks.length) * 100)
}

function formatDueDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysBetweenDateKeys(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  const fromTime = Date.UTC(fromYear, fromMonth - 1, fromDay)
  const toTime = Date.UTC(toYear, toMonth - 1, toDay)
  return Math.round((toTime - fromTime) / 86400000)
}

function formatReminderDue(daysUntilDue: number, dueDate: string) {
  if (daysUntilDue < 0) return `Overdue · ${formatDueDate(dueDate)}`
  if (daysUntilDue === 0) return 'Due today'
  if (daysUntilDue === 1) return 'Due tomorrow'
  return `Due in ${daysUntilDue} days`
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const completedTasks = project.tasks.filter((task) => task.status === 'done').length
  const status = project.tasks.length === 0 ? 'Planning' : completedTasks === project.tasks.length ? 'Complete' : 'In progress'
  const initials = project.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  return (
    <article className="project-card project-card-action">
      <div className="project-card-header"><div className={`project-avatar ${project.color}`}>{initials}</div><span className="project-task-count">{project.tasks.length} {project.tasks.length === 1 ? 'task' : 'tasks'}</span></div>
      <div className="project-card-title"><h3>{project.name}</h3><span className="project-status"><i />{status}</span></div>
      <p className="project-description">{project.description || 'No description added.'}</p>
      <div className="progress-heading"><span>Project progress</span><strong>{projectProgress(project)}%</strong></div>
      <div className="progress-track"><span style={{ width: `${projectProgress(project)}%` }} /></div>
      <div className="project-card-footer"><span>{completedTasks} of {project.tasks.length} complete</span><button className="text-button" onClick={onOpen}>Open project <Icon name="arrow" size={13} /></button></div>
    </article>
  )
}

function AssigneeInput({ title, assignee: savedAssignee, inputClassName = 'task-status-select task-assignee-input', formClassName = 'task-assignee-control', onSave }: {
  title: string
  assignee: string
  inputClassName?: string
  formClassName?: string
  onSave: (assignee: string) => void
}) {
  const [assignee, setAssignee] = useState(savedAssignee)
  const isUnchanged = assignee.trim() === savedAssignee.trim()
  return (
    <form className={formClassName} onSubmit={(event) => { event.preventDefault(); if (!isUnchanged) onSave(assignee) }}>
      <input className={inputClassName} type="text" aria-label={`Developer responsible for ${title}`} value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Assign developer…" maxLength={80} />
      <button className="task-assignee-save" type="submit" aria-label={`Save assignment for ${title}`} disabled={isUnchanged}><Icon name="check" size={14} /></button>
    </form>
  )
}

export default App
