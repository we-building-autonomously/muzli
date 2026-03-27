"use client";

import { useState, useEffect } from "react";
import { Plus, Database, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/dialogs/ConnectionDialog";
import { apiClient } from "@/api/client";
import type { DatabaseConnection, TableData } from "@/types";

const DB_LABELS: Record<string, { label: string; color: string }> = {
  postgres: { label: "PG", color: "bg-emerald-500/15 text-emerald-400" },
  mongodb: { label: "MDB", color: "bg-green-500/15 text-green-400" },
  mysql: { label: "MY", color: "bg-sky-500/15 text-sky-400" },
  sqlite: { label: "SQ", color: "bg-amber-500/15 text-amber-400" },
  redis: { label: "RD", color: "bg-red-500/15 text-red-400" },
  pinecone: { label: "PC", color: "bg-teal-500/15 text-teal-400" },
  turbopuffer: { label: "TP", color: "bg-violet-500/15 text-violet-400" },
};

interface SidebarProps {
  selectedConnection: DatabaseConnection | null;
  onConnectionSelect: (connection: DatabaseConnection) => void;
  onTableSelect: (data: TableData) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  restoredConnectionId: string | null;
}

export function Sidebar({
  selectedConnection,
  onConnectionSelect,
  onTableSelect,
  isLoading,
  setIsLoading,
  restoredConnectionId,
}: SidebarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasRestored, setHasRestored] = useState(false);

  const { data: connections, refetch: refetchConnections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiClient.getConnections(),
  });

  // Auto-select restored connection once connections are loaded
  useEffect(() => {
    if (!hasRestored && restoredConnectionId && connections?.length) {
      const match = connections.find((c) => c.id === restoredConnectionId);
      if (match) {
        onConnectionSelect(match);
      }
      setHasRestored(true);
    }
  }, [connections, restoredConnectionId, hasRestored, onConnectionSelect]);

  const handleConnectionCreated = () => {
    refetchConnections();
    setIsDialogOpen(false);
  };

  const getSubline = (conn: DatabaseConnection) => {
    if (conn.type === "sqlite") return conn.host;
    if (conn.type === "pinecone" || conn.type === "turbopuffer") return conn.host;
    if (conn.type === "redis") return `${conn.host}:${conn.port}`;
    return `${conn.host}:${conn.port}/${conn.database}`;
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
        {connections?.map((connection) => {
          const db = DB_LABELS[connection.type] || DB_LABELS.postgres;
          return (
            <div
              key={connection.id}
              className={`
                p-2 rounded-md cursor-pointer transition-colors mb-1
                ${
                  selectedConnection?.id === connection.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                }
              `}
              onClick={() => onConnectionSelect(connection)}
            >
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{connection.name}</span>
                    <span className={`text-[10px] font-medium px-1 py-0 rounded ${db.color}`}>
                      {db.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {getSubline(connection)}
                  </div>
                </div>
                {isLoading && selectedConnection?.id === connection.id && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                )}
              </div>
            </div>
          );
        })}

        {!connections?.length && (
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
