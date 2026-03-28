export interface DatabaseConnection {
  id: string;
  name: string;
  type: "postgres" | "mongodb" | "mysql" | "sqlite" | "redis" | "pinecone" | "turbopuffer";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionData {
  name: string;
  type: "postgres" | "mongodb" | "mysql" | "sqlite" | "redis" | "pinecone" | "turbopuffer";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

export interface VectorData {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

export interface TestConnectionData {
  type: "postgres" | "mongodb" | "mysql" | "sqlite" | "redis" | "pinecone" | "turbopuffer";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  version?: string;
}

export interface DatabaseInfo {
  name: string;
  owner: string;
  encoding: string;
  collation: string;
  ctypes: string;
}

export interface SchemaInfo {
  name: string;
  owner: string;
}

export interface TableInfo {
  name: string;
  schema: string;
  type: "table" | "view" | "materialized_view";
  owner: string;
  rowCount?: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

export interface QueryResult {
  columns: Array<{
    name: string;
    type: string;
  }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTime: number;
  affectedRows?: number;
}

export interface TableData {
  columns: ColumnInfo[];
  rows: Array<Record<string, unknown>>;
  totalRows: number;
  page: number;
  pageSize: number;
}

export interface PineconeIndex {
  name: string;
  host: string;
  metric: string;
  dimension: number;
  namespaces: string[];
}

export interface DbContext {
  schema: string;
  table: string;
}

export interface VectorSearchContext {
  index: string;
  host: string;
  namespace: string;
  dimension: number;
}

export interface SidebarItem {
  id: string;
  type: "connection" | "database" | "schema" | "table" | "column";
  name: string;
  parent?: string;
  expanded?: boolean;
  children?: SidebarItem[];
  icon?: React.ReactNode;
  data?: unknown;
}
