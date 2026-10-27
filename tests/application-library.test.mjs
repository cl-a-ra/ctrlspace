import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterApplications,
  getLibraryFolders,
  isInactiveApplication,
  normalizeLibraryFolder,
  parseLibraryTags,
  createLibraryMetadata,
  createApplicationActivityRecord,
  getApplicationActivity,
  getApplicationProject,
  groupProjectsByTeam,
  getPersonalRecommendations,
} from '../src/application-library.mjs'

const apps = [
  {
    id: 'a', name: 'Moonlight', websiteTitle: 'Moonlight Portal', category: 'Design', collection: 'Client',
    url: 'https://moonlight.example', repositoryUrl: 'https://github.com/acme/moonlight', repositoryFullName: 'acme/moonlight',
    status: 'online', tags: ['Client', 'Marketing'], libraryFolder: 'Products/Client', owner: 'Ana', projectId: 'p1',
    lastUpdatedAt: '2026-10-01', lastDeployedAt: '2026-10-10',
  },
  {
    id: 'b', name: 'Archive', category: 'Documentation', collection: '', url: '', repositoryUrl: '', repositoryFullName: '',
    status: 'offline', tags: ['legacy'], libraryFolder: 'Archive', owner: 'Bea', projectId: 'p2', lastUpdatedAt: '2026-01-01',
  },
  {
    id: 'c', name: 'New tool', category: 'Productivity', collection: '', url: '', repositoryUrl: '', repositoryFullName: '',
    status: 'unknown', tags: [], libraryFolder: '', owner: '', projectId: '',
  },
]

const projects = [{ id: 'p1', name: 'Moonlight redesign' }, { id: 'p2', name: 'Archive cleanup' }]
const now = new Date('2026-10-26T00:00:00.000Z')

test('parses tags, trims spaces, and deduplicates without case sensitivity', () => {
  assert.deepEqual(parseLibraryTags(' client, Marketing,client, , MARKETING '), ['client', 'Marketing'])
})

test('normalizes nested library folder paths and rejects traversal segments', () => {
  assert.equal(normalizeLibraryFolder(' Products\\Client /  Design '), 'Products/Client/Design')
  assert.equal(normalizeLibraryFolder('  '), '')
  assert.throws(() => normalizeLibraryFolder('Products/../Private'), /folder path/i)
  assert.throws(() => normalizeLibraryFolder('Products/./Private'), /folder path/i)
})

test('lists parent folders for nested library paths', () => {
  assert.deepEqual(getLibraryFolders(apps), ['Archive', 'Products', 'Products/Client'])
})

test('search includes tags, folder paths, owner, website title, project, and repository identity', () => {
  for (const query of ['marketing', 'Products/Client', 'ana', 'Moonlight Portal', 'Moonlight redesign', 'acme/moonlight']) {
    assert.deepEqual(filterApplications(apps, { query }, projects, now).map((app) => app.id), ['a'])
  }
})

test('combines status, category, collection, tag, nested folder, project, owner, and recent-maintenance filters', () => {
  const filtered = filterApplications(apps, {
    status: 'online', category: 'Design', collection: 'Client', tag: 'client', folder: 'Products',
    projectId: 'p1', owner: 'ana', maintenance: 'recent-30',
  }, projects, now)
  assert.deepEqual(filtered.map((app) => app.id), ['a'])
})

test('identifies old known maintenance dates but leaves unknown dates unclassified', () => {
  assert.equal(isInactiveApplication(apps[1], now), true)
  assert.equal(isInactiveApplication(apps[2], now), false)
  assert.equal(isInactiveApplication({ lastDeployedAt: '2026-07-28' }, now), false)
  assert.equal(isInactiveApplication({ lastDeployedAt: '2026-07-27' }, now), true)
})

test('filters for inactive and unknown maintenance dates without treating missing dates as stale', () => {
  assert.deepEqual(filterApplications(apps, { maintenance: 'inactive' }, projects, now).map((app) => app.id), ['b'])
  assert.deepEqual(filterApplications(apps, { maintenance: 'unknown' }, projects, now).map((app) => app.id), ['c'])
})

test('validates and normalizes manually entered library metadata', () => {
  assert.deepEqual(createLibraryMetadata({
    libraryFolder: ' Products\\Client ',
    tags: ' client, Marketing,client ',
    owner: ' Ana ',
    projectId: 'p1',
    lastUpdatedAt: '2026-10-01',
    lastDeployedAt: '2026-10-10',
  }), {
    libraryFolder: 'Products/Client', tags: ['client', 'Marketing'], owner: 'Ana', projectId: 'p1',
    lastUpdatedAt: '2026-10-01', lastDeployedAt: '2026-10-10',
  })
  assert.throws(() => createLibraryMetadata({ libraryFolder: 'Root/../Private' }), /folder path/i)
  assert.throws(() => createLibraryMetadata({ lastUpdatedAt: '2026-02-30' }), /date/i)
  assert.throws(() => createLibraryMetadata({ tags: Array.from({ length: 21 }, (_, index) => `tag${index}`).join(',') }), /20 tags/i)
  assert.throws(() => createLibraryMetadata({ owner: 'x'.repeat(81) }), /80 characters/i)
})

test('filters application activity only by explicit app ID, leaving legacy events unattributed', () => {
  const applicationEvent = createApplicationActivityRecord({
    id: 'event-1', appId: 'app-1', title: 'Opened website', detail: 'Moonlight', createdAt: '2026-10-26T12:00:00.000Z',
  })
  const otherApplicationEvent = createApplicationActivityRecord({
    id: 'event-2', appId: 'app-2', title: 'Checked website health', detail: 'Moonlight · online', createdAt: '2026-10-26T12:01:00.000Z',
  })
  const legacyEvent = { id: 'legacy', category: 'application', title: 'Opened website', detail: 'Moonlight', createdAt: '2026-10-25T12:00:00.000Z' }
  const unrelatedEvent = { id: 'task', category: 'task', appId: 'app-1', title: 'Updated task', detail: 'Project', createdAt: '2026-10-26T12:02:00.000Z' }

  assert.deepEqual(getApplicationActivity([applicationEvent, otherApplicationEvent, legacyEvent, unrelatedEvent], 'app-1'), [applicationEvent])
  assert.deepEqual(getApplicationActivity([applicationEvent, otherApplicationEvent, legacyEvent], 'missing-app'), [])
  assert.equal(Object.hasOwn(legacyEvent, 'appId'), false)
})

test('returns only the project explicitly linked to an application', () => {
  assert.equal(getApplicationProject(apps[0], projects), projects[0])
  assert.equal(getApplicationProject({ ...apps[0], projectId: 'missing' }, projects), null)
  assert.equal(getApplicationProject({ ...apps[0], projectId: '' }, projects), null)
})

test('groups projects by team with named teams first and unfiled last', () => {
  const teamProjects = [
    { id: 'p1', name: 'Website refresh', team: 'Engineering', description: '', color: 'violet', tasks: [], bugs: [] },
    { id: 'p2', name: 'Brand guidelines', team: 'Design', description: '', color: 'mint', tasks: [], bugs: [] },
    { id: 'p3', name: 'API cleanup', team: 'Engineering', description: '', color: 'blue', tasks: [], bugs: [] },
    { id: 'p4', name: 'Research spike', team: '', description: '', color: 'violet', tasks: [], bugs: [] },
  ]
  const grouped = groupProjectsByTeam(teamProjects)
  assert.deepEqual(grouped.map((group) => group.team), ['Design', 'Engineering', ''])
  assert.deepEqual(grouped.find((group) => group.team === 'Engineering').projects.map((project) => project.id), ['p1', 'p3'])
  assert.deepEqual(grouped.find((group) => group.team === 'Design').projects.map((project) => project.id), ['p2'])
  assert.deepEqual(grouped.find((group) => group.team === '').projects.map((project) => project.id), ['p4'])
})

test('groups an empty project list without error', () => {
  assert.deepEqual(groupProjectsByTeam([]), [])
})

test('recommends favorited apps not recently opened, sorted by name', () => {
  const allApps = [
    { id: 'a', name: 'Zeta App', favorite: true, lastOpenedAt: '' },
    { id: 'b', name: 'Alpha App', favorite: true, lastOpenedAt: '2026-10-26T10:00:00.000Z' },
    { id: 'c', name: 'Beta App', favorite: true, lastOpenedAt: '' },
    { id: 'd', name: 'Gamma App', favorite: false, lastOpenedAt: '' },
  ]
  const recentlyOpened = ['b']
  const recommended = getPersonalRecommendations(allApps, recentlyOpened)
  assert.deepEqual(recommended.map((app) => app.id), ['c', 'a'])
})

test('returns empty when no favorited apps exist', () => {
  const allApps = [
    { id: 'a', name: 'App A', favorite: false, lastOpenedAt: '' },
    { id: 'b', name: 'App B', favorite: false, lastOpenedAt: '' },
  ]
  assert.deepEqual(getPersonalRecommendations(allApps, []), [])
})

test('returns empty for an empty app list', () => {
  assert.deepEqual(getPersonalRecommendations([], []), [])
})
