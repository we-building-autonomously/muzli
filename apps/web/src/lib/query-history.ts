const STORAGE_KEY = "muzli:query-history";
const MAX_ENTRIES_PER_CONNECTION = 50;

export interface QueryHistoryEntry {
  query: string;
  timestamp: string;
  executionTime?: number;
  rowCount?: number;
  error?: string;
}

function getKey(connectionId: string): string {
  return `${STORAGE_KEY}:${connectionId}`;
}

export function getQueryHistory(connectionId: string): QueryHistoryEntry[] {
  try {
    const stored = localStorage.getItem(getKey(connectionId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addQueryToHistory(
  connectionId: string,
  entry: QueryHistoryEntry
): void {
  try {
    const history = getQueryHistory(connectionId);
    // Don't add duplicate of the most recent query
    if (history.length > 0 && history[0].query.trim() === entry.query.trim()) {
      return;
    }
    history.unshift(entry);
    if (history.length > MAX_ENTRIES_PER_CONNECTION) {
      history.length = MAX_ENTRIES_PER_CONNECTION;
    }
    localStorage.setItem(getKey(connectionId), JSON.stringify(history));
  } catch {}
}

export function clearQueryHistory(connectionId: string): void {
  try {
    localStorage.removeItem(getKey(connectionId));
  } catch {}
}
