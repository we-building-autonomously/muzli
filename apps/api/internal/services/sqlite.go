package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/we-building-autonomously/muzli/internal/models"
)

type SQLiteService struct {
	mu    sync.Mutex
	conns map[string]*sql.DB
}

func NewSQLiteService() *SQLiteService {
	return &SQLiteService{
		conns: make(map[string]*sql.DB),
	}
}

func (s *SQLiteService) getDB(conn *models.Connection) (*sql.DB, error) {
	// Use Host field as file path; fallback to DatabaseName
	path := conn.Host
	if path == "" {
		path = conn.DatabaseName
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if db, exists := s.conns[path]; exists {
		if err := db.Ping(); err == nil {
			return db, nil
		}
		db.Close()
		delete(s.conns, path)
	}

	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("failed to open SQLite database: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to connect to SQLite: %w", err)
	}

	s.conns[path] = db
	return db, nil
}

func (s *SQLiteService) TestConnection(req models.TestConnectionRequest) (*models.TestConnectionResponse, error) {
	conn := &models.Connection{
		Host: req.Host, DatabaseName: req.DatabaseName,
	}

	db, err := s.getDB(conn)
	if err != nil {
		return &models.TestConnectionResponse{Success: false, Message: err.Error()}, nil
	}

	var version string
	if err := db.QueryRow("SELECT sqlite_version()").Scan(&version); err != nil {
		return &models.TestConnectionResponse{Success: false, Message: err.Error()}, nil
	}

	return &models.TestConnectionResponse{
		Success: true, Message: "Connection successful", Version: "SQLite " + version,
	}, nil
}

func (s *SQLiteService) ExecuteQuery(connectionID, query string, connectionService *ConnectionService) (*models.QueryResult, error) {
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
	isSelect := strings.HasPrefix(trimmed, "select") || strings.HasPrefix(trimmed, "pragma") || strings.HasPrefix(trimmed, "with") || strings.HasPrefix(trimmed, "explain")

	if isSelect {
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			return nil, fmt.Errorf("query failed: %w", err)
		}
		defer rows.Close()

		colNames, _ := rows.Columns()
		colTypes, _ := rows.ColumnTypes()
		columns := make([]models.ColumnResult, len(colNames))
		for i, name := range colNames {
			typ := "text"
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

func (s *SQLiteService) GetDatabases(_ string, _ *ConnectionService) ([]models.DatabaseInfo, error) {
	return []models.DatabaseInfo{{Name: "main"}}, nil
}

func (s *SQLiteService) GetSchemas(_ string, _ *ConnectionService) ([]models.SchemaInfo, error) {
	return []models.SchemaInfo{{Name: "main"}}, nil
}

func (s *SQLiteService) GetTables(connectionID, _ string, connectionService *ConnectionService) ([]models.TableInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}
	db, err := s.getDB(conn)
	if err != nil {
		return nil, err
	}

	rows, err := db.Query("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []models.TableInfo
	for rows.Next() {
		var t models.TableInfo
		if err := rows.Scan(&t.Name, &t.Type); err != nil {
			return nil, err
		}
		t.Schema = "main"
		tables = append(tables, t)
	}
	return tables, nil
}

func (s *SQLiteService) GetColumns(connectionID, _, table string, connectionService *ConnectionService) ([]models.ColumnInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}
	db, err := s.getDB(conn)
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(`%s`)", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []models.ColumnInfo
	for rows.Next() {
		var cid int
		var name, dataType string
		var notNull, pk int
		var dfltValue *string
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &dfltValue, &pk); err != nil {
			return nil, err
		}
		columns = append(columns, models.ColumnInfo{
			Name: name, DataType: dataType, IsNullable: notNull == 0,
			DefaultValue: dfltValue, IsPrimaryKey: pk > 0,
		})
	}
	return columns, nil
}

func (s *SQLiteService) GetTableData(req models.TableDataRequest, connectionService *ConnectionService) (*models.TableDataResponse, error) {
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
	if err := db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM `%s`", req.Table)).Scan(&totalRows); err != nil {
		return nil, err
	}

	offset := (req.Page - 1) * req.PageSize
	dataQ := fmt.Sprintf("SELECT * FROM `%s`", req.Table)
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

func (s *SQLiteService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, db := range s.conns {
		db.Close()
	}
	s.conns = make(map[string]*sql.DB)
}
