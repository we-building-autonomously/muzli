"use client";

import { useState } from "react";
import { Plus, Database, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/dialogs/ConnectionDialog";
import { apiClient } from "@/api/client";
import type { DatabaseConnection, TableData } from "@/types";

interface SidebarProps {
  selectedConnection: DatabaseConnection | null;
  onConnectionSelect: (connection: DatabaseConnection) => void;
  onTableSelect: (data: TableData) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function Sidebar({
  selectedConnection,
  onConnectionSelect,
  onTableSelect,
  isLoading,
  setIsLoading,
}: SidebarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: connections, refetch: refetchConnections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiClient.getConnections(),
  });

  const handleConnectionCreated = () => {
    refetchConnections();
    setIsDialogOpen(false);
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
          const isMongo = connection.type === "mongodb";
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
                <Database className={`h-3.5 w-3.5 flex-shrink-0 ${isMongo ? "text-green-500" : "text-emerald-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{connection.name}</span>
                    <span
                      className={`text-[10px] font-medium px-1 py-0 rounded ${
                        isMongo
                          ? "bg-green-500/15 text-green-500"
                          : "bg-blue-500/15 text-emerald-500"
                      }`}
                    >
                      {isMongo ? "MDB" : "PG"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {connection.host}:{connection.port}
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
