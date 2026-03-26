export interface DatabaseConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  ssl: boolean;
  createdAt: Date;
  updatedAt: Date;
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
  type: 'table' | 'view' | 'materialized_view';
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

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimaryKey: boolean;
  method: string;
}

export interface ConstraintInfo {
  name: string;
  type: 'primary_key' | 'foreign_key' | 'unique' | 'check';
  columns: string[];
  referencedTable?: string;
  referencedColumns?: string[];
  definition?: string;
}

export interface QueryResult {
  columns: Array<{
    name: string;
    type: string;
  }>;
  rows: Array<Record<string, any>>;
  rowCount: number;
  executionTime: number;
  affectedRows?: number;
}

export interface QueryError {
  message: string;
  position?: number;
  severity: string;
  code?: string;
}

export interface TableData {
  columns: ColumnInfo[];
  rows: Array<Record<string, any>>;
  totalRows: number;
  page: number;
  pageSize: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  version?: string;
}