package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/we-building-autonomously/muzli/internal/models"
)

type MySQLService struct {
	mu    sync.Mutex
	conns map[string]*sql.DB
}

func NewMySQLService() *MySQLService {
	return &MySQLService{
		conns: make(map[string]*sql.DB),
	}
}

func (s *MySQLService) getDB(conn *models.Connection) (*sql.DB, error) {
	key := fmt.Sprintf("%s:%d:%s", conn.Host, conn.Port, conn.DatabaseName)

	s.mu.Lock()
	defer s.mu.Unlock()

	if db, exists := s.conns[key]; exists {
		if err := db.Ping(); err == nil {
			return db, nil
		}
		db.Close()
		delete(s.conns, key)
	}

	tls := "false"
	if conn.SSL {
		tls = "true"
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?tls=%s&parseTime=true&timeout=10s",
		conn.Username, conn.Password, conn.Host, conn.Port, conn.DatabaseName, tls)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open MySQL connection: %w", err)
	}

	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(time.Hour)

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to connect to MySQL: %w", err)
	}

	s.conns[key] = db
	return db, nil
}

func (s *MySQLService) TestConnection(req models.TestConnectionRequest) (*models.TestConnectionResponse, error) {
	conn := &models.Connection{
		Host: req.Host, Port: req.Port, DatabaseName: req.DatabaseName,
		Username: req.Username, Password: req.Password, SSL: req.SSL,
	}

	db, err := s.getDB(conn)
	if err != nil {
		return &models.TestConnectionResponse{Success: false, Message: err.Error()}, nil
	}

	var version string
	if err := db.QueryRow("SELECT VERSION()").Scan(&version); err != nil {
		return &models.TestConnectionResponse{Success: false, Message: err.Error()}, nil
	}

	return &models.TestConnectionResponse{
		Success: true, Message: "Connection successful", Version: "MySQL " + version,
	}, nil
}

func (s *MySQLService) ExecuteQuery(connectionID, query string, connectionService *ConnectionService) (*models.QueryResult, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}

	db, err := s.getDB(conn)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	startTime := time.Now()
	trimmed := strings.TrimSpace(strings.ToLower(query))
	isSelect := strings.HasPrefix(trimmed, "select") || strings.HasPrefix(trimmed, "show") || strings.HasPrefix(trimmed, "describe") || strings.HasPrefix(trimmed, "explain") || strings.HasPrefix(trimmed, "with")

	if isSelect {
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			return nil, fmt.Errorf("query failed: %w", err)
		}
		defer rows.Close()

		colNames, err := rows.Columns()
		if err != nil {
			return nil, err
		}
		colTypes, _ := rows.ColumnTypes()

		columns := make([]models.ColumnResult, len(colNames))
		for i, name := range colNames {
			typ := "unknown"
			if i < len(colTypes) {
				typ = colTypes[i].DatabaseTypeName()
			}
			columns[i] = models.ColumnResult{Name: name, Type: typ}
		}

		var results []models.RowResult
		vals := make([]interface{}, len(colNames))
		ptrs := make([]interface{}, len(colNames))
		for i := range vals {
			ptrs[i] = &vals[i]
		}

		for rows.Next() {
			if err := rows.Scan(ptrs...); err != nil {
				return nil, err
			}
			row := make(models.RowResult)
			for i, name := range colNames {
				v := vals[i]
				if b, ok := v.([]byte); ok {
					row[name] = string(b)
				} else {
					row[name] = v
				}
			}
			results = append(results, row)
		}

		return &models.QueryResult{
			Columns: columns, Rows: results, RowCount: len(results),
			ExecutionTime: time.Since(startTime).Seconds() * 1000,
		}, nil
	}

	result, err := db.ExecContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	affected, _ := result.RowsAffected()
	a := int(affected)
	return &models.QueryResult{
		Columns: []models.ColumnResult{}, Rows: []models.RowResult{}, RowCount: 0,
		ExecutionTime: time.Since(startTime).Seconds() * 1000, AffectedRows: &a,
	}, nil
}

func (s *MySQLService) GetDatabases(connectionID string, connectionService *ConnectionService) ([]models.DatabaseInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}
	db, err := s.getDB(conn)
	if err != nil {
		return nil, err
	}

	rows, err := db.Query("SHOW DATABASES")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var databases []models.DatabaseInfo
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		databases = append(databases, models.DatabaseInfo{Name: name})
	}
	return databases, nil
}

func (s *MySQLService) GetSchemas(connectionID string, connectionService *ConnectionService) ([]models.SchemaInfo, error) {
	// MySQL databases are schemas
	dbs, err := s.GetDatabases(connectionID, connectionService)
	if err != nil {
		return nil, err
	}
	schemas := make([]models.SchemaInfo, len(dbs))
	for i, db := range dbs {
		schemas[i] = models.SchemaInfo{Name: db.Name}
	}
	return schemas, nil
}

func (s *MySQLService) GetTables(connectionID, schema string, connectionService *ConnectionService) ([]models.TableInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}
	db, err := s.getDB(conn)
	if err != nil {
		return nil, err
	}

	query := `SELECT TABLE_NAME, TABLE_SCHEMA, TABLE_TYPE 
		FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`

	rows, err := db.Query(query, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []models.TableInfo
	for rows.Next() {
		var t models.TableInfo
		var tableType string
		if err := rows.Scan(&t.Name, &t.Schema, &tableType); err != nil {
			return nil, err
		}
		switch strings.ToUpper(tableType) {
		case "BASE TABLE":
			t.Type = "table"
		case "VIEW":
			t.Type = "view"
		default:
			t.Type = strings.ToLower(tableType)
		}
		tables = append(tables, t)
	}
	return tables, nil
}

func (s *MySQLService) GetColumns(connectionID, schema, table string, connectionService *ConnectionService) ([]models.ColumnInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}
	db, err := s.getDB(conn)
	if err != nil {
		return nil, err
	}

	query := `SELECT 
		c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE = 'YES', c.COLUMN_DEFAULT,
		c.CHARACTER_MAXIMUM_LENGTH, c.NUMERIC_PRECISION, c.NUMERIC_SCALE, c.COLUMN_KEY
		FROM information_schema.COLUMNS c
		WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
		ORDER BY c.ORDINAL_POSITION`

	rows, err := db.Query(query, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []models.ColumnInfo
	for rows.Next() {
		var col models.ColumnInfo
		var columnKey string
		if err := rows.Scan(&col.Name, &col.DataType, &col.IsNullable, &col.DefaultValue,
			&col.MaxLength, &col.Precision, &col.Scale, &columnKey); err != nil {
			return nil, err
		}
		col.IsPrimaryKey = columnKey == "PRI"
		col.IsForeignKey = columnKey == "MUL"
		columns = append(columns, col)
	}
	return columns, nil
}

func (s *MySQLService) GetTableData(req models.TableDataRequest, connectionService *ConnectionService) (*models.TableDataResponse, error) {
	conn, err := connectionService.GetConnection(req.ConnectionID)
	if err != nil {
		return nil, err
	}
	db, err := s.getDB(conn)
	if err != nil {
		return nil, err
	}

	columns, err := s.GetColumns(req.ConnectionID, req.Schema, req.Table, connectionService)
	if err != nil {
		return nil, err
	}

	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 {
		req.PageSize = 50
	}
	if req.PageSize > 1000 {
		req.PageSize = 1000
	}

	var totalRows int
	countQ := fmt.Sprintf("SELECT COUNT(*) FROM `%s`.`%s`", req.Schema, req.Table)
	if err := db.QueryRow(countQ).Scan(&totalRows); err != nil {
		return nil, err
	}

	offset := (req.Page - 1) * req.PageSize
	dataQ := fmt.Sprintf("SELECT * FROM `%s`.`%s`", req.Schema, req.Table)
	if req.OrderBy != "" {
		dir := "ASC"
		if strings.ToUpper(req.OrderDir) == "DESC" {
			dir = "DESC"
		}
		dataQ += fmt.Sprintf(" ORDER BY `%s` %s", req.OrderBy, dir)
	}
	dataQ += fmt.Sprintf(" LIMIT %d OFFSET %d", req.PageSize, offset)

	rows, err := db.Query(dataQ)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	colNames, _ := rows.Columns()
	var results []models.RowResult
	vals := make([]interface{}, len(colNames))
	ptrs := make([]interface{}, len(colNames))
	for i := range vals {
		ptrs[i] = &vals[i]
	}

	for rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		row := make(models.RowResult)
		for i, name := range colNames {
			v := vals[i]
			if b, ok := v.([]byte); ok {
				row[name] = string(b)
			} else {
				row[name] = v
			}
		}
		results = append(results, row)
	}

	return &models.TableDataResponse{
		Columns: columns, Rows: results, TotalRows: totalRows, Page: req.Page, PageSize: req.PageSize,
	}, nil
}

func (s *MySQLService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, db := range s.conns {
		db.Close()
	}
	s.conns = make(map[string]*sql.DB)
}
