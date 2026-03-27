package models

type Connection struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Type         string `json:"type"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	DatabaseName string `json:"database"`
	Username     string `json:"username"`
	Password     string `json:"password,omitempty"`
	SSL          bool   `json:"ssl"`
}

type ConnectionDetails struct {
	Type     string `json:"type" binding:"required"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`
	Password string `json:"password"`
	SSL      bool   `json:"ssl"`
}

func (cd ConnectionDetails) ToConnection() *Connection {
	return &Connection{
		Type:         cd.Type,
		Host:         cd.Host,
		Port:         cd.Port,
		DatabaseName: cd.Database,
		Username:     cd.Username,
		Password:     cd.Password,
		SSL:          cd.SSL,
	}
}

type TestConnectionRequest struct {
	Type         string `json:"type" binding:"required"`
	Host         string `json:"host" binding:"required"`
	Port         int    `json:"port" binding:"omitempty,min=0,max=65535"`
	DatabaseName string `json:"database"`
	Username     string `json:"username"`
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
	Connection ConnectionDetails `json:"connection" binding:"required"`
	Query      string            `json:"query" binding:"required"`
}

type DatabaseExploreRequest struct {
	Connection ConnectionDetails `json:"connection" binding:"required"`
}

type SchemaExploreRequest struct {
	Connection ConnectionDetails `json:"connection" binding:"required"`
}

type TableExploreRequest struct {
	Connection ConnectionDetails `json:"connection" binding:"required"`
	Schema     string            `json:"schema"`
}

type ColumnExploreRequest struct {
	Connection ConnectionDetails `json:"connection" binding:"required"`
	Schema     string            `json:"schema"`
	Table      string            `json:"table" binding:"required"`
}

type TableDataRequest struct {
	Connection ConnectionDetails `json:"connection" binding:"required"`
	Schema     string            `json:"schema"`
	Table      string            `json:"table" binding:"required"`
	Page       int               `json:"page"`
	PageSize   int               `json:"pageSize"`
	OrderBy    string            `json:"orderBy"`
	OrderDir   string            `json:"orderDir"`
}

type TableDataResponse struct {
	Columns   []ColumnInfo  `json:"columns"`
	Rows      []RowResult   `json:"rows"`
	TotalRows int           `json:"totalRows"`
	Page      int           `json:"page"`
	PageSize  int           `json:"pageSize"`
}
