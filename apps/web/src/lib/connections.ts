import type { DatabaseConnection } from "@/types";

const STORAGE_KEY = "muzli:connections";

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
}
