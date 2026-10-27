export type LibraryFilters = {
  query?: string
  category?: string
  collection?: string
  status?: string
  tag?: string
  folder?: string
  projectId?: string
  owner?: string
  maintenance?: string
}
export type LibraryProject = { id: string; name: string }
export function parseLibraryTags(value: unknown): string[]
export function normalizeLibraryFolder(value: unknown): string
export function createLibraryMetadata(input?: { libraryFolder?: unknown; tags?: unknown; owner?: unknown; projectId?: unknown; lastUpdatedAt?: unknown; lastDeployedAt?: unknown }): { libraryFolder?: string; tags?: string[]; owner?: string; projectId?: string; lastUpdatedAt?: string; lastDeployedAt?: string }
export function getLibraryFolders(applications: readonly { libraryFolder?: string }[]): string[]
export function isValidLibraryDate(value: unknown): boolean
export function isInactiveApplication(app: { lastUpdatedAt?: string; lastDeployedAt?: string }, now?: Date | string, inactiveDays?: number): boolean
export function filterApplications<T>(applications: readonly T[], filters?: LibraryFilters, projects?: readonly LibraryProject[], now?: Date | string): T[]
export function getApplicationProject<T extends { projectId?: string }, P extends { id: string }>(application: T, projects: readonly P[]): P | null
export function getApplicationActivity<T extends { category?: string; appId?: string }>(activities: readonly T[], appId: string): T[]
export type ApplicationActivityInput = { id: string; appId: string; title: string; detail: string; createdAt: string }
export function createApplicationActivityRecord(input: ApplicationActivityInput): { id: string; category: 'application'; appId: string; title: string; detail: string; createdAt: string }
export type ProjectTeamGroup = { team: string; projects: readonly { id: string; name: string; team?: string; tasks: readonly { status: string }[]; bugs: readonly { status: string }[] }[] }
export function groupProjectsByTeam(projects: readonly { id: string; name: string; team?: string; tasks: readonly { status: string }[]; bugs: readonly { status: string }[] }[]): ProjectTeamGroup[]

