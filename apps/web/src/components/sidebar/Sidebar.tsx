"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Database, Loader2, ChevronRight, ChevronDown, Layers, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/dialogs/ConnectionDialog";
import { apiClient } from "@/api/client";
import { getConnections, deleteConnection as removeConnection } from "@/lib/connections";
import type { DatabaseConnection, TableData, VectorSearchContext } from "@/types";

const DB_LABELS: Record<string, { label: string; color: string }> = {
  postgres: { label: "PG", color: "bg-emerald-500/15 text-emerald-400" },
  mongodb: { label: "MDB", color: "bg-green-500/15 text-green-400" },
  mysql: { label: "MY", color: "bg-sky-500/15 text-sky-400" },
  sqlite: { label: "SQ", color: "bg-amber-500/15 text-amber-400" },
  redis: { label: "RD", color: "bg-red-500/15 text-red-400" },
  pinecone: { label: "PC", color: "bg-teal-500/15 text-teal-400" },
  turbopuffer: { label: "TP", color: "bg-violet-500/15 text-violet-400" },
};

interface PineconeIndexInfo {
  name: string;
  host: string;
  metric: string;
  dimension: number;
  namespaces: string[];
  expanded: boolean;
  loading: boolean;
}

interface SidebarProps {
  selectedConnection: DatabaseConnection | null;
  onConnectionSelect: (connection: DatabaseConnection | null) => void;
  onTableSelect: (data: TableData) => void;
  onVectorContextSelect?: (ctx: VectorSearchContext) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  restoredConnectionId: string | null;
}

export function Sidebar({
  selectedConnection,
  onConnectionSelect,
  onTableSelect,
  onVectorContextSelect,
  isLoading,
  setIsLoading,
  restoredConnectionId,
}: SidebarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasRestored, setHasRestored] = useState(false);
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [pineconeIndexes, setPineconeIndexes] = useState<Record<string, PineconeIndexInfo[]>>({});
  const [loadingIndexes, setLoadingIndexes] = useState<Set<string>>(new Set());
  const [selectedVectorCtx, setSelectedVectorCtx] = useState<string | null>(null);
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);

  const refreshConnections = useCallback(() => {
    setConnections(getConnections());
  }, []);

  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  useEffect(() => {
    if (!hasRestored && restoredConnectionId && connections.length) {
      const match = connections.find((c) => c.id === restoredConnectionId);
      if (match) {
        onConnectionSelect(match);
      }
      setHasRestored(true);
    }
  }, [connections, restoredConnectionId, hasRestored, onConnectionSelect]);

  const handleConnectionCreated = () => {
    refreshConnections();
    setIsDialogOpen(false);
  };

  const handleDeleteConnection = (connectionId: string) => {
    removeConnection(connectionId);
    refreshConnections();
    if (selectedConnection?.id === connectionId) {
      onConnectionSelect(null);
    }
  };

  const isVectorDb = (type: string) => type === "pinecone" || type === "turbopuffer";

  const getSubline = (conn: DatabaseConnection) => {
    if (conn.type === "sqlite") return conn.host;
    if (isVectorDb(conn.type)) return conn.host || "auto-discover";
    if (conn.type === "redis") return `${conn.host}:${conn.port}`;
    return `${conn.host}:${conn.port}/${conn.database}`;
  };

  const loadPineconeIndexes = useCallback(async (conn: DatabaseConnection) => {
    if (loadingIndexes.has(conn.id)) return;
    setLoadingIndexes((prev) => new Set(prev).add(conn.id));
    try {
      const databases = await apiClient.getDatabases(conn);
      const indexes: PineconeIndexInfo[] = databases.map((db) => ({
        name: db.name,
        host: db.collation || "",
        metric: db.encoding || "",
        dimension: parseInt(db.ctypes || "0") || 0,
        namespaces: [],
        expanded: false,
        loading: false,
      }));
      setPineconeIndexes((prev) => ({ ...prev, [conn.id]: indexes }));
    } catch (err) {
      console.error("Failed to load indexes:", err);
    } finally {
      setLoadingIndexes((prev) => {
        const next = new Set(prev);
        next.delete(conn.id);
        return next;
      });
    }
  }, [loadingIndexes]);

  const loadNamespaces = useCallback(async (conn: DatabaseConnection, indexName: string, indexHost: string) => {
    setPineconeIndexes((prev) => {
      const indexes = prev[conn.id]?.map((idx) =>
        idx.name === indexName ? { ...idx, loading: true } : idx
      );
      return { ...prev, [conn.id]: indexes || [] };
    });

    try {
      const schemas = await apiClient.getSchemas(conn);
      const namespaces = schemas.map((s) => s.name || "(default)");

      setPineconeIndexes((prev) => {
        const indexes = prev[conn.id]?.map((idx) =>
          idx.name === indexName
            ? { ...idx, namespaces, expanded: true, loading: false }
            : idx
        );
        return { ...prev, [conn.id]: indexes || [] };
      });
    } catch (err) {
      console.error("Failed to load namespaces:", err);
      setPineconeIndexes((prev) => {
        const indexes = prev[conn.id]?.map((idx) =>
          idx.name === indexName
            ? { ...idx, namespaces: ["(default)"], expanded: true, loading: false }
            : idx
        );
        return { ...prev, [conn.id]: indexes || [] };
      });
    }
  }, []);

  const toggleConnection = (conn: DatabaseConnection) => {
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(conn.id)) {
        next.delete(conn.id);
      } else {
        next.add(conn.id);
        if (isVectorDb(conn.type) && !pineconeIndexes[conn.id]) {
          loadPineconeIndexes(conn);
        }
      }
      return next;
    });
  };

  const toggleIndex = (conn: DatabaseConnection, indexName: string, indexHost: string) => {
    const indexes = pineconeIndexes[conn.id];
    const idx = indexes?.find((i) => i.name === indexName);
    if (idx?.expanded) {
      setPineconeIndexes((prev) => {
        const updated = prev[conn.id]?.map((i) =>
          i.name === indexName ? { ...i, expanded: false } : i
        );
        return { ...prev, [conn.id]: updated || [] };
      });
    } else if (!idx?.namespaces.length) {
      loadNamespaces(conn, indexName, indexHost);
    } else {
      setPineconeIndexes((prev) => {
        const updated = prev[conn.id]?.map((i) =>
          i.name === indexName ? { ...i, expanded: true } : i
        );
        return { ...prev, [conn.id]: updated || [] };
      });
    }
  };

  const handleIndexClick = (connectionId: string, idx: PineconeIndexInfo) => {
    const ctxKey = `${connectionId}:${idx.name}:`;
    setSelectedVectorCtx(ctxKey);
    onVectorContextSelect?.({
      index: idx.name,
      host: idx.host,
      namespace: "",
      dimension: idx.dimension,
    });
  };

  const handleNamespaceClick = (connectionId: string, idx: PineconeIndexInfo, namespace: string) => {
    const ns = namespace === "(default)" ? "" : namespace;
    const ctxKey = `${connectionId}:${idx.name}:${ns}`;
    setSelectedVectorCtx(ctxKey);
    onVectorContextSelect?.({
      index: idx.name,
      host: idx.host,
      namespace: ns,
      dimension: idx.dimension,
    });
  };

  return (
    <div className="h-full flex flex-col border-r">
      <div className="px-3 py-2 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Connections</h2>
          <Button
            size="sm"
            onClick={() => setIsDialogOpen(true)}
            className="h-6 w-6 p-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-1.5">
        {connections.map((connection) => {
          const db = DB_LABELS[connection.type] || DB_LABELS.postgres;
          const isExpanded = expandedConnections.has(connection.id);
          const isVector = isVectorDb(connection.type);
          const indexes = pineconeIndexes[connection.id] || [];
          const isLoadingIdx = loadingIndexes.has(connection.id);

          return (
            <div key={connection.id} className="mb-0.5">
              {/* Connection row */}
              <div
                className={`
                  group p-2 rounded-md cursor-pointer transition-colors
                  ${
                    selectedConnection?.id === connection.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  }
                `}
                onClick={() => {
                  onConnectionSelect(connection);
                  if (isVector) {
                    toggleConnection(connection);
                  }
                }}
              >
                <div className="flex items-center gap-1.5">
                  {isVector ? (
                    <span className="w-3.5 flex items-center justify-center flex-shrink-0">
                      {isLoadingIdx ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  ) : (
                    <Database className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{connection.name}</span>
                      <span className={`text-[10px] font-medium px-1 py-0 rounded ${db.color}`}>
                        {db.label}
                      </span>
                    </div>
                    {!isVector && (
                      <div className="text-xs text-muted-foreground truncate">
                        {getSubline(connection)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConnection(connection.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {isLoading && selectedConnection?.id === connection.id && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                  )}
                </div>
              </div>

              {/* Pinecone index tree */}
              {isVector && isExpanded && (
                <div className="ml-3 pl-2 border-l border-border/50">
                  {indexes.length === 0 && !isLoadingIdx && (
                    <div className="py-2 px-2 text-[10px] text-muted-foreground">
                      No indexes found
                    </div>
                  )}
                  {indexes.map((idx) => (
                    <div key={idx.name}>
                      {/* Index row */}
                      <div
                        className={`
                          flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-xs transition-colors
                          ${selectedVectorCtx?.startsWith(`${connection.id}:${idx.name}:`) && !selectedVectorCtx?.includes(":", `${connection.id}:${idx.name}:`.length)
                            ? "bg-accent/50 text-accent-foreground"
                            : "hover:bg-muted/50"
                          }
                        `}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleIndex(connection, idx.name, idx.host);
                          handleIndexClick(connection.id, idx);
                        }}
                      >
                        {idx.loading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
                        ) : idx.expanded ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                        <Layers className="h-3 w-3 text-teal-400 flex-shrink-0" />
                        <span className="font-medium truncate">{idx.name}</span>
                        {idx.metric && (
                          <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                            {idx.metric}
                          </span>
                        )}
                      </div>

                      {/* Namespaces */}
                      {idx.expanded && (
                        <div className="ml-3 pl-2 border-l border-border/30">
                          {idx.namespaces.map((ns) => {
                            const nsKey = ns === "(default)" ? "" : ns;
                            const ctxKey = `${connection.id}:${idx.name}:${nsKey}`;
                            return (
                              <div
                                key={ns}
                                className={`
                                  flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-xs transition-colors
                                  ${selectedVectorCtx === ctxKey
                                    ? "bg-accent/50 text-accent-foreground"
                                    : "hover:bg-muted/50 text-muted-foreground"
                                  }
                                `}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNamespaceClick(connection.id, idx, ns);
                                }}
                              >
                                <FolderOpen className="h-3 w-3 text-teal-300/60 flex-shrink-0" />
                                <span className="truncate">{ns}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
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

      <ConnectionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onConnectionCreated={handleConnectionCreated}
      />
    </div>
  );
}
