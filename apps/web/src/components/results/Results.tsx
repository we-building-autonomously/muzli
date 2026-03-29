"use client";

import { useState, useMemo, lazy, Suspense } from "react";
import { BarChart3, Table, Loader2, AlertCircle, Box, Copy, Check, Download } from "lucide-react";
import type { QueryResult, TableData, VectorData } from "@/types";
import { formatDuration } from "@/lib/utils";

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

interface ResultsProps {
  queryResult: QueryResult | null;
  tableData: TableData | null;
  isLoading: boolean;
  connectionType?: string;
  error?: string | null;
}

export function Results({ queryResult, tableData, isLoading, connectionType, error }: ResultsProps) {
  const [view, setView] = useState<"table" | "3d">("table");
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
  const rows = data.rows || [];
  const columns = isQueryResult
    ? data.columns
    : data.columns.map((col) => ({ name: col.name, type: col.dataType }));

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 h-10 border-b">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="text-sm">Results</span>
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
            {rows.length} row{rows.length !== 1 ? "s" : ""}
          </span>
          {queryResult?.affectedRows !== undefined && (
            <span>{queryResult.affectedRows} affected</span>
          )}
          {tableData && (
            <span>
              p.{tableData.page}/{Math.ceil(tableData.totalRows / tableData.pageSize)}
            </span>
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
        ) : rows.length === 0 ? (
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
        ) : (
          <div className="min-w-full">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={index}
                      className="px-3 py-1.5 text-left font-medium text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{column.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {column.type}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t hover:bg-muted/50">
                    {columns.map((column, colIndex) => {
                      const value = row[column.name];
                      return (
                        <td key={colIndex} className="px-3 py-1">
                          <div className="max-w-xs truncate">
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
                          </div>
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
    </div>
  );
}
