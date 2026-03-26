import type {
  DatabaseConnection,
  CreateConnectionData,
  TestConnectionData,
  TestConnectionResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
  TableData,
} from '@/types';

const API_BASE_URL = '/api/v1';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Connection management
  async getConnections(): Promise<DatabaseConnection[]> {
    return this.request('/connections');
  }

  async createConnection(data: CreateConnectionData): Promise<DatabaseConnection> {
    return this.request('/connections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getConnection(id: string): Promise<DatabaseConnection> {
    return this.request(`/connections/${id}`);
  }

  async updateConnection(id: string, data: Partial<CreateConnectionData>): Promise<DatabaseConnection> {
    return this.request(`/connections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteConnection(id: string): Promise<void> {
    return this.request(`/connections/${id}`, {
      method: 'DELETE',
    });
  }

  async testConnection(data: TestConnectionData): Promise<TestConnectionResult> {
    return this.request('/connections/test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Database exploration
  async getDatabases(connectionId: string): Promise<DatabaseInfo[]> {
    return this.request(`/database/${connectionId}/databases`);
  }

  async getSchemas(connectionId: string): Promise<SchemaInfo[]> {
    return this.request(`/database/${connectionId}/schemas`);
  }

  async getTables(connectionId: string, schema: string): Promise<TableInfo[]> {
    return this.request(`/database/${connectionId}/schemas/${encodeURIComponent(schema)}/tables`);
  }

  async getColumns(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
    return this.request(`/database/${connectionId}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`);
  }

  // Query execution
  async executeQuery(connectionId: string, query: string): Promise<QueryResult> {
    return this.request('/query', {
      method: 'POST',
      body: JSON.stringify({
        connectionId,
        query,
      }),
    });
  }

  // Table data
  async getTableData(
    connectionId: string,
    schema: string,
    table: string,
    options: {
      page?: number;
      pageSize?: number;
      orderBy?: string;
      orderDir?: 'ASC' | 'DESC';
    } = {}
  ): Promise<TableData> {
    const params = new URLSearchParams();
    if (options.page) params.set('page', options.page.toString());
    if (options.pageSize) params.set('pageSize', options.pageSize.toString());
    if (options.orderBy) params.set('orderBy', options.orderBy);
    if (options.orderDir) params.set('orderDir', options.orderDir);

    return this.request(`/data/table?${params}`, {
      method: 'POST',
      body: JSON.stringify({
        connectionId,
        schema,
        table,
        ...options,
      }),
    });
  }
}

export const apiClient = new ApiClient();