import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Play, Loader2, Database } from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'
import { Button } from '../ui/button'
import { apiClient } from '@/api/client'
import type { DatabaseConnection, QueryResult } from '@/types'

interface EditorProps {
  selectedConnection: DatabaseConnection | null
  onQueryExecute: (result: QueryResult) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
}

export function Editor({ 
  selectedConnection, 
  onQueryExecute, 
  isLoading, 
  setIsLoading 
}: EditorProps) {
  const [query, setQuery] = useState('-- Welcome to Muzli!\n-- Write your SQL queries here\n\nSELECT version();')

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!selectedConnection) throw new Error('No connection selected')
      return apiClient.executeQuery(selectedConnection.id, query)
    },
    onSuccess: (result) => {
      onQueryExecute(result)
      setIsLoading(false)
    },
    onError: (error: Error) => {
      // You might want to show this error in the Results panel
      console.error('Query execution failed:', error)
      setIsLoading(false)
    },
  })

  const handleExecute = () => {
    if (!selectedConnection || !query.trim()) return
    setIsLoading(true)
    executeMutation.mutate()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleExecute()
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Query Editor</h3>
          {selectedConnection && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Database className="h-3 w-3" />
              {selectedConnection.name}
            </div>
          )}
        </div>
        
        <Button
          onClick={handleExecute}
          disabled={!selectedConnection || !query.trim() || isLoading}
          size="sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run Query
            </>
          )}
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1">
        {selectedConnection ? (
          <MonacoEditor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={query}
            onChange={(value) => setQuery(value || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              wordWrap: 'on',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 16 },
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
              parameterHints: { enabled: true },
              hover: { enabled: true },
            }}
            onMount={(editor) => {
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                handleExecute()
              })
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Select a connection to start writing queries</p>
              <p className="text-sm mt-1">Connect to a PostgreSQL database from the sidebar</p>
            </div>
          </div>
        )}
      </div>

      {selectedConnection && (
        <div className="px-4 py-2 border-t text-xs text-muted-foreground">
          Press Ctrl+Enter (Cmd+Enter on Mac) to execute query
        </div>
      )}
    </div>
  )
}