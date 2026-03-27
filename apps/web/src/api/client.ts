import type {
  DatabaseConnection,
  TestConnectionData,
  TestConnectionResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
  TableData,
} from "@/types";

type ConnectionDetails = {
  type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
};

function toConnectionDetails(conn: DatabaseConnection): ConnectionDetails {
  return {
    type: conn.type,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    password: conn.password || "",
    ssl: conn.ssl,
  };
}

const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL || "") + "/api/v1";

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async testConnection(
    data: TestConnectionData
  ): Promise<TestConnectionResult> {
    return this.request("/connections/test", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getDatabases(conn: DatabaseConnection): Promise<DatabaseInfo[]> {
    return this.request("/database/databases", {
      method: "POST",
      body: JSON.stringify({ connection: toConnectionDetails(conn) }),
    });
  }

  async getSchemas(conn: DatabaseConnection): Promise<SchemaInfo[]> {
    return this.request("/database/schemas", {
      method: "POST",
      body: JSON.stringify({ connection: toConnectionDetails(conn) }),
    });
  }

  async getTables(conn: DatabaseConnection, schema: string): Promise<TableInfo[]> {
    return this.request("/database/tables", {
      method: "POST",
      body: JSON.stringify({ connection: toConnectionDetails(conn), schema }),
    });
  }

  async getColumns(
    conn: DatabaseConnection,
    schema: string,
    table: string
  ): Promise<ColumnInfo[]> {
    return this.request("/database/columns", {
      method: "POST",
      body: JSON.stringify({ connection: toConnectionDetails(conn), schema, table }),
    });
  }

  async executeQuery(
    conn: DatabaseConnection,
    query: string
  ): Promise<QueryResult> {
    return this.request("/query", {
      method: "POST",
      body: JSON.stringify({
        connection: toConnectionDetails(conn),
        query,
      }),
    });
  }

  async getTableData(
    conn: DatabaseConnection,
    schema: string,
    table: string,
    options: {
      page?: number;
      pageSize?: number;
      orderBy?: string;
      orderDir?: "ASC" | "DESC";
    } = {}
  ): Promise<TableData> {
    return this.request("/data/table", {
      method: "POST",
      body: JSON.stringify({
        connection: toConnectionDetails(conn),
        schema,
        table,
        ...options,
      }),
    });
  }
}

export const apiClient = new ApiClient();
