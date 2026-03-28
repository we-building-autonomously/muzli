import type { DatabaseConnection, SchemaInfo, TableInfo, ColumnInfo } from "@/types";
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
  "CONSTRAINT", "NOT NULL", "WITH", "RECURSIVE", "RETURNING", "EXPLAIN",
  "ANALYZE", "VACUUM", "TRUNCATE", "BEGIN", "COMMIT", "ROLLBACK",
  "GRANT", "REVOKE", "TRIGGER", "FUNCTION", "PROCEDURE", "RETURNS",
  "LANGUAGE", "VOLATILE", "STABLE", "IMMUTABLE", "SECURITY", "DEFINER",
];

const SQL_TYPES = [
  "integer", "int", "bigint", "smallint", "serial", "bigserial",
  "text", "varchar", "char", "character varying",
  "boolean", "bool", "date", "time", "timestamp", "timestamptz",
  "numeric", "decimal", "real", "double precision", "float",
  "json", "jsonb", "uuid", "bytea", "array", "inet", "cidr",
  "interval", "money", "xml", "point", "line", "polygon",
];

export function registerSqlCompletionProvider(
  monaco: any,
  metadata: DbMetadata
): { dispose: () => void } {
  const provider = monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " ", "("],
    provideCompletionItems(model: any, position: any) {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: any[] = [];
      const lastChar = textUntilPosition.slice(-1);
      const textBefore = textUntilPosition.trimEnd().toLowerCase();

      // After a dot: schema.table or table.column
      if (lastChar === "." || textUntilPosition.endsWith(".")) {
        const beforeDot = textUntilPosition.replace(/\.\s*$/, "").split(/\s+/).pop() || "";
        const cleanName = beforeDot.replace(/"/g, "");

        // Check if it's a schema name → suggest tables
        const schema = metadata.schemas.find(
          (s) => s.name.toLowerCase() === cleanName.toLowerCase()
        );
        if (schema) {
          for (const table of schema.tables) {
            suggestions.push({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: table.name,
              detail: table.type,
              range,
            });
          }
          return { suggestions };
        }

        // Check if it's a table name → suggest columns
        for (const s of metadata.schemas) {
          const table = s.tables.find(
            (t) => t.name.toLowerCase() === cleanName.toLowerCase()
          );
          if (table) {
            for (const col of table.columns) {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: col.dataType + (col.isPrimaryKey ? " (PK)" : ""),
                range,
              });
            }
            return { suggestions };
          }
        }
      }

      // After FROM, JOIN, INTO, UPDATE, TABLE: suggest schemas and tables
      const afterTableKeyword = /\b(from|join|into|update|table|truncate)\s+$/i.test(textBefore) ||
        /\b(from|join|into|update|table|truncate)\s+\w*$/i.test(textBefore);

      if (afterTableKeyword) {
        for (const schema of metadata.schemas) {
          suggestions.push({
            label: schema.name,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: schema.name,
            detail: "schema",
            range,
          });
          for (const table of schema.tables) {
            const qualified = metadata.schemas.length > 1
              ? `${schema.name}.${table.name}`
              : table.name;
            suggestions.push({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: table.name,
              detail: `${schema.name}.${table.name} (${table.type})`,
              range,
            });
          }
        }
        return { suggestions };
      }

      // General: keywords + schemas + tables + columns
      for (const kw of SQL_KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        });
      }

      for (const t of SQL_TYPES) {
        suggestions.push({
          label: t,
          kind: monaco.languages.CompletionItemKind.TypeParameter,
          insertText: t,
          range,
        });
      }

      for (const schema of metadata.schemas) {
        suggestions.push({
          label: schema.name,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: schema.name,
          detail: "schema",
          range,
        });
        for (const table of schema.tables) {
          suggestions.push({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: table.name,
            detail: `${schema.name} (${table.type})`,
            range,
          });
          for (const col of table.columns) {
            suggestions.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              detail: `${table.name}.${col.name} (${col.dataType})`,
              range,
            });
          }
        }
      }

      return { suggestions };
    },
  });

  return provider;
}
