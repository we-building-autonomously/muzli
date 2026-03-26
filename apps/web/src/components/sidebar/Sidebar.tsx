import { useState } from 'react'
import { Plus, Database, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { ConnectionDialog } from '../dialogs/ConnectionDialog'
import { apiClient } from '@/api/client'
import type { DatabaseConnection, TableData } from '@/types'

interface SidebarProps {
  selectedConnection: DatabaseConnection | null
  onConnectionSelect: (connection: DatabaseConnection) => void
  onTableSelect: (data: TableData) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
}

export function Sidebar({ 
  selectedConnection, 
  onConnectionSelect, 
  onTableSelect,
  isLoading,
  setIsLoading 
}: SidebarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const { data: connections, refetch: refetchConnections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => apiClient.getConnections(),
  })

  const handleConnectionCreated = () => {
    refetchConnections()
    setIsDialogOpen(false)
  }

  return (
    <div className="h-full flex flex-col border-r">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Connections</h2>
          <Button
            size="sm"
            onClick={() => setIsDialogOpen(true)}
            className="h-8 w-8 p-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Connections List */}
      <div className="flex-1 overflow-auto p-2">
        {connections?.map((connection) => (
          <div
            key={connection.id}
            className={`
              p-3 rounded-lg cursor-pointer transition-colors mb-2
              ${selectedConnection?.id === connection.id 
                ? 'bg-accent text-accent-foreground' 
                : 'hover:bg-muted'
              }
            `}
            onClick={() => onConnectionSelect(connection)}
          >
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{connection.name}</div>
                <div className="text-sm text-muted-foreground truncate">
                  {connection.host}:{connection.port}
                </div>
              </div>
              {isLoading && selectedConnection?.id === connection.id && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
            </div>
          </div>
        ))}

        {!connections?.length && (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No connections yet</p>
            <p className="text-xs mt-1">Click the + button to add one</p>
          </div>
        )}
      </div>

      <ConnectionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onConnectionCreated={handleConnectionCreated}
      />
    </div>
  )
}