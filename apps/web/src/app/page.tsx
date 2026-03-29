"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Plus, X, Sun, Moon, Keyboard, Search, Database as DatabaseIcon, Table2, Bookmark as BookmarkIcon } from "lucide-react";
import { apiClient } from "@/api/client";
import { getConnections } from "@/lib/connections";
import { getSavedQueries } from "@/lib/saved-queries";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Editor } from "@/components/editor/Editor";
import { Results } from "@/components/results/Results";
import type { DatabaseConnection, QueryResult, TableData, VectorSearchContext, DbContext } from "@/types";
import type { DbMetadata } from "@/lib/sql-autocomplete";

const STORAGE_KEY = "muzli:selectedConnectionId";

interface QueryTab {
  id: string;
  label: string;
  query: string;
  queryResult: QueryResult | null;
  tableData: TableData | null;
  error: string | null;
}

let nextTabId = 1;

function createTab(label?: string): QueryTab {
  const id = `tab-${nextTabId++}`;
  return { id, label: label || `Query ${nextTabId - 1}`, query: "", queryResult: null, tableData: null, error: null };
}

const SHORTCUTS = [
  { keys: "Ctrl+Enter", action: "Execute query (or run selection)" },
  { keys: "Ctrl+K", action: "Command palette / global search" },
  { keys: "Ctrl+S", action: "Save current query as bookmark" },
  { keys: "Ctrl+N", action: "New query tab" },
  { keys: "Ctrl+W", action: "Close current tab" },
  { keys: "?", action: "Show keyboard shortcuts" },
];

function CommandPaletteResults({
  query, dbMetadata, selectedConnection, connections, onSelectTable, onSelectConnection, onSelectSavedQuery,
}: {
  query: string;
  dbMetadata: DbMetadata | null;
  selectedConnection: DatabaseConnection | null;
  connections: DatabaseConnection[];
  onSelectTable: (schema: string, table: string) => void;
  onSelectConnection: (conn: DatabaseConnection) => void;
  onSelectSavedQuery: (query: string) => void;
}) {
  const q = query.toLowerCase().trim();

  const items: { type: string; icon: React.ReactNode; label: string; detail: string; action: () => void }[] = [];

  // Connections
  connections.forEach((conn) => {
    if (q && !conn.name.toLowerCase().includes(q) && !conn.type.includes(q)) return;
    items.push({
      type: "connection",
      icon: <DatabaseIcon className="h-3.5 w-3.5 text-blue-400" />,
      label: conn.name,
      detail: conn.type,
      action: () => onSelectConnection(conn),
    });
  });

  // Tables from current connection metadata
  if (dbMetadata) {
    dbMetadata.schemas.forEach((schema) => {
      schema.tables.forEach((table) => {
        if (q && !table.name.toLowerCase().includes(q) && !schema.name.toLowerCase().includes(q)) return;
        items.push({
          type: "table",
          icon: <Table2 className="h-3.5 w-3.5 text-emerald-400" />,
          label: table.name,
          detail: schema.name,
          action: () => onSelectTable(schema.name, table.name),
        });
      });
    });
  }

  // Saved queries
  if (selectedConnection) {
    const saved = getSavedQueries(selectedConnection.id);
    saved.forEach((sq) => {
      if (q && !sq.name.toLowerCase().includes(q) && !sq.query.toLowerCase().includes(q)) return;
      items.push({
        type: "saved",
        icon: <BookmarkIcon className="h-3.5 w-3.5 text-amber-400" />,
        label: sq.name,
        detail: sq.query.split("\n")[0].slice(0, 50),
        action: () => onSelectSavedQuery(sq.query),
      });
    });
  }

  if (items.length === 0) {
    return <div className="p-4 text-center text-xs text-muted-foreground">No results</div>;
  }

  return (
    <div className="py-1">
      {items.slice(0, 20).map((item, i) => (
        <button
          key={`${item.type}-${i}`}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
          onClick={item.action}
        >
          {item.icon}
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium truncate block">{item.label}</span>
            <span className="text-[10px] text-muted-foreground truncate block">{item.detail}</span>
          </div>
          <span className="text-[9px] text-muted-foreground/50 flex-shrink-0">{item.type}</span>
        </button>
      ))}
    </div>
  );
}

function MuzliApp() {
  const [selectedConnection, setSelectedConnection] = useState<DatabaseConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [restoredConnectionId, setRestoredConnectionId] = useState<string | null>(null);
  const [vectorContext, setVectorContext] = useState<VectorSearchContext | null>(null);
  const [dbContext, setDbContext] = useState<DbContext | null>(null);
  const [dbMetadata, setDbMetadata] = useState<DbMetadata | null>(null);
  const [isDark, setIsDark] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Tabs
  const [tabs, setTabs] = useState<QueryTab[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setRestoredConnectionId(stored);
      const theme = localStorage.getItem("muzli:theme");
      setIsDark(theme !== "light");
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("muzli:theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMonaco = (e.target as HTMLElement)?.closest?.(".monaco-editor");
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        addTab();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        if (tabs.length > 1) closeTab(activeTabId);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        setCmdQuery("");
      }
      if (e.key === "Escape" && showCommandPalette) {
        setShowCommandPalette(false);
      }
      if (e.key === "?" && !isMonaco && !(e.target as HTMLElement)?.matches?.("input,textarea")) {
        setShowShortcuts((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabs, activeTabId]);

  const handleConnectionSelect = (connection: DatabaseConnection | null) => {
    setSelectedConnection(connection);
    // Clear results on all tabs when switching connection
    setTabs((prev) => prev.map((t) => ({ ...t, queryResult: null, tableData: null, error: null })));
    if (!connection || (connection.type !== "pinecone" && connection.type !== "turbopuffer")) {
      setVectorContext(null);
    }
    try {
      if (connection) {
        localStorage.setItem(STORAGE_KEY, connection.id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  };

  const updateActiveTab = useCallback((updates: Partial<QueryTab>) => {
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, ...updates } : t));
  }, [activeTabId]);

  const handleQueryExecute = useCallback((result: QueryResult) => {
    updateActiveTab({ queryResult: result, tableData: null, error: null });
  }, [updateActiveTab]);

  const handleQueryError = useCallback((error: string) => {
    updateActiveTab({ error, queryResult: null, tableData: null });
  }, [updateActiveTab]);

  const handleTableSelect = useCallback((data: TableData) => {
    updateActiveTab({ tableData: data, queryResult: null, error: null });
  }, [updateActiveTab]);

  const addTab = () => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  };

  const handlePreviewTable = useCallback(async (schema: string, table: string) => {
    if (!selectedConnection) return;
    setIsLoading(true);
    try {
      const data = await apiClient.getTableData(selectedConnection, schema, table, { page: 1, pageSize: 100 });
      updateActiveTab({ tableData: data, queryResult: null, error: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to preview table";
      updateActiveTab({ error: msg, queryResult: null, tableData: null });
    } finally {
      setIsLoading(false);
    }
  }, [selectedConnection, updateActiveTab]);

  return (
    <div className="h-screen bg-background text-foreground">
      <div className="border-b">
        <div className="flex h-10 items-center justify-between px-3">
          <h1 className="text-sm font-bold">Muzli</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowShortcuts(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <>
          <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={() => setShowShortcuts(false)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-popover border rounded-lg shadow-xl w-80 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{s.action}</span>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Command palette */}
      {showCommandPalette && (
        <>
          <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={() => setShowCommandPalette(false)} />
          <div className="fixed z-50 top-[20%] left-1/2 -translate-x-1/2 bg-popover border rounded-lg shadow-xl w-[420px] max-h-[400px] flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setShowCommandPalette(false); }}
                placeholder="Search tables, connections, saved queries..."
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
              <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">ESC</kbd>
            </div>
            <div className="overflow-auto flex-1">
              <CommandPaletteResults
                query={cmdQuery}
                dbMetadata={dbMetadata}
                selectedConnection={selectedConnection}
                connections={getConnections()}
                onSelectTable={(schema, table) => {
                  setDbContext({ schema, table });
                  setShowCommandPalette(false);
                }}
                onSelectConnection={(conn) => {
                  handleConnectionSelect(conn);
                  setShowCommandPalette(false);
                }}
                onSelectSavedQuery={(q) => {
                  // Will be handled by the editor via dbContext or direct state
                  setShowCommandPalette(false);
                }}
              />
            </div>
          </div>
        </>
      )}

      <div className="h-[calc(100vh-2.5rem)]">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={25} minSize={20} maxSize={40}>
            <Sidebar
              selectedConnection={selectedConnection}
              onConnectionSelect={handleConnectionSelect}
              onTableSelect={handleTableSelect}
              onVectorContextSelect={setVectorContext}
              onDbContextSelect={setDbContext}
              onDbTreeChange={setDbMetadata}
              onPreviewTable={handlePreviewTable}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              restoredConnectionId={restoredConnectionId}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />

          <Panel defaultSize={75}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={50} minSize={30}>
                <div className="h-full flex flex-col">
                  {/* Tab bar */}
                  {selectedConnection && (
                    <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
                      {tabs.map((tab) => (
                        <div
                          key={tab.id}
                          className={`group flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-r border-border/50 transition-colors ${
                            tab.id === activeTabId
                              ? "bg-background text-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                          }`}
                          onClick={() => setActiveTabId(tab.id)}
                          onDoubleClick={() => setEditingTabId(tab.id)}
                        >
                          {editingTabId === tab.id ? (
                            <input
                              autoFocus
                              defaultValue={tab.label}
                              className="bg-transparent text-xs w-20 outline-none border-b border-primary"
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val) setTabs((prev) => prev.map((t) => t.id === tab.id ? { ...t, label: val } : t));
                                setEditingTabId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditingTabId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="truncate max-w-[100px]">{tab.label}</span>
                          )}
                          {tabs.length > 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity ml-1"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={addTab}
                        className="flex items-center px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        title="New tab"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <Editor
                      key={activeTabId}
                      selectedConnection={selectedConnection}
                      onQueryExecute={handleQueryExecute}
                      onError={handleQueryError}
                      isLoading={isLoading}
                      setIsLoading={setIsLoading}
                      vectorContext={vectorContext}
                      dbContext={dbContext}
                      dbMetadata={dbMetadata}
                      isDark={isDark}
                      initialQuery={activeTab.query || undefined}
                      onQueryChange={(q) => updateActiveTab({ query: q })}
                    />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors" />

              <Panel defaultSize={50} minSize={30}>
                <Results
                  queryResult={activeTab.queryResult}
                  tableData={activeTab.tableData}
                  isLoading={isLoading}
                  connectionType={selectedConnection?.type}
                  error={activeTab.error}
                />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <QueryProvider>
      <MuzliApp />
    </QueryProvider>
  );
}
