"use client";

import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { BarChart3, Table, Loader2, AlertCircle, Box, Copy, Check, Download, Search, ArrowUp, ArrowDown, X, Hash, Type, Key, Braces, Calendar, ToggleLeft } from "lucide-react";
import type { QueryResult, TableData, VectorData } from "@/types";
import { formatDuration } from "@/lib/utils";

function ColumnTypeIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  if (t.includes("key") || t === "id") return <Key className="h-3 w-3 text-amber-400/70" />;
  if (t.includes("int") || t.includes("float") || t.includes("decimal") || t.includes("numeric") || t === "real" || t === "double")
    return <Hash className="h-3 w-3 text-orange-400/70" />;
  if (t.includes("bool")) return <ToggleLeft className="h-3 w-3 text-green-400/70" />;
  if (t.includes("json") || t.includes("object") || t.includes("array")) return <Braces className="h-3 w-3 text-emerald-400/70" />;
  if (t.includes("date") || t.includes("time") || t.includes("timestamp")) return <Calendar className="h-3 w-3 text-blue-400/70" />;
  if (t.includes("char") || t.includes("text") || t.includes("varchar") || t === "string" || t === "name")
    return <Type className="h-3 w-3 text-purple-400/70" />;
  return null;
}

function exportCsv(columns: { name: string }[], rows: Record<string, unknown>[]) {
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.name)).join(",");
  const body = rows.map((row) => columns.map((c) => escape(row[c.name])).join(",")).join("\n");
  downloadFile(`${header}\n${body}`, "results.csv", "text/csv");
}

function exportJson(rows: Record<string, unknown>[]) {
  downloadFile(JSON.stringify(rows, null, 2), "results.json", "application/json");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const VectorVisualization = lazy(() =>
  import("@/components/VectorVisualization").then((m) => ({
    default: m.VectorVisualization,
  }))
);

function JsonCell({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const json = JSON.stringify(value, null, 2);
  const preview = JSON.stringify(value);

  const handleClick = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 360);
    const y = rect.bottom + 4 > window.innerHeight - 260 ? rect.top - 260 : rect.bottom + 4;
    setPos({ x, y });
    setExpanded(!expanded);
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <span
        className="text-emerald-400 cursor-pointer hover:underline"
        onClick={handleClick}
      >
        {preview.length > 60 ? preview.slice(0, 60) + "…" : preview}
      </span>
      {expanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
          <div
            className="fixed z-50 bg-popover border rounded-md shadow-lg w-[340px] max-h-60 flex flex-col"
            style={{ left: pos.x, top: pos.y }}
          >
            <div className="flex items-center justify-between px-2 py-1 border-b border-border/50">
              <span className="text-[10px] text-muted-foreground">JSON</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="p-2 text-[11px] text-foreground whitespace-pre-wrap overflow-auto flex-1">{json}</pre>
          </div>
        </>
      )}
    </>
  );
}

function CopyableCell({ value, children }: { value: unknown; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="max-w-xs truncate group/cell relative cursor-pointer" onClick={handleCopy} title="Click to copy">
      {children}
      {copied && (
        <span className="absolute -top-5 left-0 bg-popover border text-[9px] px-1.5 py-0.5 rounded shadow-sm text-emerald-400 whitespace-nowrap z-10">
          Copied!
        </span>
      )}
    </div>
  );
}

interface ResultsProps {
  queryResult: QueryResult | null;
  tableData: TableData | null;
  isLoading: boolean;
  connectionType?: string;
  error?: string | null;
  onPageChange?: (page: number) => void;
}

type SortDir = "asc" | "desc";

export function Results({ queryResult, tableData, isLoading, connectionType, error, onPageChange }: ResultsProps) {
  const [view, setView] = useState<"table" | "3d">("table");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; row: Record<string, unknown> } | null>(null);
  const data = queryResult || tableData;

  const isVectorDb = connectionType === "pinecone" || connectionType === "turbopuffer";

  const vectorData = useMemo((): VectorData[] => {
    if (!data || !isVectorDb) return [];
    return (data.rows || [])
      .filter((row) => {
        const values = row.values || row.vector;
        return Array.isArray(values) && values.length > 0;
      })
      .map((row, i) => ({
        id: String(row.id || `vector-${i}`),
        values: (row.values || row.vector) as number[],
        metadata: (row.metadata || row.attributes) as Record<string, unknown> | undefined,
      }));
  }, [data, isVectorDb]);

  const handleSort = useCallback((colName: string) => {
    if (sortCol === colName) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(colName);
      setSortDir("asc");
    }
  }, [sortCol]);

  // Reset sort/search when data changes
  const dataKey = data ? JSON.stringify(data.columns?.map((c: { name: string }) => c.name)) : "";
  useMemo(() => {
    setSortCol(null);
    setSortDir("asc");
    setSearchQuery("");
  }, [dataKey]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 h-10 border-b">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-sm">Executing query...</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 mx-auto mb-1.5 animate-spin" />
            <p className="text-sm">Running query...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 h-10 border-b">
          <AlertCircle className="h-3.5 w-3.5 text-red-400" />
          <span className="text-sm text-red-400">Error</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <AlertCircle className="h-6 w-6 mx-auto mb-1.5 text-red-400" />
            <p className="text-sm text-red-400 break-words">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 h-10 border-b">
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="text-sm">Results</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Table className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-sm">No results yet</p>
            <p className="text-xs mt-0.5">Execute a query to see results</p>
          </div>
        </div>
      </div>
    );
  }

  const isQueryResult = "executionTime" in data;
  const rawRows = data.rows || [];
  const columns = isQueryResult
    ? data.columns
    : data.columns.map((col) => ({ name: col.name, type: col.dataType }));

  // Filter rows
  const filteredRows = searchQuery
    ? rawRows.filter((row) => {
        const q = searchQuery.toLowerCase();
        return columns.some((col) => {
          const v = row[col.name];
          if (v === null || v === undefined) return false;
          const s = typeof v === "object" ? JSON.stringify(v) : String(v);
          return s.toLowerCase().includes(q);
        });
      })
    : rawRows;

  // Sort rows
  const rows = sortCol
    ? [...filteredRows].sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        const as = String(av);
        const bs = String(bv);
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      })
    : filteredRows;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 h-10 border-b">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="text-sm">Results</span>
          {rawRows.length > 0 && (
            <button
              onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(""); }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                showSearch ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted"
              }`}
              title="Search results (Ctrl+F)"
            >
              <Search className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {isVectorDb && vectorData.length > 0 && (
            <button
              onClick={() => setView(view === "table" ? "3d" : "table")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                view === "3d" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
              }`}
            >
              <Box className="h-3 w-3" />
              3D View
            </button>
          )}
          {isQueryResult && queryResult?.executionTime && (
            <span>{formatDuration(queryResult.executionTime)}</span>
          )}
          <span>
            {searchQuery ? `${rows.length}/${rawRows.length}` : rows.length} row{rows.length !== 1 ? "s" : ""}
          </span>
          {queryResult?.affectedRows !== undefined && (
            <span>{queryResult.affectedRows} affected</span>
          )}
          {tableData && (
            <div className="flex items-center gap-1">
              {onPageChange && tableData.page > 1 && (
                <button
                  onClick={() => onPageChange(tableData.page - 1)}
                  className="px-1.5 py-0.5 rounded hover:bg-muted transition-colors text-[10px]"
                >Prev</button>
              )}
              <span>
                p.{tableData.page}/{Math.ceil(tableData.totalRows / tableData.pageSize)}
              </span>
              {onPageChange && tableData.page < Math.ceil(tableData.totalRows / tableData.pageSize) && (
                <button
                  onClick={() => onPageChange(tableData.page + 1)}
                  className="px-1.5 py-0.5 rounded hover:bg-muted transition-colors text-[10px]"
                >Next</button>
              )}
              <span className="text-[10px] opacity-70">({tableData.totalRows} total)</span>
            </div>
          )}
          {rows.length > 0 && (
            <div className="flex items-center gap-0.5 ml-1 border-l pl-2 border-border/50">
              <button
                onClick={() => exportCsv(columns, rows)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] hover:bg-muted transition-colors"
                title="Export as CSV"
              >
                <Download className="h-3 w-3" />CSV
              </button>
              <button
                onClick={() => exportJson(rows)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] hover:bg-muted transition-colors"
                title="Export as JSON"
              >
                <Download className="h-3 w-3" />JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
          <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); } }}
            placeholder="Filter rows..."
            className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/50"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {view === "3d" && vectorData.length > 0 ? (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            }
          >
            <VectorVisualization vectors={vectorData} />
          </Suspense>
        ) : rows.length === 0 && !searchQuery ? (
          <div className="p-6 text-center text-muted-foreground">
            <AlertCircle className="h-6 w-6 mx-auto mb-1.5" />
            <p className="text-sm">Query executed successfully</p>
            <p className="text-xs mt-0.5">No rows returned</p>
            {queryResult?.affectedRows !== undefined &&
              queryResult.affectedRows > 0 && (
                <p className="text-xs mt-0.5 text-green-400">
                  {queryResult.affectedRows} row
                  {queryResult.affectedRows !== 1 ? "s" : ""} affected
                </p>
              )}
          </div>
        ) : rows.length === 0 && searchQuery ? (
          <div className="p-6 text-center text-muted-foreground">
            <Search className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-sm">No matching rows</p>
            <p className="text-xs mt-0.5">Try a different search term</p>
          </div>
        ) : (
          <div className="min-w-full">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0 z-[1]">
                <tr>
                  <th className="px-2 py-1.5 text-right font-medium text-[10px] text-muted-foreground w-10">#</th>
                  {columns.map((column, index) => {
                    const nullCount = rows.filter((r) => r[column.name] === null || r[column.name] === undefined).length;
                    const distinctCount = new Set(rows.map((r) => JSON.stringify(r[column.name]))).size;
                    return (
                      <th
                        key={index}
                        className="px-3 py-1.5 text-left font-medium text-xs cursor-pointer hover:bg-muted/80 select-none"
                        onClick={() => handleSort(column.name)}
                        title={`${distinctCount} distinct, ${nullCount} null`}
                      >
                        <div className="flex items-center gap-1.5">
                          <ColumnTypeIcon type={column.type} />
                          <span>{column.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {column.type}
                          </span>
                          {sortCol === column.name && (
                            sortDir === "asc"
                              ? <ArrowUp className="h-3 w-3 text-primary flex-shrink-0" />
                              : <ArrowDown className="h-3 w-3 text-primary flex-shrink-0" />
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="border-t hover:bg-muted/50"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setRowMenu({ x: e.clientX, y: e.clientY, row });
                    }}
                  >
                    <td className="px-2 py-1 text-right text-[10px] text-muted-foreground/50 select-none">{rowIndex + 1}</td>
                    {columns.map((column, colIndex) => {
                      const value = row[column.name];
                      return (
                        <td key={colIndex} className="px-3 py-1">
                          <CopyableCell value={value}>
                            {value === null || value === undefined ? (
                              <span className="text-muted-foreground italic">
                                NULL
                              </span>
                            ) : typeof value === "object" ? (
                              <JsonCell value={value} />
                            ) : typeof value === "boolean" ? (
                              <span
                                className={
                                  value ? "text-green-400" : "text-red-400"
                                }
                              >
                                {value.toString()}
                              </span>
                            ) : typeof value === "number" ? (
                              <span className="text-orange-400">{value}</span>
                            ) : (
                              <span>{String(value)}</span>
                            )}
                          </CopyableCell>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row context menu */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div
            className="fixed z-50 bg-popover border rounded-md shadow-lg py-1 min-w-[160px]"
            style={{ left: rowMenu.x, top: rowMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(rowMenu.row, null, 2));
                setRowMenu(null);
              }}
            >
              <Copy className="h-3 w-3" />Copy as JSON
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => {
                const cols = columns.map((c) => c.name);
                const vals = cols.map((c) => {
                  const v = rowMenu.row[c];
                  if (v === null || v === undefined) return "NULL";
                  if (typeof v === "number" || typeof v === "boolean") return String(v);
                  return `'${String(v).replace(/'/g, "''")}'`;
                });
                const sql = `INSERT INTO table_name (${cols.join(", ")}) VALUES (${vals.join(", ")});`;
                navigator.clipboard.writeText(sql);
                setRowMenu(null);
              }}
            >
              <Copy className="h-3 w-3" />Copy as INSERT
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => {
                const vals = columns.map((c) => {
                  const v = rowMenu.row[c.name];
                  return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
                });
                navigator.clipboard.writeText(vals.join("\t"));
                setRowMenu(null);
              }}
            >
              <Copy className="h-3 w-3" />Copy as TSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
