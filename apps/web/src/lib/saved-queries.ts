const STORAGE_KEY = "muzli:saved-queries";

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  connectionId: string;
  createdAt: string;
}

function getKey(connectionId: string): string {
  return `${STORAGE_KEY}:${connectionId}`;
}

export function getSavedQueries(connectionId: string): SavedQuery[] {
  try {
    const stored = localStorage.getItem(getKey(connectionId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveQuery(connectionId: string, name: string, query: string): SavedQuery {
  const saved = getSavedQueries(connectionId);
  const entry: SavedQuery = {
    id: crypto.randomUUID(),
    name,
    query,
    connectionId,
    createdAt: new Date().toISOString(),
  };
  saved.unshift(entry);
  localStorage.setItem(getKey(connectionId), JSON.stringify(saved));
  return entry;
}

export function deleteSavedQuery(connectionId: string, queryId: string): void {
  const saved = getSavedQueries(connectionId).filter((q) => q.id !== queryId);
  localStorage.setItem(getKey(connectionId), JSON.stringify(saved));
}
