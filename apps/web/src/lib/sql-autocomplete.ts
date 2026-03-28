import type { TableInfo, ColumnInfo } from "@/types";
import type { DatabaseConnection } from "@/types";
import { apiClient } from "@/api/client";

export interface DbMetadata {
  schemas: {
    name: string;
    tables: {
      name: string;
      type: string;
      columns: { name: string; dataType: string; isPrimaryKey: boolean }[];
    }[];
  }[];
}

export async function loadDbMetadata(conn: DatabaseConnection): Promise<DbMetadata> {
  const schemas = await apiClient.getSchemas(conn);
  const result: DbMetadata = { schemas: [] };

  await Promise.all(
    schemas.map(async (schema) => {
      const tables = await apiClient.getTables(conn, schema.name).catch(() => [] as TableInfo[]);
      const tablesWithCols = await Promise.all(
        tables.map(async (table) => {
          const columns = await apiClient.getColumns(conn, schema.name, table.name).catch(() => [] as ColumnInfo[]);
          return {
            name: table.name,
            type: table.type || "table",
            columns: columns.map((c) => ({
              name: c.name,
              dataType: c.dataType,
              isPrimaryKey: c.isPrimaryKey,
            })),
          };
        })
      );
      result.schemas.push({ name: schema.name, tables: tablesWithCols });
    })
  );

  return result;
}

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN",
  "LIKE", "ILIKE", "IS", "NULL", "TRUE", "FALSE", "AS", "ON", "JOIN",
  "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS", "NATURAL",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "ALTER",
  "DROP", "TABLE", "INDEX", "VIEW", "SCHEMA", "DATABASE", "COLUMN",
  "ADD", "RENAME", "CASCADE", "RESTRICT", "IF", "THEN", "ELSE", "END",
  "CASE", "WHEN", "GROUP", "BY", "ORDER", "ASC", "DESC", "HAVING",
  "LIMIT", "OFFSET", "UNION", "ALL", "INTERSECT", "EXCEPT", "DISTINCT",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "NULLIF", "CAST",
  "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE", "CHECK", "DEFAULT",
  "CONSTRAINT", "WITH", "RECURSIVE", "RETURNING", "EXPLAIN",
  "ANALYZE", "VACUUM", "TRUNCATE", "BEGIN", "COMMIT", "ROLLBACK",
  "GRANT", "REVOKE", "TRIGGER", "FUNCTION", "PROCEDURE", "RETURNS",
  "LANGUAGE", "VOLATILE", "STABLE", "IMMUTABLE", "SECURITY", "DEFINER",
];

export function registerSqlCompletionProvider(
  monaco: any,
  metadata: DbMetadata
): { dispose: () => void } {
  const provider = monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " ", "\n", "(", ","],

    provideCompletionItems(model: any, position: any) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.substring(0, position.column - 1);

      const suggestions: any[] = [];
      let sortBase = 0;

      // Check if cursor is right after a dot (e.g., "public." or "users.")
      const dotMatch = textBeforeCursor.match(/(\w+)\.\s*(\w*)$/);
      if (dotMatch) {
        const prefix = dotMatch[1];
        // Adjust range for word after dot
        const afterDotWord = dotMatch[2];
        const adjustedRange = {
          ...range,
          startColumn: position.column - afterDotWord.length,
        };

        // Schema.table
        const schema = metadata.schemas.find(
          (s) => s.name.toLowerCase() === prefix.toLowerCase()
        );
        if (schema) {
          for (const table of schema.tables) {
            suggestions.push({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Struct,
              insertText: table.name,
              detail: `${table.type} in ${schema.name}`,
              sortText: `0_${table.name}`,
              range: adjustedRange,
            });
          }
          return { suggestions };
        }

        // Table.column
        for (const s of metadata.schemas) {
          const table = s.tables.find(
            (t) => t.name.toLowerCase() === prefix.toLowerCase()
          );
          if (table) {
            for (const col of table.columns) {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: `${col.dataType}${col.isPrimaryKey ? " PK" : ""}`,
                sortText: `0_${col.name}`,
                range: adjustedRange,
              });
            }
            return { suggestions };
          }
        }
        return { suggestions };
      }

      // Always add: schemas, tables, columns with priority ordering
      // Tables get highest priority (most commonly typed)
      for (const schema of metadata.schemas) {
        suggestions.push({
          label: schema.name,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: schema.name,
          detail: "schema",
          sortText: `2_${schema.name}`,
          range,
        });

        for (const table of schema.tables) {
          // Insert fully qualified schema.table for unambiguous queries
          const qualified = `"${schema.name}"."${table.name}"`;
          suggestions.push({
            label: `${schema.name}.${table.name}`,
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: qualified,
            detail: table.type,
            sortText: `0_${table.name}`,
            range,
          });
          // Also offer just table name for convenience
          suggestions.push({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: table.name,
            detail: `${schema.name} · ${table.type}`,
            sortText: `0z_${table.name}`,
            range,
          });

          for (const col of table.columns) {
            suggestions.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              detail: `${table.name} · ${col.dataType}${col.isPrimaryKey ? " PK" : ""}`,
              sortText: `1_${col.name}`,
              range,
            });
          }
        }
      }

      // SQL keywords (lower priority)
      for (const kw of SQL_KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          sortText: `3_${kw}`,
          range,
        });
        // Also add lowercase version
        suggestions.push({
          label: kw.toLowerCase(),
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw.toLowerCase(),
          sortText: `3_${kw.toLowerCase()}`,
          range,
        });
      }

      return { suggestions };
    },
  });

  return provider;
}
