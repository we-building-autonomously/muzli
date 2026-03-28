import type { DatabaseConnection } from "@/types";
import type { DbMetadata } from "@/lib/sql-autocomplete";

const STORAGE_KEY = "muzli:connections";
const SCHEMA_CACHE_KEY = "muzli:schema-cache";

function generateId(): string {
  return crypto.randomUUID();
}

export function getConnections(): DatabaseConnection[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveConnection(
  data: Omit<DatabaseConnection, "id" | "createdAt" | "updatedAt">
): DatabaseConnection {
  const connections = getConnections();
  const now = new Date().toISOString();
  const connection: DatabaseConnection = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  connections.push(connection);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  return connection;
}

export function deleteConnection(id: string): void {
  const connections = getConnections().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  removeSchemaCache(id);
}

export function getSchemaCache(connectionId: string): DbMetadata | null {
  try {
    const stored = localStorage.getItem(`${SCHEMA_CACHE_KEY}:${connectionId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function setSchemaCache(connectionId: string, metadata: DbMetadata): void {
  try {
    localStorage.setItem(`${SCHEMA_CACHE_KEY}:${connectionId}`, JSON.stringify(metadata));
  } catch {}
}

export function removeSchemaCache(connectionId: string): void {
  try {
    localStorage.removeItem(`${SCHEMA_CACHE_KEY}:${connectionId}`);
  } catch {}
}
