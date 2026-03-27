"use client";

import { BarChart3, Table, Loader2, AlertCircle } from "lucide-react";
import type { QueryResult, TableData } from "@/types";
import { formatDuration } from "@/lib/utils";

interface ResultsProps {
  queryResult: QueryResult | null;
  tableData: TableData | null;
  isLoading: boolean;
}

export function Results({ queryResult, tableData, isLoading }: ResultsProps) {
  const data = queryResult || tableData;

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 p-4 border-b">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Executing query...</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
            <p>Running query...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 p-4 border-b">
          <BarChart3 className="h-4 w-4" />
          <span>Results</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Table className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No results yet</p>
            <p className="text-sm mt-1">Execute a query to see results here</p>
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
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          <span>Results</span>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {isQueryResult && queryResult?.executionTime && (
            <span>Time: {formatDuration(queryResult.executionTime)}</span>
          )}
          <span>
            Rows: {rows.length} row{rows.length !== 1 ? "s" : ""}
          </span>
          {queryResult?.affectedRows !== undefined && (
            <span>Affected: {queryResult.affectedRows}</span>
          )}
          {tableData && (
            <span>
              Page {tableData.page} of{" "}
              {Math.ceil(tableData.totalRows / tableData.pageSize)}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Query executed successfully</p>
            <p className="text-sm mt-1">No rows returned</p>
            {queryResult?.affectedRows !== undefined &&
              queryResult.affectedRows > 0 && (
                <p className="text-sm mt-1 text-green-400">
                  {queryResult.affectedRows} row
                  {queryResult.affectedRows !== 1 ? "s" : ""} affected
                </p>
              )}
          </div>
        ) : (
          <div className="min-w-full">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={index}
                      className="px-4 py-2 text-left font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <span>{column.name}</span>
                        <span className="text-xs text-muted-foreground">
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
                        <td key={colIndex} className="px-4 py-2">
                          <div className="max-w-xs truncate">
                            {value === null || value === undefined ? (
                              <span className="text-muted-foreground italic">
                                NULL
                              </span>
                            ) : typeof value === "object" ? (
                              <span className="text-blue-400">
                                {JSON.stringify(value)}
                              </span>
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
