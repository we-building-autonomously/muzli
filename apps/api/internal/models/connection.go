package models

import (
	"time"
)

type Connection struct {
	ID           string    `json:"id" db:"id"`
	Name         string    `json:"name" db:"name"`
	Host         string    `json:"host" db:"host"`
	Port         int       `json:"port" db:"port"`
	DatabaseName string    `json:"database" db:"database_name"`
	Username     string    `json:"username" db:"username"`
	Password     string    `json:"password,omitempty" db:"password"`
	SSL          bool      `json:"ssl" db:"ssl"`
	CreatedAt    time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt    time.Time `json:"updatedAt" db:"updated_at"`
}

type CreateConnectionRequest struct {
	Name         string `json:"name" binding:"required"`
	Host         string `json:"host" binding:"required"`
	Port         int    `json:"port" binding:"required,min=1,max=65535"`
	DatabaseName string `json:"database" binding:"required"`
	Username     string `json:"username" binding:"required"`
	Password     string `json:"password"`
	SSL          bool   `json:"ssl"`
}

type UpdateConnectionRequest struct {
	Name         string `json:"name"`
	Host         string `json:"host"`
	Port         int    `json:"port" binding:"omitempty,min=1,max=65535"`
	DatabaseName string `json:"database"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	SSL          bool   `json:"ssl"`
}

type TestConnectionRequest struct {
	Host         string `json:"host" binding:"required"`
	Port         int    `json:"port" binding:"required,min=1,max=65535"`
	DatabaseName string `json:"database" binding:"required"`
	Username     string `json:"username" binding:"required"`
	Password     string `json:"password"`
	SSL          bool   `json:"ssl"`
}

type TestConnectionResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Version string `json:"version,omitempty"`
}

type DatabaseInfo struct {
	Name      string `json:"name"`
	Owner     string `json:"owner"`
	Encoding  string `json:"encoding"`
	Collation string `json:"collation"`
	Ctypes    string `json:"ctypes"`
}

type SchemaInfo struct {
	Name  string `json:"name"`
	Owner string `json:"owner"`
}

type TableInfo struct {
	Name     string `json:"name"`
	Schema   string `json:"schema"`
	Type     string `json:"type"`
	Owner    string `json:"owner"`
	RowCount *int   `json:"rowCount,omitempty"`
}

type ColumnInfo struct {
	Name         string  `json:"name"`
	DataType     string  `json:"dataType"`
	IsNullable   bool    `json:"isNullable"`
	DefaultValue *string `json:"defaultValue"`
	IsPrimaryKey bool    `json:"isPrimaryKey"`
	IsForeignKey bool    `json:"isForeignKey"`
	MaxLength    *int    `json:"maxLength"`
	Precision    *int    `json:"precision"`
	Scale        *int    `json:"scale"`
}

type QueryResult struct {
	Columns       []ColumnResult `json:"columns"`
	Rows          []RowResult    `json:"rows"`
	RowCount      int            `json:"rowCount"`
	ExecutionTime float64        `json:"executionTime"`
	AffectedRows  *int           `json:"affectedRows,omitempty"`
}

type ColumnResult struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type RowResult map[string]interface{}

type QueryRequest struct {
	ConnectionID string `json:"connectionId" binding:"required"`
	Query        string `json:"query" binding:"required"`
}

type TableDataRequest struct {
	ConnectionID string `json:"connectionId" binding:"required"`
	Schema       string `json:"schema" binding:"required"`
	Table        string `json:"table" binding:"required"`
	Page         int    `json:"page"`
	PageSize     int    `json:"pageSize"`
	OrderBy      string `json:"orderBy"`
	OrderDir     string `json:"orderDir"`
}

type TableDataResponse struct {
	Columns   []ColumnInfo  `json:"columns"`
	Rows      []RowResult   `json:"rows"`
	TotalRows int           `json:"totalRows"`
	Page      int           `json:"page"`
	PageSize  int           `json:"pageSize"`
}