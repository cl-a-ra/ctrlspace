export type WorkspaceSnapshot = {
  schemaVersion: 1
  apps: unknown[]
  collections: string[]
  projects: unknown[]
  activity: unknown[]
}

export type WorkspaceSnapshotInput = {
  apps: unknown[]
  collections: string[]
  projects: unknown[]
  activity: unknown[]
}

export function createWorkspaceSnapshot(input: WorkspaceSnapshotInput): WorkspaceSnapshot {
  return {
    schemaVersion: 1,
    apps: input.apps,
    collections: input.collections,
    projects: input.projects,
    activity: input.activity,
  }
}

export function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const snapshot = value as Record<string, unknown>
  return snapshot.schemaVersion === 1
    && Array.isArray(snapshot.apps)
    && Array.isArray(snapshot.collections)
    && snapshot.collections.every((item) => typeof item === 'string')
    && Array.isArray(snapshot.projects)
    && Array.isArray(snapshot.activity)
}
