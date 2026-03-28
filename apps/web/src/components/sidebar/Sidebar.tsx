"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Database, Loader2, ChevronRight, ChevronDown, Layers, FolderOpen, Table2, Hash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/dialogs/ConnectionDialog";
import { apiClient } from "@/api/client";
import { getConnections, deleteConnection as removeConnection } from "@/lib/connections";
import type { DatabaseConnection, TableData, VectorSearchContext, ColumnInfo } from "@/types";
import type { DbMetadata } from "@/lib/sql-autocomplete";

const DB_ICONS: Record<string, string> = {
  postgres: "🐘",
  mongodb: "🍃",
  mysql: "🐬",
  sqlite: "📄",
  redis: "⚡",
  pinecone: "🌲",
  turbopuffer: "🐡",
};

// --- Vector DB tree types ---
interface IndexInfo {
  name: string;
  host: string;
  metric: string;
  dimension: number;
  namespaces: string[];
  expanded: boolean;
  loading: boolean;
}

// --- Relational DB tree types ---
interface DbSchema {
  name: string;
  expanded: boolean;
  loading: boolean;
  tables: DbTable[];
}

interface DbTable {
  name: string;
  type: string;
  expanded: boolean;
  loading: boolean;
  columns: ColumnInfo[];
}

interface DbTree {
  schemas: DbSchema[];
  loading: boolean;
}

interface SidebarProps {
  selectedConnection: DatabaseConnection | null;
  onConnectionSelect: (connection: DatabaseConnection | null) => void;
  onTableSelect: (data: TableData) => void;
  onVectorContextSelect?: (ctx: VectorSearchContext) => void;
  onDbTreeChange?: (metadata: DbMetadata | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  restoredConnectionId: string | null;
}

export function Sidebar({
  selectedConnection,
  onConnectionSelect,
  onTableSelect,
  onVectorContextSelect,
  onDbTreeChange,
  isLoading,
  setIsLoading,
  restoredConnectionId,
}: SidebarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasRestored, setHasRestored] = useState(false);
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);

  // Vector DB state
  const [vectorTree, setVectorTree] = useState<Record<string, IndexInfo[]>>({});
  const [loadingTree, setLoadingTree] = useState<Set<string>>(new Set());
  const [selectedVectorCtx, setSelectedVectorCtx] = useState<string | null>(null);

  // Relational DB state
  const [dbTree, setDbTree] = useState<Record<string, DbTree>>({});

  const refreshConnections = useCallback(() => {
    setConnections(getConnections());
  }, []);

  useEffect(() => { refreshConnections(); }, [refreshConnections]);

  // Emit DB tree data to parent for autocomplete whenever it changes
  useEffect(() => {
    if (!selectedConnection || !onDbTreeChange) return;
    const tree = dbTree[selectedConnection.id];
    if (!tree || tree.loading) return;

    const metadata: DbMetadata = {
      schemas: tree.schemas.map((s) => ({
        name: s.name,
        tables: s.tables.map((t) => ({
          name: t.name,
          type: t.type,
          columns: t.columns.map((c) => ({
            name: c.name,
            dataType: c.dataType,
            isPrimaryKey: c.isPrimaryKey,
          })),
        })),
      })),
    };
    onDbTreeChange(metadata);
  }, [dbTree, selectedConnection?.id, onDbTreeChange]);

  useEffect(() => {
    if (!hasRestored && restoredConnectionId && connections.length) {
      const match = connections.find((c) => c.id === restoredConnectionId);
      if (match) onConnectionSelect(match);
      setHasRestored(true);
    }
  }, [connections, restoredConnectionId, hasRestored, onConnectionSelect]);

  const handleConnectionCreated = () => { refreshConnections(); setIsDialogOpen(false); };

  const handleDeleteConnection = (connectionId: string) => {
    removeConnection(connectionId);
    refreshConnections();
    if (selectedConnection?.id === connectionId) onConnectionSelect(null);
  };

  const isVectorDb = (type: string) => type === "pinecone" || type === "turbopuffer";
  const isRelationalDb = (type: string) => ["postgres", "mysql", "mongodb", "sqlite"].includes(type);

  const getSubline = (conn: DatabaseConnection) => {
    if (conn.type === "sqlite") return conn.host;
    if (isVectorDb(conn.type)) return null;
    if (conn.type === "redis") return `${conn.host}:${conn.port}`;
    return `${conn.host}:${conn.port}/${conn.database}`;
  };

  // ---- Relational DB tree loading ----
  const loadSchemas = useCallback(async (conn: DatabaseConnection) => {
    setDbTree((prev) => ({ ...prev, [conn.id]: { schemas: [], loading: true } }));
    try {
      const schemas = await apiClient.getSchemas(conn);
      // Set schemas first
      setDbTree((prev) => ({
        ...prev,
        [conn.id]: {
          loading: false,
          schemas: schemas.map((s) => ({ name: s.name, expanded: false, loading: true, tables: [] })),
        },
      }));
      // Auto-load tables for all schemas in parallel (for autocomplete)
      const tableResults = await Promise.all(
        schemas.map(async (s) => {
          const tables = await apiClient.getTables(conn, s.name).catch(() => []);
          return { schemaName: s.name, tables };
        })
      );
      setDbTree((prev) => {
        const tree = prev[conn.id];
        if (!tree) return prev;
        return {
          ...prev,
          [conn.id]: {
            ...tree,
            schemas: tree.schemas.map((s) => {
              const result = tableResults.find((r) => r.schemaName === s.name);
              if (!result) return { ...s, loading: false };
              return {
                ...s,
                loading: false,
                tables: result.tables.map((t) => ({
                  name: t.name,
                  type: t.type || "table",
                  expanded: false,
                  loading: false,
                  columns: [],
                })),
              };
            }),
          },
        };
      });
    } catch {
      setDbTree((prev) => ({ ...prev, [conn.id]: { schemas: [], loading: false } }));
    }
  }, []);

  const loadTables = useCallback(async (conn: DatabaseConnection, schemaName: string) => {
    setDbTree((prev) => {
      const tree = prev[conn.id];
      if (!tree) return prev;
      return {
        ...prev,
        [conn.id]: {
          ...tree,
          schemas: tree.schemas.map((s) =>
            s.name === schemaName ? { ...s, loading: true } : s
          ),
        },
      };
    });
    try {
      const tables = await apiClient.getTables(conn, schemaName);
      setDbTree((prev) => {
        const tree = prev[conn.id];
        if (!tree) return prev;
        return {
          ...prev,
          [conn.id]: {
            ...tree,
            schemas: tree.schemas.map((s) =>
              s.name === schemaName
                ? {
                    ...s,
                    loading: false,
                    expanded: true,
                    tables: tables.map((t) => ({
                      name: t.name,
                      type: t.type || "table",
                      expanded: false,
                      loading: false,
                      columns: [],
                    })),
                  }
                : s
            ),
          },
        };
      });
    } catch {
      setDbTree((prev) => {
        const tree = prev[conn.id];
        if (!tree) return prev;
        return {
          ...prev,
          [conn.id]: {
            ...tree,
            schemas: tree.schemas.map((s) =>
              s.name === schemaName ? { ...s, loading: false, expanded: true } : s
            ),
          },
        };
      });
    }
  }, []);

  const loadColumns = useCallback(async (conn: DatabaseConnection, schemaName: string, tableName: string) => {
    setDbTree((prev) => {
      const tree = prev[conn.id];
      if (!tree) return prev;
      return {
        ...prev,
        [conn.id]: {
          ...tree,
          schemas: tree.schemas.map((s) =>
            s.name === schemaName
              ? {
                  ...s,
                  tables: s.tables.map((t) =>
                    t.name === tableName ? { ...t, loading: true } : t
                  ),
                }
              : s
          ),
        },
      };
    });
    try {
      const columns = await apiClient.getColumns(conn, schemaName, tableName);
      setDbTree((prev) => {
        const tree = prev[conn.id];
        if (!tree) return prev;
        return {
          ...prev,
          [conn.id]: {
            ...tree,
            schemas: tree.schemas.map((s) =>
              s.name === schemaName
                ? {
                    ...s,
                    tables: s.tables.map((t) =>
                      t.name === tableName ? { ...t, loading: false, expanded: true, columns } : t
                    ),
                  }
                : s
            ),
          },
        };
      });
    } catch {
      setDbTree((prev) => {
        const tree = prev[conn.id];
        if (!tree) return prev;
        return {
          ...prev,
          [conn.id]: {
            ...tree,
            schemas: tree.schemas.map((s) =>
              s.name === schemaName
                ? {
                    ...s,
                    tables: s.tables.map((t) =>
                      t.name === tableName ? { ...t, loading: false, expanded: true } : t
                    ),
                  }
                : s
            ),
          },
        };
      });
    }
  }, []);

  const toggleSchema = (conn: DatabaseConnection, schemaName: string) => {
    const tree = dbTree[conn.id];
    const schema = tree?.schemas.find((s) => s.name === schemaName);
    if (!schema) return;
    if (schema.expanded) {
      setDbTree((prev) => ({
        ...prev,
        [conn.id]: {
          ...prev[conn.id],
          schemas: prev[conn.id].schemas.map((s) =>
            s.name === schemaName ? { ...s, expanded: false } : s
          ),
        },
      }));
    } else if (!schema.tables.length) {
      loadTables(conn, schemaName);
    } else {
      setDbTree((prev) => ({
        ...prev,
        [conn.id]: {
          ...prev[conn.id],
          schemas: prev[conn.id].schemas.map((s) =>
            s.name === schemaName ? { ...s, expanded: true } : s
          ),
        },
      }));
    }
  };

  const toggleTable = (conn: DatabaseConnection, schemaName: string, tableName: string) => {
    const tree = dbTree[conn.id];
    const schema = tree?.schemas.find((s) => s.name === schemaName);
    const table = schema?.tables.find((t) => t.name === tableName);
    if (!table) return;
    if (table.expanded) {
      setDbTree((prev) => ({
        ...prev,
        [conn.id]: {
          ...prev[conn.id],
          schemas: prev[conn.id].schemas.map((s) =>
            s.name === schemaName
              ? { ...s, tables: s.tables.map((t) => t.name === tableName ? { ...t, expanded: false } : t) }
              : s
          ),
        },
      }));
    } else if (!table.columns.length) {
      loadColumns(conn, schemaName, tableName);
    } else {
      setDbTree((prev) => ({
        ...prev,
        [conn.id]: {
          ...prev[conn.id],
          schemas: prev[conn.id].schemas.map((s) =>
            s.name === schemaName
              ? { ...s, tables: s.tables.map((t) => t.name === tableName ? { ...t, expanded: true } : t) }
              : s
          ),
        },
      }));
    }
  };

  // ---- Vector DB tree loading ----
  const loadVectorTree = useCallback(async (conn: DatabaseConnection) => {
    if (loadingTree.has(conn.id)) return;
    setLoadingTree((prev) => new Set(prev).add(conn.id));
    try {
      const databases = await apiClient.getDatabases(conn);
      const items: IndexInfo[] = databases.map((db) => ({
        name: db.name,
        host: db.collation || "",
        metric: db.encoding || "",
        dimension: parseInt(db.ctypes || "0") || 0,
        namespaces: [],
        expanded: false,
        loading: false,
      }));
      setVectorTree((prev) => ({ ...prev, [conn.id]: items }));
    } catch (err) {
      console.error("Failed to load tree:", err);
    } finally {
      setLoadingTree((prev) => { const next = new Set(prev); next.delete(conn.id); return next; });
    }
  }, [loadingTree]);

  const loadNamespaces = useCallback(async (conn: DatabaseConnection, indexName: string, indexHost: string) => {
    setVectorTree((prev) => {
      const items = prev[conn.id]?.map((idx) => idx.name === indexName ? { ...idx, loading: true } : idx);
      return { ...prev, [conn.id]: items || [] };
    });
    try {
      const connWithHost = { ...conn, host: indexHost };
      const schemas = await apiClient.getSchemas(connWithHost);
      const namespaces = schemas.map((s) => s.name || "(default)");
      setVectorTree((prev) => {
        const items = prev[conn.id]?.map((idx) =>
          idx.name === indexName ? { ...idx, namespaces, expanded: true, loading: false } : idx
        );
        return { ...prev, [conn.id]: items || [] };
      });
    } catch {
      setVectorTree((prev) => {
        const items = prev[conn.id]?.map((idx) =>
          idx.name === indexName ? { ...idx, namespaces: ["(default)"], expanded: true, loading: false } : idx
        );
        return { ...prev, [conn.id]: items || [] };
      });
    }
  }, []);

  // ---- Toggle connection expand ----
  const toggleConnection = (conn: DatabaseConnection) => {
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(conn.id)) {
        next.delete(conn.id);
      } else {
        next.add(conn.id);
        if (isVectorDb(conn.type) && !vectorTree[conn.id]) loadVectorTree(conn);
        if (isRelationalDb(conn.type) && !dbTree[conn.id]) loadSchemas(conn);
      }
      return next;
    });
  };

  const toggleVectorIndex = (conn: DatabaseConnection, indexName: string, indexHost: string) => {
    const items = vectorTree[conn.id];
    const idx = items?.find((i) => i.name === indexName);
    if (idx?.expanded) {
      setVectorTree((prev) => ({
        ...prev, [conn.id]: prev[conn.id]?.map((i) => i.name === indexName ? { ...i, expanded: false } : i) || [],
      }));
    } else if (!idx?.namespaces.length) {
      loadNamespaces(conn, indexName, indexHost);
    } else {
      setVectorTree((prev) => ({
        ...prev, [conn.id]: prev[conn.id]?.map((i) => i.name === indexName ? { ...i, expanded: true } : i) || [],
      }));
    }
  };

  const handleIndexClick = (connectionId: string, idx: IndexInfo) => {
    setSelectedVectorCtx(`${connectionId}:${idx.name}:`);
    onVectorContextSelect?.({ index: idx.name, host: idx.host, namespace: "", dimension: idx.dimension });
  };

  const handleNamespaceClick = (connectionId: string, idx: IndexInfo, namespace: string) => {
    const ns = namespace === "(default)" ? "" : namespace;
    setSelectedVectorCtx(`${connectionId}:${idx.name}:${ns}`);
    onVectorContextSelect?.({ index: idx.name, host: idx.host, namespace: ns, dimension: idx.dimension });
  };

  const handleTurbopufferNamespaceClick = (connectionId: string, item: IndexInfo) => {
    setSelectedVectorCtx(`${connectionId}::${item.name}`);
    onVectorContextSelect?.({ index: item.name, host: "", namespace: item.name, dimension: item.dimension });
  };

  const isExpandable = (type: string) => isVectorDb(type) || isRelationalDb(type);

  return (
    <div className="h-full flex flex-col border-r">
      <div className="px-3 py-2 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Connections</h2>
          <Button size="sm" onClick={() => setIsDialogOpen(true)} className="h-6 w-6 p-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-1.5">
        {connections.map((connection) => {
          const icon = DB_ICONS[connection.type] || "🗄️";
          const isExpanded = expandedConnections.has(connection.id);
          const isVector = isVectorDb(connection.type);
          const isRelational = isRelationalDb(connection.type);
          const isPinecone = connection.type === "pinecone";
          const canExpand = isExpandable(connection.type);
          const treeItems = vectorTree[connection.id] || [];
          const relTree = dbTree[connection.id];
          const isLoadingItems = loadingTree.has(connection.id) || relTree?.loading;
          const subline = getSubline(connection);

          return (
            <div key={connection.id} className="mb-0.5">
              {/* Connection row */}
              <div
                className={`group p-2 rounded-md cursor-pointer transition-colors ${
                  selectedConnection?.id === connection.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
                onClick={() => {
                  onConnectionSelect(connection);
                  if (canExpand) toggleConnection(connection);
                }}
              >
                <div className="flex items-center gap-1.5">
                  {canExpand && (
                    <span className="w-4 flex items-center justify-center flex-shrink-0">
                      {isLoadingItems ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  )}
                  <span className="text-sm flex-shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{connection.name}</span>
                    {subline && <span className="text-xs text-muted-foreground truncate block">{subline}</span>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteConnection(connection.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity flex-shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {isLoading && selectedConnection?.id === connection.id && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                  )}
                </div>
              </div>

              {/* Relational DB tree: Schema → Table → Column */}
              {isRelational && isExpanded && relTree && (
                <div className="ml-4 pl-2 border-l border-border/50">
                  {relTree.schemas.length === 0 && !relTree.loading && (
                    <div className="py-2 px-2 text-[10px] text-muted-foreground">No schemas found</div>
                  )}
                  {relTree.schemas.map((schema) => (
                    <div key={schema.name}>
                      <div
                        className="flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-xs hover:bg-muted/50"
                        onClick={(e) => { e.stopPropagation(); toggleSchema(connection, schema.name); }}
                      >
                        {schema.loading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
                        ) : schema.expanded ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                        <FolderOpen className="h-3 w-3 text-amber-400/70 flex-shrink-0" />
                        <span className="font-medium truncate">{schema.name || "(default)"}</span>
                      </div>

                      {schema.expanded && (
                        <div className="ml-3 pl-2 border-l border-border/30">
                          {schema.tables.length === 0 && !schema.loading && (
                            <div className="py-1 px-2 text-[10px] text-muted-foreground">No tables</div>
                          )}
                          {schema.tables.map((table) => (
                            <div key={table.name}>
                              <div
                                className="flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-xs hover:bg-muted/50"
                                onClick={(e) => { e.stopPropagation(); toggleTable(connection, schema.name, table.name); }}
                              >
                                {table.loading ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
                                ) : table.expanded ? (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                )}
                                <Table2 className="h-3 w-3 text-blue-400/70 flex-shrink-0" />
                                <span className="truncate">{table.name}</span>
                                {table.type !== "table" && (
                                  <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">{table.type}</span>
                                )}
                              </div>

                              {table.expanded && (
                                <div className="ml-3 pl-2 border-l border-border/20">
                                  {table.columns.map((col) => (
                                    <div
                                      key={col.name}
                                      className="flex items-center gap-1.5 py-0.5 px-2 text-xs text-muted-foreground"
                                    >
                                      <Hash className="h-2.5 w-2.5 flex-shrink-0" />
                                      <span className="truncate">{col.name}</span>
                                      <span className="text-[10px] ml-auto flex-shrink-0 opacity-60">{col.dataType}</span>
                                      {col.isPrimaryKey && <span className="text-[9px] text-amber-400 flex-shrink-0">PK</span>}
                                      {col.isForeignKey && <span className="text-[9px] text-blue-400 flex-shrink-0">FK</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Vector DB tree */}
              {isVector && isExpanded && (
                <div className="ml-4 pl-2 border-l border-border/50">
                  {treeItems.length === 0 && !loadingTree.has(connection.id) && (
                    <div className="py-2 px-2 text-[10px] text-muted-foreground">
                      {isPinecone ? "No indexes found" : "No namespaces found"}
                    </div>
                  )}

                  {isPinecone
                    ? treeItems.map((idx) => (
                        <div key={idx.name}>
                          <div
                            className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-xs transition-colors ${
                              selectedVectorCtx === `${connection.id}:${idx.name}:` ? "bg-accent/50 text-accent-foreground" : "hover:bg-muted/50"
                            }`}
                            onClick={(e) => { e.stopPropagation(); toggleVectorIndex(connection, idx.name, idx.host); handleIndexClick(connection.id, idx); }}
                          >
                            {idx.loading ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
                              : idx.expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                            <Layers className="h-3 w-3 text-teal-400 flex-shrink-0" />
                            <span className="font-medium truncate">{idx.name}</span>
                            {idx.metric && <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">{idx.metric}</span>}
                          </div>
                          {idx.expanded && (
                            <div className="ml-3 pl-2 border-l border-border/30">
                              {idx.namespaces.map((ns) => {
                                const nsKey = ns === "(default)" ? "" : ns;
                                const ctxKey = `${connection.id}:${idx.name}:${nsKey}`;
                                return (
                                  <div
                                    key={ns}
                                    className={`flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-xs transition-colors ${
                                      selectedVectorCtx === ctxKey ? "bg-accent/50 text-accent-foreground" : "hover:bg-muted/50 text-muted-foreground"
                                    }`}
                                    onClick={(e) => { e.stopPropagation(); handleNamespaceClick(connection.id, idx, ns); }}
                                  >
                                    <FolderOpen className="h-3 w-3 text-teal-300/60 flex-shrink-0" />
                                    <span className="truncate">{ns}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))
                    : treeItems.map((item) => {
                        const ctxKey = `${connection.id}::${item.name}`;
                        return (
                          <div
                            key={item.name}
                            className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-xs transition-colors ${
                              selectedVectorCtx === ctxKey ? "bg-accent/50 text-accent-foreground" : "hover:bg-muted/50 text-muted-foreground"
                            }`}
                            onClick={(e) => { e.stopPropagation(); handleTurbopufferNamespaceClick(connection.id, item); }}
                          >
                            <FolderOpen className="h-3 w-3 text-violet-400/60 flex-shrink-0" />
                            <span className="font-medium truncate">{item.name}</span>
                          </div>
                        );
                      })
                  }
                </div>
              )}
            </div>
          );
        })}

        {!connections.length && (
          <div className="text-center py-6 text-muted-foreground">
            <Database className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-xs">No connections yet</p>
            <p className="text-[10px] mt-0.5">Click + to add one</p>
          </div>
        )}
      </div>

      <ConnectionDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onConnectionCreated={handleConnectionCreated} />
    </div>
  );
}
