const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function hasControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint < 32 || codePoint === 127) return true
  }
  return false
}

function parseDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return null
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null
  return timestamp
}

function maintenanceTimestamp(app) {
  return [parseDateOnly(app?.lastUpdatedAt), parseDateOnly(app?.lastDeployedAt)]
    .filter((value) => value !== null)
    .sort((left, right) => right - left)[0] ?? null
}

export function parseLibraryTags(value) {
  const unique = new Set()
  const tags = []
  for (const raw of String(value ?? '').split(',')) {
    const tag = raw.trim().replace(/\s+/g, ' ')
    const key = tag.toLocaleLowerCase()
    if (!tag || unique.has(key)) continue
    unique.add(key)
    tags.push(tag)
  }
  return tags
}

export function normalizeLibraryFolder(value) {
  const raw = String(value ?? '').trim().replace(/\\/g, '/')
  if (!raw) return ''
  if (hasControlCharacters(raw)) throw new Error('Enter a valid library folder path.')
  const parts = raw.split('/').map((part) => part.trim()).filter(Boolean)
  if (parts.length > 8 || parts.some((part) => part === '.' || part === '..' || part.length > 40)) {
    throw new Error('Library folder paths must use up to 8 names, each 40 characters or fewer, without . or .. segments.')
  }
  const normalized = parts.join('/')
  if (normalized.length > 180) throw new Error('Library folder paths must be 180 characters or fewer.')
  return normalized
}

export function getLibraryFolders(applications) {
  const folders = new Map()
  for (const app of applications) {
    let path
    try {
      path = normalizeLibraryFolder(app.libraryFolder)
    } catch {
      continue
    }
    if (!path) continue
    const parts = path.split('/')
    for (let index = 1; index <= parts.length; index += 1) {
      const folder = parts.slice(0, index).join('/')
      const key = folder.toLocaleLowerCase()
      if (!folders.has(key)) folders.set(key, folder)
    }
  }
  return [...folders.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
}

export function createLibraryMetadata(input = {}) {
  const libraryFolder = normalizeLibraryFolder(input.libraryFolder)
  const tags = parseLibraryTags(input.tags)
  if (tags.length > 20) throw new Error('Use no more than 20 tags per application.')
  if (tags.some((tag) => tag.length > 40)) throw new Error('Each tag must be 40 characters or fewer.')
  const owner = String(input.owner ?? '').trim()
  if (owner.length > 80) throw new Error('Owner labels must be 80 characters or fewer.')
  if (hasControlCharacters(owner)) throw new Error('Enter a valid owner label.')
  const projectId = String(input.projectId ?? '').trim()
  if (projectId.length > 128) throw new Error('Project identifiers are too long.')
  const lastUpdatedAt = String(input.lastUpdatedAt ?? '').trim()
  const lastDeployedAt = String(input.lastDeployedAt ?? '').trim()
  if (lastUpdatedAt && !isValidLibraryDate(lastUpdatedAt)) throw new Error('Enter a valid last updated date.')
  if (lastDeployedAt && !isValidLibraryDate(lastDeployedAt)) throw new Error('Enter a valid last deployed date.')
  return {
    libraryFolder: libraryFolder || undefined,
    tags: tags.length ? tags : undefined,
    owner: owner || undefined,
    projectId: projectId || undefined,
    lastUpdatedAt: lastUpdatedAt || undefined,
    lastDeployedAt: lastDeployedAt || undefined,
  }
}

export function isValidLibraryDate(value) {
  return value === undefined || value === null || value === '' || parseDateOnly(value) !== null
}

export function isInactiveApplication(app, now = new Date(), inactiveDays = 90) {
  const latestMaintenance = maintenanceTimestamp(app)
  const nowTimestamp = now instanceof Date ? now.getTime() : parseDateOnly(now)
  if (latestMaintenance === null || nowTimestamp === null || !Number.isFinite(nowTimestamp)) return false
  const ageInDays = Math.floor((nowTimestamp - latestMaintenance) / 86400000)
  return ageInDays > inactiveDays
}

function matchesMaintenanceFilter(app, maintenance, now) {
  if (!maintenance || maintenance === 'all') return true
  const latestMaintenance = maintenanceTimestamp(app)
  if (maintenance === 'unknown') return latestMaintenance === null
  if (maintenance === 'inactive') return isInactiveApplication(app, now)
  if (latestMaintenance === null) return false
  const nowTimestamp = now instanceof Date ? now.getTime() : parseDateOnly(now)
  if (nowTimestamp === null || !Number.isFinite(nowTimestamp)) return false
  const ageInDays = Math.floor((nowTimestamp - latestMaintenance) / 86400000)
  if (ageInDays < 0) return false
  const maxAge = ({ 'recent-30': 30, 'recent-90': 90, 'recent-180': 180 })[maintenance]
  return maxAge !== undefined && ageInDays <= maxAge
}

function isSameFolderOrDescendant(appFolder, selectedFolder) {
  const folder = String(appFolder ?? '').trim().toLocaleLowerCase()
  const selected = String(selectedFolder ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
  return !selected || folder === selected || folder.startsWith(`${selected}/`)
}

export function getApplicationProject(application, projects) {
  if (!application?.projectId) return null
  return projects.find((project) => project.id === application.projectId) ?? null
}

export function getApplicationActivity(activities, appId) {
  if (!appId) return []
  return activities.filter((activity) => activity.category === 'application' && activity.appId === appId)
}

export function createApplicationActivityRecord({ id, appId, title, detail, createdAt }) {
  return { id, category: 'application', appId, title, detail, createdAt }
}

export function filterApplications(applications, filters = {}, projects = [], now = new Date()) {
  const query = String(filters.query ?? '').trim().toLocaleLowerCase()
  const projectNames = new Map(projects.map((project) => [project.id, project.name]))
  const status = filters.status && filters.status !== 'all' ? filters.status : ''
  const category = filters.category && filters.category !== 'All applications' ? filters.category : ''
  const collection = filters.collection && filters.collection !== 'All collections' ? filters.collection : ''
  const selectedTag = String(filters.tag ?? '').trim().toLocaleLowerCase()
  const selectedFolder = String(filters.folder ?? '').trim()
  const selectedProject = String(filters.projectId ?? '').trim()
  const selectedOwner = String(filters.owner ?? '').trim().toLocaleLowerCase()

  return applications.filter((app) => {
    const tags = Array.isArray(app.tags) ? app.tags : []
    const projectName = projectNames.get(app.projectId) ?? ''
    if (query) {
      const searchable = [
        app.name, app.websiteTitle, app.category, app.collection, app.url, app.repositoryUrl,
        app.repositoryFullName, app.libraryFolder, app.owner, projectName, ...tags,
      ].filter((value) => typeof value === 'string').join(' ').toLocaleLowerCase()
      if (!searchable.includes(query)) return false
    }
    if (category && app.category !== category) return false
    if (collection && (collection === 'Unfiled' ? Boolean(app.collection) : app.collection !== collection)) return false
    if (status && app.status !== status) return false
    if (selectedTag && !tags.some((tag) => String(tag).toLocaleLowerCase() === selectedTag)) return false
    if (selectedFolder && !isSameFolderOrDescendant(app.libraryFolder, selectedFolder)) return false
    if (selectedProject && app.projectId !== selectedProject) return false
    if (selectedOwner && String(app.owner ?? '').trim().toLocaleLowerCase() !== selectedOwner) return false
    if (!matchesMaintenanceFilter(app, filters.maintenance, now)) return false
    return true
  })
}

export function groupProjectsByTeam(projects) {
  const byTeam = new Map()
  for (const project of projects) {
    const team = String(project.team ?? '').trim()
    if (!byTeam.has(team)) byTeam.set(team, [])
    byTeam.get(team).push(project)
  }
  const named = [...byTeam.entries()]
    .filter(([team]) => team)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const unfiled = byTeam.has('') ? [['', byTeam.get('')]] : []
  return [...named, ...unfiled].map(([team, projectList]) => ({
    team,
    projects: projectList,
  }))
}

export function getPersonalRecommendations(applications, recentlyOpenedIds = []) {
  const opened = new Set(recentlyOpenedIds)
  return applications
    .filter((app) => app.favorite && !opened.has(app.id))
    .sort((left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: 'base' }))
    .slice(0, 6)
}
