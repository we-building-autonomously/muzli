"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Database, Loader2, ChevronRight, ChevronDown, Layers, FolderOpen, Table2, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/dialogs/ConnectionDialog";
import { apiClient } from "@/api/client";
import {
  getConnections,
  deleteConnection as removeConnection,
  getSchemaCache,
  setSchemaCache,
  removeSchemaCache,
} from "@/lib/connections";
import type { DatabaseConnection, TableData, VectorSearchContext, DbContext } from "@/types";
import type { DbMetadata } from "@/lib/sql-autocomplete";

const DB_ICONS: Record<string, string> = {
  postgres: "🐘", mongodb: "🍃", mysql: "🐬", sqlite: "📄",
  redis: "⚡", pinecone: "🌲", turbopuffer: "🐡",
};

interface IndexInfo {
  name: string; host: string; metric: string; dimension: number;
  namespaces: string[]; expanded: boolean; loading: boolean;
}

interface SidebarProps {
  selectedConnection: DatabaseConnection | null;
  onConnectionSelect: (connection: DatabaseConnection | null) => void;
  onTableSelect: (data: TableData) => void;
  onVectorContextSelect?: (ctx: VectorSearchContext) => void;
  onDbContextSelect?: (ctx: DbContext) => void;
  onDbTreeChange?: (metadata: DbMetadata | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  restoredConnectionId: string | null;
}

// Expanded state for the tree UI
interface TreeState {
  expandedSchemas: Set<string>;
  expandedTables: Set<string>;
}

export function Sidebar({
  selectedConnection, onConnectionSelect, onTableSelect,
  onVectorContextSelect, onDbContextSelect, onDbTreeChange, isLoading, setIsLoading, restoredConnectionId,
}: SidebarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasRestored, setHasRestored] = useState(false);
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);

  // Schema metadata per connection (from cache or freshly loaded)
  const [schemaData, setSchemaData] = useState<Record<string, DbMetadata>>({});
  const [schemaLoading, setSchemaLoading] = useState<Set<string>>(new Set());

  // UI expand state per connection
  const [treeState, setTreeState] = useState<Record<string, TreeState>>({});

  // Vector DB state
  const [vectorTree, setVectorTree] = useState<Record<string, IndexInfo[]>>({});
  const [loadingTree, setLoadingTree] = useState<Set<string>>(new Set());
  const [selectedVectorCtx, setSelectedVectorCtx] = useState<string | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; connectionId: string } | null>(null);

  const refreshConnections = useCallback(() => {
    const conns = getConnections();
    setConnections(conns);
    // Load cached schemas into state on mount
    const cached: Record<string, DbMetadata> = {};
    for (const conn of conns) {
      if (isRelationalDb(conn.type)) {
        const c = getSchemaCache(conn.id);
        if (c) cached[conn.id] = c;
      }
    }
    if (Object.keys(cached).length > 0) {
      setSchemaData((prev) => ({ ...prev, ...cached }));
    }
  }, []);
  useEffect(() => { refreshConnections(); }, [refreshConnections]);

  useEffect(() => {
    if (!hasRestored && restoredConnectionId && connections.length) {
      const match = connections.find((c) => c.id === restoredConnectionId);
      if (match) onConnectionSelect(match);
      setHasRestored(true);
    }
  }, [connections, restoredConnectionId, hasRestored, onConnectionSelect]);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  // Emit metadata to editor for autocomplete
  useEffect(() => {
    if (!selectedConnection || !onDbTreeChange) return;
    const data = schemaData[selectedConnection.id];
    if (data) onDbTreeChange(data);
  }, [schemaData, selectedConnection?.id, onDbTreeChange]);

  const handleConnectionCreated = () => { refreshConnections(); setIsDialogOpen(false); };

  const handleDeleteConnection = (connectionId: string) => {
    removeConnection(connectionId);
    refreshConnections();
    if (selectedConnection?.id === connectionId) onConnectionSelect(null);
    setContextMenu(null);
  };

  const isVectorDb = (type: string) => type === "pinecone" || type === "turbopuffer";
  const isRelationalDb = (type: string) => ["postgres", "mysql", "mongodb", "sqlite"].includes(type);
  const isExpandable = (type: string) => isVectorDb(type) || isRelationalDb(type);

  const getSubline = (conn: DatabaseConnection) => {
    if (conn.type === "sqlite") return conn.host;
    if (isVectorDb(conn.type)) return null;
    if (conn.type === "redis") return `${conn.host}:${conn.port}`;
    return `${conn.host}:${conn.port}/${conn.database}`;
  };

  // --- Load full schema (schemas + tables + columns) ---
  const loadFullSchema = useCallback(async (conn: DatabaseConnection, forceRefresh = false) => {
    if (schemaLoading.has(conn.id)) return;

    if (!forceRefresh) {
      // Check cache first
      const cached = getSchemaCache(conn.id);
      if (cached) {
        setSchemaData((prev) => ({ ...prev, [conn.id]: cached }));
        return;
      }
    }

    setSchemaLoading((prev) => new Set(prev).add(conn.id));
    try {
      const schemas = await apiClient.getSchemas(conn).catch(() => null);
      if (!schemas || !Array.isArray(schemas)) {
        setSchemaData((prev) => ({ ...prev, [conn.id]: { schemas: [] } }));
        return;
      }
      const result: DbMetadata = { schemas: [] };

      await Promise.all(
        schemas.map(async (schema) => {
          const tables = await apiClient.getTables(conn, schema.name).catch(() => null);
          if (!tables || !Array.isArray(tables)) {
            result.schemas.push({ name: schema.name, tables: [] });
            return;
          }
          const tablesWithCols = await Promise.all(
            tables.map(async (table) => {
              const columns = await apiClient.getColumns(conn, schema.name, table.name).catch(() => null);
              return {
                name: table.name,
                type: table.type || "table",
                columns: (columns && Array.isArray(columns)) ? columns.map((c) => ({
                  name: c.name,
                  dataType: c.dataType,
                  isPrimaryKey: c.isPrimaryKey,
                })) : [],
              };
            })
          );
          result.schemas.push({ name: schema.name, tables: tablesWithCols });
        })
      );

      setSchemaData((prev) => ({ ...prev, [conn.id]: result }));
      setSchemaCache(conn.id, result);
    } catch (err) {
      console.error("Failed to load schema:", err);
      setSchemaData((prev) => ({ ...prev, [conn.id]: { schemas: [] } }));
    } finally {
      setSchemaLoading((prev) => { const next = new Set(prev); next.delete(conn.id); return next; });
    }
  }, []);

  const handleRefreshSchema = (conn: DatabaseConnection) => {
    removeSchemaCache(conn.id);
    setSchemaData((prev) => { const next = { ...prev }; delete next[conn.id]; return next; });
    loadFullSchema(conn, true);
    setContextMenu(null);
  };

  // --- Vector DB tree ---
  const loadVectorTree = useCallback(async (conn: DatabaseConnection) => {
    if (loadingTree.has(conn.id)) return;
    setLoadingTree((prev) => new Set(prev).add(conn.id));
    try {
      const databases = await apiClient.getDatabases(conn);
      const items: IndexInfo[] = databases.map((db) => ({
        name: db.name, host: db.collation || "", metric: db.encoding || "",
        dimension: parseInt(db.ctypes || "0") || 0,
        namespaces: [], expanded: false, loading: false,
      }));
      setVectorTree((prev) => ({ ...prev, [conn.id]: items }));
    } catch (err) {
      console.error("Failed to load tree:", err);
    } finally {
      setLoadingTree((prev) => { const next = new Set(prev); next.delete(conn.id); return next; });
    }
  }, [loadingTree]);

  const loadNamespaces = useCallback(async (conn: DatabaseConnection, indexName: string, indexHost: string) => {
    setVectorTree((prev) => ({
      ...prev,
      [conn.id]: (prev[conn.id] || []).map((idx) =>
        idx.name === indexName ? { ...idx, loading: true } : idx
      ),
    }));
    try {
      const connWithHost = { ...conn, host: indexHost };
      const schemas = await apiClient.getSchemas(connWithHost);
      const namespaces = schemas.map((s) => s.name || "(default)");
      setVectorTree((prev) => ({
        ...prev,
        [conn.id]: (prev[conn.id] || []).map((idx) =>
          idx.name === indexName ? { ...idx, namespaces, expanded: true, loading: false } : idx
        ),
      }));
    } catch {
      setVectorTree((prev) => ({
        ...prev,
        [conn.id]: (prev[conn.id] || []).map((idx) =>
          idx.name === indexName ? { ...idx, namespaces: ["(default)"], expanded: true, loading: false } : idx
        ),
      }));
    }
  }, []);

  const toggleConnection = (conn: DatabaseConnection) => {
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(conn.id)) { next.delete(conn.id); }
      else {
        next.add(conn.id);
        if (isVectorDb(conn.type) && !vectorTree[conn.id]) loadVectorTree(conn);
        if (isRelationalDb(conn.type) && !schemaData[conn.id]) loadFullSchema(conn);
      }
      return next;
    });
  };

  const toggleSchema = (connId: string, schemaName: string) => {
    setTreeState((prev) => {
      const state = prev[connId] || { expandedSchemas: new Set(), expandedTables: new Set() };
      const next = new Set(state.expandedSchemas);
      if (next.has(schemaName)) next.delete(schemaName); else next.add(schemaName);
      return { ...prev, [connId]: { ...state, expandedSchemas: next } };
    });
  };

  const toggleTable = (connId: string, key: string) => {
    setTreeState((prev) => {
      const state = prev[connId] || { expandedSchemas: new Set(), expandedTables: new Set() };
      const next = new Set(state.expandedTables);
      if (next.has(key)) next.delete(key); else next.add(key);
      return { ...prev, [connId]: { ...state, expandedTables: next } };
    });
  };

  const toggleVectorIndex = (conn: DatabaseConnection, indexName: string, indexHost: string) => {
    const items = vectorTree[conn.id] || [];
    const idx = items.find((i) => i.name === indexName);
    if (idx?.expanded) {
      setVectorTree((prev) => ({
        ...prev, [conn.id]: (prev[conn.id] || []).map((i) => i.name === indexName ? { ...i, expanded: false } : i),
      }));
    } else if (!idx?.namespaces.length) {
      loadNamespaces(conn, indexName, indexHost);
    } else {
      setVectorTree((prev) => ({
        ...prev, [conn.id]: (prev[conn.id] || []).map((i) => i.name === indexName ? { ...i, expanded: true } : i),
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

  const handleContextMenu = (e: React.MouseEvent, connectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, connectionId });
  };

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
          const schema = schemaData[connection.id];
          const isLoadingSchema = schemaLoading.has(connection.id);
          const isLoadingIdx = loadingTree.has(connection.id);
          const subline = getSubline(connection);
          const ts = treeState[connection.id] || { expandedSchemas: new Set(), expandedTables: new Set() };

          return (
            <div key={connection.id} className="mb-0.5">
              <div
                className={`group p-2 rounded-md cursor-pointer transition-colors ${
                  selectedConnection?.id === connection.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
                onClick={() => { onConnectionSelect(connection); if (canExpand) toggleConnection(connection); }}
                onContextMenu={(e) => handleContextMenu(e, connection.id)}
              >
                <div className="flex items-center gap-1.5">
                  {canExpand && (
                    <span className="w-4 flex items-center justify-center flex-shrink-0">
                      {(isLoadingSchema || isLoadingIdx) ? (
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
                  {isLoading && selectedConnection?.id === connection.id && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                  )}
                </div>
              </div>

              {/* Relational DB tree */}
              {isRelational && isExpanded && schema && (
                <div className="ml-4 pl-2 border-l border-border/50">
                  {schema.schemas.length === 0 && !isLoadingSchema && (
                    <div className="py-2 px-2 text-[10px] text-muted-foreground">No schemas found</div>
                  )}
                  {schema.schemas.map((s) => {
                    const schemaExpanded = ts.expandedSchemas.has(s.name);
                    return (
                      <div key={s.name}>
                        <div
                          className="flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-xs hover:bg-muted/50"
                          onClick={(e) => { e.stopPropagation(); toggleSchema(connection.id, s.name); }}
                        >
                          {schemaExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                          <FolderOpen className="h-3 w-3 text-amber-400/70 flex-shrink-0" />
                          <span className="font-medium truncate">{s.name || "(default)"}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">{s.tables.length}</span>
                        </div>
                        {schemaExpanded && (
                          <div className="ml-3 pl-2 border-l border-border/30">
                            {s.tables.map((t) => {
                              const tableKey = `${s.name}.${t.name}`;
                              const tableExpanded = ts.expandedTables.has(tableKey);
                              return (
                                <div key={t.name}>
                                  <div
                                    className="flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-xs hover:bg-muted/50"
                                    onClick={(e) => { e.stopPropagation(); toggleTable(connection.id, tableKey); onDbContextSelect?.({ schema: s.name, table: t.name }); }}
                                  >
                                    {tableExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                                    <Table2 className="h-3 w-3 text-blue-400/70 flex-shrink-0" />
                                    <span className="truncate">{t.name}</span>
                                    {t.type !== "table" && <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">{t.type}</span>}
                                  </div>
                                  {tableExpanded && (
                                    <div className="ml-3 pl-2 border-l border-border/20">
                                      {t.columns.map((col) => (
                                        <div key={col.name} className="flex items-center gap-1.5 py-0.5 px-2 text-xs text-muted-foreground">
                                          <Hash className="h-2.5 w-2.5 flex-shrink-0" />
                                          <span className="truncate">{col.name}</span>
                                          <span className="text-[10px] ml-auto flex-shrink-0 opacity-60">{col.dataType}</span>
                                          {col.isPrimaryKey && <span className="text-[9px] text-amber-400 flex-shrink-0">PK</span>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                              selectedVectorCtx === `${connection.id}:${idx.name}:` ? "bg-accent/50" : "hover:bg-muted/50"
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
                                  <div key={ns} className={`flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-xs transition-colors ${
                                    selectedVectorCtx === ctxKey ? "bg-accent/50" : "hover:bg-muted/50 text-muted-foreground"
                                  }`} onClick={(e) => { e.stopPropagation(); handleNamespaceClick(connection.id, idx, ns); }}>
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
                          <div key={item.name} className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-xs transition-colors ${
                            selectedVectorCtx === ctxKey ? "bg-accent/50" : "hover:bg-muted/50 text-muted-foreground"
                          }`} onClick={(e) => { e.stopPropagation(); handleTurbopufferNamespaceClick(connection.id, item); }}>
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

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-popover border rounded-md shadow-lg py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {(() => {
              const conn = connections.find((c) => c.id === contextMenu.connectionId);
              if (!conn) return null;
              return (
                <>
                  {isRelationalDb(conn.type) && (
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                      onClick={() => handleRefreshSchema(conn)}
                    >
                      Refresh Schema
                    </button>
                  )}
                  {isVectorDb(conn.type) && (
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                      onClick={() => {
                        setVectorTree((prev) => { const next = { ...prev }; delete next[conn.id]; return next; });
                        loadVectorTree(conn);
                        setContextMenu(null);
                      }}
                    >
                      Refresh
                    </button>
                  )}
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                    onClick={() => handleDeleteConnection(contextMenu.connectionId)}
                  >
                    Delete Connection
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}

      <ConnectionDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} onConnectionCreated={handleConnectionCreated} />
    </div>
  );
}
