package services

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/we-building-autonomously/muzli/internal/models"
)

type QueryService struct {
	connections  map[string]*pgxpool.Pool
	mongoService *MongoService
}

func NewQueryService() *QueryService {
	return &QueryService{
		connections:  make(map[string]*pgxpool.Pool),
		mongoService: NewMongoService(),
	}
}

func (s *QueryService) getConnection(conn *models.Connection) (*pgxpool.Pool, error) {
	key := fmt.Sprintf("%s:%d:%s", conn.Host, conn.Port, conn.DatabaseName)

	if pool, exists := s.connections[key]; exists {
		return pool, nil
	}

	sslMode := "disable"
	if conn.SSL {
		sslMode = "require"
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		conn.Username, conn.Password, conn.Host, conn.Port, conn.DatabaseName, sslMode)

	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to parse connection string: %w", err)
	}

	config.MaxConns = 5
	config.MinConns = 1
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = time.Minute * 30

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	s.connections[key] = pool
	return pool, nil
}

func (s *QueryService) TestConnection(req models.TestConnectionRequest) (*models.TestConnectionResponse, error) {
	if req.Type == "mongodb" {
		return s.mongoService.TestConnection(req)
	}

	conn := &models.Connection{
		Host:         req.Host,
		Port:         req.Port,
		DatabaseName: req.DatabaseName,
		Username:     req.Username,
		Password:     req.Password,
		SSL:          req.SSL,
	}

	pool, err := s.getConnection(conn)
	if err != nil {
		return &models.TestConnectionResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var version string
	err = pool.QueryRow(ctx, "SELECT version()").Scan(&version)
	if err != nil {
		return &models.TestConnectionResponse{
			Success: false,
			Message: fmt.Sprintf("Connection failed: %s", err.Error()),
		}, nil
	}

	return &models.TestConnectionResponse{
		Success: true,
		Message: "Connection successful",
		Version: version,
	}, nil
}

func (s *QueryService) ExecuteQuery(connectionID string, query string, connectionService *ConnectionService) (*models.QueryResult, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}

	if conn.Type == "mongodb" {
		return s.mongoService.ExecuteQuery(connectionID, query, connectionService)
	}

	pool, err := s.getConnection(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	startTime := time.Now()

	trimmedQuery := strings.TrimSpace(strings.ToLower(query))
	isSelect := strings.HasPrefix(trimmedQuery, "select") || strings.HasPrefix(trimmedQuery, "with")

	if isSelect {
		return s.executeSelectQuery(ctx, pool, query, startTime)
	} else {
		return s.executeNonSelectQuery(ctx, pool, query, startTime)
	}
}

func (s *QueryService) executeSelectQuery(ctx context.Context, pool *pgxpool.Pool, query string, startTime time.Time) (*models.QueryResult, error) {
	rows, err := pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query execution failed: %w", err)
	}
	defer rows.Close()

	var columns []models.ColumnResult
	var results []models.RowResult

	for rows.Next() {
		if len(columns) == 0 {
			// Get column information on first row
			fieldDescriptions := rows.FieldDescriptions()
			for _, fd := range fieldDescriptions {
				columns = append(columns, models.ColumnResult{
					Name: fd.Name,
					Type: strconv.FormatUint(uint64(fd.DataTypeOID), 10),
				})
			}
		}

		values, err := rows.Values()
		if err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		row := make(models.RowResult)
		for i, value := range values {
			row[columns[i].Name] = value
		}
		results = append(results, row)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}

	executionTime := time.Since(startTime).Seconds() * 1000 // Convert to milliseconds

	return &models.QueryResult{
		Columns:       columns,
		Rows:          results,
		RowCount:      len(results),
		ExecutionTime: executionTime,
	}, nil
}

func (s *QueryService) executeNonSelectQuery(ctx context.Context, pool *pgxpool.Pool, query string, startTime time.Time) (*models.QueryResult, error) {
	result, err := pool.Exec(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query execution failed: %w", err)
	}

	executionTime := time.Since(startTime).Seconds() * 1000 // Convert to milliseconds
	affectedRows := int(result.RowsAffected())

	return &models.QueryResult{
		Columns:       []models.ColumnResult{},
		Rows:          []models.RowResult{},
		RowCount:      0,
		ExecutionTime: executionTime,
		AffectedRows:  &affectedRows,
	}, nil
}

func (s *QueryService) GetDatabases(connectionID string, connectionService *ConnectionService) ([]models.DatabaseInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}

	if conn.Type == "mongodb" {
		return s.mongoService.GetDatabases(connectionID, connectionService)
	}

	pool, err := s.getConnection(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT datname, pg_catalog.pg_get_userbyid(datdba) as owner, 
			   pg_encoding_to_char(encoding) as encoding,
			   datcollate, datctype
		FROM pg_database 
		WHERE datistemplate = false
		ORDER BY datname
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query databases: %w", err)
	}
	defer rows.Close()

	var databases []models.DatabaseInfo
	for rows.Next() {
		var db models.DatabaseInfo
		err := rows.Scan(&db.Name, &db.Owner, &db.Encoding, &db.Collation, &db.Ctypes)
		if err != nil {
			return nil, fmt.Errorf("failed to scan database: %w", err)
		}
		databases = append(databases, db)
	}

	return databases, nil
}

func (s *QueryService) GetSchemas(connectionID string, connectionService *ConnectionService) ([]models.SchemaInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}

	if conn.Type == "mongodb" {
		return s.mongoService.GetSchemas(connectionID, connectionService)
	}

	pool, err := s.getConnection(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT schema_name, schema_owner
		FROM information_schema.schemata
		WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
		ORDER BY schema_name
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query schemas: %w", err)
	}
	defer rows.Close()

	var schemas []models.SchemaInfo
	for rows.Next() {
		var schema models.SchemaInfo
		err := rows.Scan(&schema.Name, &schema.Owner)
		if err != nil {
			return nil, fmt.Errorf("failed to scan schema: %w", err)
		}
		schemas = append(schemas, schema)
	}

	return schemas, nil
}

func (s *QueryService) GetTables(connectionID, schema string, connectionService *ConnectionService) ([]models.TableInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}

	if conn.Type == "mongodb" {
		return s.mongoService.GetCollections(connectionID, connectionService)
	}

	pool, err := s.getConnection(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT table_name, table_schema, table_type, 
			   COALESCE(pg_catalog.pg_get_userbyid(c.relowner), '') as owner
		FROM information_schema.tables t
		LEFT JOIN pg_catalog.pg_class c ON c.relname = t.table_name
		WHERE table_schema = $1
		ORDER BY table_name
	`

	rows, err := pool.Query(ctx, query, schema)
	if err != nil {
		return nil, fmt.Errorf("failed to query tables: %w", err)
	}
	defer rows.Close()

	var tables []models.TableInfo
	for rows.Next() {
		var table models.TableInfo
		var tableType string
		err := rows.Scan(&table.Name, &table.Schema, &tableType, &table.Owner)
		if err != nil {
			return nil, fmt.Errorf("failed to scan table: %w", err)
		}

		switch strings.ToLower(tableType) {
		case "base table":
			table.Type = "table"
		case "view":
			table.Type = "view"
		default:
			table.Type = strings.ToLower(tableType)
		}

		tables = append(tables, table)
	}

	return tables, nil
}

func (s *QueryService) GetColumns(connectionID, schema, table string, connectionService *ConnectionService) ([]models.ColumnInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}

	if conn.Type == "mongodb" {
		return s.mongoService.GetColumns(connectionID, table, connectionService)
	}

	pool, err := s.getConnection(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT 
			c.column_name,
			c.data_type,
			c.is_nullable = 'YES' as is_nullable,
			c.column_default,
			c.character_maximum_length,
			c.numeric_precision,
			c.numeric_scale,
			COALESCE(pk.is_primary, false) as is_primary_key,
			COALESCE(fk.is_foreign, false) as is_foreign_key
		FROM information_schema.columns c
		LEFT JOIN (
			SELECT kcu.column_name, true as is_primary
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
			WHERE tc.constraint_type = 'PRIMARY KEY'
			AND tc.table_schema = $1 AND tc.table_name = $2
		) pk ON c.column_name = pk.column_name
		LEFT JOIN (
			SELECT kcu.column_name, true as is_foreign
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
			WHERE tc.constraint_type = 'FOREIGN KEY'
			AND tc.table_schema = $1 AND tc.table_name = $2
		) fk ON c.column_name = fk.column_name
		WHERE c.table_schema = $1 AND c.table_name = $2
		ORDER BY c.ordinal_position
	`

	rows, err := pool.Query(ctx, query, schema, table)
	if err != nil {
		return nil, fmt.Errorf("failed to query columns: %w", err)
	}
	defer rows.Close()

	var columns []models.ColumnInfo
	for rows.Next() {
		var col models.ColumnInfo
		err := rows.Scan(&col.Name, &col.DataType, &col.IsNullable, &col.DefaultValue,
			&col.MaxLength, &col.Precision, &col.Scale, &col.IsPrimaryKey, &col.IsForeignKey)
		if err != nil {
			return nil, fmt.Errorf("failed to scan column: %w", err)
		}
		columns = append(columns, col)
	}

	return columns, nil
}

func (s *QueryService) GetTableData(req models.TableDataRequest, connectionService *ConnectionService) (*models.TableDataResponse, error) {
	conn, err := connectionService.GetConnection(req.ConnectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}

	if conn.Type == "mongodb" {
		return s.mongoService.GetTableData(req, connectionService)
	}

	pool, err := s.getConnection(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get column information
	columns, err := s.GetColumns(req.ConnectionID, req.Schema, req.Table, connectionService)
	if err != nil {
		return nil, fmt.Errorf("failed to get columns: %w", err)
	}

	// Set defaults
	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 {
		req.PageSize = 50
	}
	if req.PageSize > 1000 {
		req.PageSize = 1000
	}

	// Get total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM %s.%s", pgx.Identifier{req.Schema}.Sanitize(), pgx.Identifier{req.Table}.Sanitize())
	var totalRows int
	err = pool.QueryRow(ctx, countQuery).Scan(&totalRows)
	if err != nil {
		return nil, fmt.Errorf("failed to get total rows: %w", err)
	}

	// Build data query
	offset := (req.Page - 1) * req.PageSize
	dataQuery := fmt.Sprintf("SELECT * FROM %s.%s", pgx.Identifier{req.Schema}.Sanitize(), pgx.Identifier{req.Table}.Sanitize())

	if req.OrderBy != "" {
		direction := "ASC"
		if strings.ToUpper(req.OrderDir) == "DESC" {
			direction = "DESC"
		}
		dataQuery += fmt.Sprintf(" ORDER BY %s %s", pgx.Identifier{req.OrderBy}.Sanitize(), direction)
	}

	dataQuery += fmt.Sprintf(" LIMIT %d OFFSET %d", req.PageSize, offset)

	// Execute data query
	rows, err := pool.Query(ctx, dataQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query table data: %w", err)
	}
	defer rows.Close()

	var results []models.RowResult
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		row := make(models.RowResult)
		for i, value := range values {
			if i < len(columns) {
				row[columns[i].Name] = value
			}
		}
		results = append(results, row)
	}

	return &models.TableDataResponse{
		Columns:   columns,
		Rows:      results,
		TotalRows: totalRows,
		Page:      req.Page,
		PageSize:  req.PageSize,
	}, nil
}

func (s *QueryService) Close() {
	for _, pool := range s.connections {
		pool.Close()
	}
	s.connections = make(map[string]*pgxpool.Pool)
	s.mongoService.Close()
}