"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Play, Loader2, Database, Search, History, X, Bookmark, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";
import { registerSqlCompletionProvider, type DbMetadata } from "@/lib/sql-autocomplete";
import { getQueryHistory, addQueryToHistory, clearQueryHistory, type QueryHistoryEntry } from "@/lib/query-history";
import { getSavedQueries, saveQuery, deleteSavedQuery, type SavedQuery } from "@/lib/saved-queries";
import { formatDuration } from "@/lib/utils";
import type { DatabaseConnection, QueryResult, VectorSearchContext, DbContext } from "@/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
      Loading editor...
    </div>
  ),
});

const SQL_DEFAULT = "-- Welcome to Muzli!\n-- Write your SQL queries here\n\nSELECT * FROM \nLIMIT 100;";

function buildMongoDefault(ctx?: DbContext | null) {
  const collection = ctx?.table || "collection_name";
  const db = ctx?.schema ? `\n  "database": "${ctx.schema}",` : "";
  return `{${db}
  "collection": "${collection}",
  "operation": "find",
  "filter": {},
  "limit": 50
}`;
}

function buildPineconeDefault(ctx?: VectorSearchContext | null) {
  const index = ctx?.index || "my-index";
  const ns = ctx?.namespace ? `\n  "namespace": "${ctx.namespace}",` : "";
  const dim = ctx?.dimension || 0;
  const vectorLine = dim > 0
    ? `"vector": [${Array(dim).fill("0.0").join(", ")}]`
    : `"vector": []`;
  return `{
  "operation": "query",
  "index": "${index}",${ns}
  ${vectorLine},
  "topK": 10,
  "includeMetadata": true,
  "includeValues": true
}`;
}

function buildTurbopufferDefault(ctx?: VectorSearchContext | null) {
  const ns = ctx?.namespace || ctx?.index || "my-namespace";
  const dim = ctx?.dimension || 0;
  const vectorLine = dim > 0
    ? `"vector": [${Array(dim).fill("0.0").join(", ")}]`
    : `"vector": []`;
  return `{
  "operation": "query",
  "namespace": "${ns}",
  ${vectorLine},
  "top_k": 10,
  "include_vectors": true,
  "include_attributes": true
}`;
}

const PINECONE_LIST_INDEXES = `{
  "operation": "list_indexes"
}`;

interface EditorProps {
  selectedConnection: DatabaseConnection | null;
  onQueryExecute: (result: QueryResult) => void;
  onError?: (error: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  vectorContext?: VectorSearchContext | null;
  dbContext?: DbContext | null;
  dbMetadata?: DbMetadata | null;
}

export function Editor({
  selectedConnection,
  onQueryExecute,
  onError,
  isLoading,
  setIsLoading,
  vectorContext,
  dbContext,
  dbMetadata,
}: EditorProps) {
  const isMongo = selectedConnection?.type === "mongodb";
  const isPinecone = selectedConnection?.type === "pinecone";
  const isTurbopuffer = selectedConnection?.type === "turbopuffer";
  const isVectorDb = isPinecone || isTurbopuffer;
  const isJson = isMongo || isVectorDb;
  const isSql = !!selectedConnection && !isJson;

  const [query, setQuery] = useState(SQL_DEFAULT);
  const [queryLimit, setQueryLimit] = useState(100);
  const [showHistory, setShowHistory] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [hasSelection, setHasSelection] = useState(false);
  const completionProviderRef = useRef<{ dispose: () => void } | null>(null);
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);

  // Use metadata from sidebar (passed via props)
  const metadata = dbMetadata || null;

  // Load history and saved queries when connection changes
  useEffect(() => {
    if (selectedConnection) {
      setHistory(getQueryHistory(selectedConnection.id));
      setSaved(getSavedQueries(selectedConnection.id));
    } else {
      setHistory([]);
      setSaved([]);
    }
    setShowHistory(false);
    setShowSaved(false);
  }, [selectedConnection?.id]);

  useEffect(() => {
    if (!selectedConnection) return;
    if (isPinecone) {
      setQuery(buildPineconeDefault(vectorContext));
    } else if (isTurbopuffer) {
      setQuery(buildTurbopufferDefault(vectorContext));
    } else if (isMongo) {
      setQuery(buildMongoDefault(dbContext));
    } else {
      if (dbContext?.table) {
        const table = dbContext.schema
          ? `"${dbContext.schema}"."${dbContext.table}"`
          : dbContext.table;
        setQuery(`SELECT * FROM ${table}\nLIMIT 100;`);
      } else {
        setQuery(SQL_DEFAULT);
      }
    }
  }, [selectedConnection?.id, isMongo, isPinecone, isTurbopuffer]);

  // Update query when vector context changes
  useEffect(() => {
    if (!vectorContext) return;
    if (isPinecone) setQuery(buildPineconeDefault(vectorContext));
    else if (isTurbopuffer) setQuery(buildTurbopufferDefault(vectorContext));
  }, [vectorContext?.index, vectorContext?.namespace, isPinecone, isTurbopuffer]);

  // Update query when db context changes (table/collection clicked in sidebar)
  useEffect(() => {
    if (!dbContext || !selectedConnection) return;
    if (isMongo) {
      setQuery(buildMongoDefault(dbContext));
    } else if (isSql && dbContext.table) {
      const table = dbContext.schema
        ? `"${dbContext.schema}"."${dbContext.table}"`
        : dbContext.table;
      setQuery(`SELECT * FROM ${table}\nLIMIT ${queryLimit || 100};`);
    }
  }, [dbContext?.schema, dbContext?.table, isMongo, isSql]);

  // Register/re-register completion provider when metadata from sidebar changes
  useEffect(() => {
    if (completionProviderRef.current) {
      completionProviderRef.current.dispose();
      completionProviderRef.current = null;
    }

    if (monacoRef.current && isSql) {
      // Register with whatever metadata we have (empty = keywords only)
      completionProviderRef.current = registerSqlCompletionProvider(
        monacoRef.current,
        metadata || { schemas: [] }
      );
    }

    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
        completionProviderRef.current = null;
      }
    };
  }, [metadata, isSql]);

  const getExecutableQuery = useCallback(() => {
    // If there's a selection in the editor, use only the selected text
    if (editorRef.current) {
      const selection = editorRef.current.getSelection();
      if (selection && !selection.isEmpty()) {
        const selectedText = editorRef.current.getModel()?.getValueInRange(selection);
        if (selectedText?.trim()) return selectedText.trim();
      }
    }
    return query;
  }, [query]);

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!selectedConnection) throw new Error("No connection selected");
      let finalQuery = getExecutableQuery();
      // Auto-inject LIMIT for SQL SELECT queries if not already present
      if (isSql && queryLimit > 0) {
        const trimmed = finalQuery.trim().replace(/;+\s*$/, "");
        const upper = trimmed.toUpperCase();
        if (upper.startsWith("SELECT") && !upper.includes("LIMIT")) {
          finalQuery = trimmed + `\nLIMIT ${queryLimit};`;
        }
      }
      return apiClient.executeQuery(selectedConnection, finalQuery);
    },
    onSuccess: (result) => {
      onQueryExecute(result);
      setIsLoading(false);
      if (selectedConnection) {
        addQueryToHistory(selectedConnection.id, {
          query: getExecutableQuery(),
          timestamp: new Date().toISOString(),
          executionTime: result.executionTime,
          rowCount: result.rowCount,
        });
        setHistory(getQueryHistory(selectedConnection.id));
      }
    },
    onError: (error: Error) => {
      onError?.(error.message);
      setIsLoading(false);
      if (selectedConnection) {
        addQueryToHistory(selectedConnection.id, {
          query: getExecutableQuery(),
          timestamp: new Date().toISOString(),
          error: error.message,
        });
        setHistory(getQueryHistory(selectedConnection.id));
      }
    },
  });

  const handleExecute = useCallback(() => {
    if (!selectedConnection || !query.trim()) return;
    setIsLoading(true);
    executeMutation.mutate();
  }, [selectedConnection, query, setIsLoading, executeMutation]);

  const editorLabel = isVectorDb ? "Vector Search" : isMongo ? "MongoDB" : selectedConnection?.name || "";
  const buttonLabel = isVectorDb ? "Search" : "Run Query";
  const buttonIcon = isVectorDb ? <Search className="mr-1.5 h-3 w-3" /> : <Play className="mr-1.5 h-3 w-3" />;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 h-10 border-b">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{isVectorDb ? "Vector Query" : "Query Editor"}</h3>
          {selectedConnection && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Database className="h-3 w-3" />
              {editorLabel}
              {vectorContext?.index && isVectorDb && (
                <span className="text-teal-400">
                  / {vectorContext.index}
                  {vectorContext.namespace ? ` / ${vectorContext.namespace}` : ""}
                </span>
              )}
              {metadata && isSql && (
                <span className="text-emerald-400/50">
                  ({metadata.schemas.reduce((acc, s) => acc + s.tables.length, 0)} tables)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {selectedConnection && query.trim() && query !== SQL_DEFAULT && (
            <Button
              onClick={() => { setSaveDialogOpen(true); setSaveName(""); }}
              variant="outline" size="sm" className="h-7 text-xs px-2.5"
            >
              <Bookmark className="mr-1 h-3 w-3" />Save
            </Button>
          )}
          {selectedConnection && saved.length > 0 && (
            <Button
              onClick={() => { setShowSaved(!showSaved); setShowHistory(false); }}
              variant={showSaved ? "default" : "outline"}
              size="sm" className="h-7 text-xs px-2.5"
            >
              <Bookmark className="mr-1 h-3 w-3" />
              Saved
              <span className="ml-1 text-[10px] opacity-70">{saved.length}</span>
            </Button>
          )}
          {selectedConnection && history.length > 0 && (
            <Button
              onClick={() => { setShowHistory(!showHistory); setShowSaved(false); }}
              variant={showHistory ? "default" : "outline"}
              size="sm" className="h-7 text-xs px-2.5"
            >
              <History className="mr-1 h-3 w-3" />
              History
              <span className="ml-1 text-[10px] opacity-70">{history.length}</span>
            </Button>
          )}
          {isPinecone && (
            <Button
              onClick={() => { setQuery(PINECONE_LIST_INDEXES); setTimeout(handleExecute, 50); }}
              disabled={!selectedConnection || isLoading}
              variant="outline" size="sm" className="h-7 text-xs px-2.5"
            >List Indexes</Button>
          )}
          {isTurbopuffer && (
            <Button
              onClick={() => { setQuery('{\n  "operation": "list_namespaces"\n}'); setTimeout(handleExecute, 50); }}
              disabled={!selectedConnection || isLoading}
              variant="outline" size="sm" className="h-7 text-xs px-2.5"
            >List Namespaces</Button>
          )}
          <Button
            onClick={handleExecute}
            disabled={!selectedConnection || !query.trim() || isLoading}
            size="sm" className="h-7 text-xs px-2.5"
          >
            {isLoading ? (
              <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Running...</>
            ) : (
              <>{buttonIcon}{buttonLabel}</>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 relative">
        {/* Save dialog */}
        {saveDialogOpen && selectedConnection && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="bg-popover border rounded-lg shadow-lg p-4 w-72">
              <h4 className="text-xs font-medium mb-2">Save Query</h4>
              <input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveName.trim()) {
                    saveQuery(selectedConnection.id, saveName.trim(), query);
                    setSaved(getSavedQueries(selectedConnection.id));
                    setSaveDialogOpen(false);
                  }
                  if (e.key === "Escape") setSaveDialogOpen(false);
                }}
                placeholder="Query name..."
                className="w-full px-2 py-1.5 text-xs bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setSaveDialogOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">Cancel</button>
                <button
                  onClick={() => {
                    if (!saveName.trim()) return;
                    saveQuery(selectedConnection.id, saveName.trim(), query);
                    setSaved(getSavedQueries(selectedConnection.id));
                    setSaveDialogOpen(false);
                  }}
                  disabled={!saveName.trim()}
                  className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
                >Save</button>
              </div>
            </div>
          </div>
        )}
        {/* Saved queries panel */}
        {showSaved && selectedConnection && (
          <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur-sm overflow-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 bg-background/95 backdrop-blur-sm">
              <span className="text-xs font-medium">Saved Queries</span>
              <button onClick={() => setShowSaved(false)}>
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            {saved.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No saved queries yet</div>
            ) : (
              <div className="divide-y divide-border/50">
                {saved.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/50 transition-colors group">
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => { setQuery(entry.query); setShowSaved(false); }}
                    >
                      <div className="text-xs font-medium truncate">{entry.name}</div>
                      <pre className="text-[10px] font-mono truncate text-muted-foreground mt-0.5">{entry.query.split("\n").map(l => l.trim()).filter(Boolean).join(" ").slice(0, 100)}</pre>
                    </button>
                    <button
                      onClick={() => { deleteSavedQuery(selectedConnection.id, entry.id); setSaved(getSavedQueries(selectedConnection.id)); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all mt-1 flex-shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {showHistory && selectedConnection && (
          <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur-sm overflow-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 bg-background/95 backdrop-blur-sm">
              <span className="text-xs font-medium">Query History</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { clearQueryHistory(selectedConnection.id); setHistory([]); setShowHistory(false); }}
                  className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
                >Clear all</button>
                <button onClick={() => setShowHistory(false)}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            </div>
            <div className="divide-y divide-border/50">
              {history.map((entry, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors group"
                  onClick={() => { setQuery(entry.query); setShowHistory(false); }}
                >
                  <pre className="text-xs font-mono truncate text-foreground/80 group-hover:text-foreground">{entry.query.split("\n").map(l => l.trim()).filter(Boolean).join(" ").slice(0, 120)}</pre>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span>{new Date(entry.timestamp).toLocaleString()}</span>
                    {entry.executionTime != null && <span>{formatDuration(entry.executionTime)}</span>}
                    {entry.rowCount != null && <span>{entry.rowCount} rows</span>}
                    {entry.error && <span className="text-red-400">Error</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedConnection ? (
          <MonacoEditor
            height="100%"
            language={isJson ? "json" : "sql"}
            theme="vs-dark"
            value={query}
            onChange={(value) => setQuery(value || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 12, bottom: 12 },
              suggestOnTriggerCharacters: true,
              quickSuggestions: { other: true, strings: false, comments: false },
              parameterHints: { enabled: true },
              hover: { enabled: true },
              suggest: {
                showKeywords: true,
                showSnippets: true,
                insertMode: "insert" as const,
                filterGraceful: true,
                shareSuggestSelections: true,
              },
              acceptSuggestionOnCommitCharacter: true,
              tabCompletion: "on",
            }}
            onMount={(editor, monaco) => {
              monacoRef.current = monaco;
              editorRef.current = editor;

              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => { handleExecute(); }
              );

              // Track selection changes for "run selected" hint
              editor.onDidChangeCursorSelection(() => {
                const sel = editor.getSelection();
                setHasSelection(!!(sel && !sel.isEmpty()));
              });

              // Register immediately with whatever metadata we have
              if (isSql) {
                if (completionProviderRef.current) completionProviderRef.current.dispose();
                completionProviderRef.current = registerSqlCompletionProvider(
                  monaco, metadata || { schemas: [] }
                );
              }
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Database className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
              <p className="text-sm">Select a connection to start</p>
              <p className="text-xs mt-0.5">Connect to a database from the sidebar</p>
            </div>
          </div>
        )}
      </div>

      {selectedConnection && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t text-xs text-muted-foreground">
          <span>{hasSelection ? "Ctrl+Enter to run selection" : "Ctrl+Enter to execute"}</span>
          {isSql && (
            <div className="flex items-center gap-1.5">
              <span>Limit:</span>
              {[50, 100, 500, 1000].map((n) => (
                <button
                  key={n}
                  onClick={() => setQueryLimit(n)}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                    queryLimit === n
                      ? "bg-primary/20 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setQueryLimit(0)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  queryLimit === 0
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-muted"
                }`}
              >
                No limit
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
