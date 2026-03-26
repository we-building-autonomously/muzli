import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Sidebar } from './components/sidebar/Sidebar'
import { Editor } from './components/editor/Editor'
import { Results } from './components/results/Results'
import type { DatabaseConnection, QueryResult, TableData } from './types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App() {
  const [selectedConnection, setSelectedConnection] = useState<DatabaseConnection | null>(null)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [tableData, setTableData] = useState<TableData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleConnectionSelect = (connection: DatabaseConnection) => {
    setSelectedConnection(connection)
    // Clear previous results when switching connections
    setQueryResult(null)
    setTableData(null)
  }

  const handleQueryExecute = (result: QueryResult) => {
    setQueryResult(result)
    setTableData(null) // Clear table data when running queries
  }

  const handleTableSelect = (data: TableData) => {
    setTableData(data)
    setQueryResult(null) // Clear query results when viewing table data
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen bg-background text-foreground">
        <div className="border-b">
          <div className="flex h-14 items-center px-4">
            <h1 className="text-xl font-bold">Muzli</h1>
            <div className="ml-auto text-sm text-muted-foreground">
              Modern Database Management Tool
            </div>
          </div>
        </div>
        
        <div className="h-[calc(100vh-3.5rem)]">
          <PanelGroup direction="horizontal">
            {/* Sidebar */}
            <Panel defaultSize={25} minSize={20} maxSize={40}>
              <Sidebar
                selectedConnection={selectedConnection}
                onConnectionSelect={handleConnectionSelect}
                onTableSelect={handleTableSelect}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
              />
            </Panel>
            
            <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />
            
            {/* Main Content */}
            <Panel defaultSize={75}>
              <PanelGroup direction="vertical">
                {/* Editor */}
                <Panel defaultSize={50} minSize={30}>
                  <Editor
                    selectedConnection={selectedConnection}
                    onQueryExecute={handleQueryExecute}
                    isLoading={isLoading}
                    setIsLoading={setIsLoading}
                  />
                </Panel>
                
                <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors" />
                
                {/* Results */}
                <Panel defaultSize={50} minSize={30}>
                  <Results
                    queryResult={queryResult}
                    tableData={tableData}
                    isLoading={isLoading}
                  />
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </div>
      </div>
    </QueryClientProvider>
  )
}

export default App