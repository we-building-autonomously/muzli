package services

import (
	"context"
	"crypto/tls"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/we-building-autonomously/muzli/internal/models"
)

type RedisService struct {
	mu      sync.Mutex
	clients map[string]*redis.Client
}

func NewRedisService() *RedisService {
	return &RedisService{
		clients: make(map[string]*redis.Client),
	}
}

func (s *RedisService) getClient(conn *models.Connection) (*redis.Client, error) {
	dbNum := 0
	if conn.DatabaseName != "" {
		if n, err := strconv.Atoi(conn.DatabaseName); err == nil {
			dbNum = n
		}
	}

	key := fmt.Sprintf("%s:%d:%d", conn.Host, conn.Port, dbNum)

	s.mu.Lock()
	defer s.mu.Unlock()

	if client, exists := s.clients[key]; exists {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := client.Ping(ctx).Err(); err == nil {
			return client, nil
		}
		client.Close()
		delete(s.clients, key)
	}

	opts := &redis.Options{
		Addr:     fmt.Sprintf("%s:%d", conn.Host, conn.Port),
		Password: conn.Password,
		DB:       dbNum,
	}
	if conn.SSL {
		opts.TLSConfig = &tls.Config{}
	}

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	s.clients[key] = client
	return client, nil
}

func (s *RedisService) TestConnection(req models.TestConnectionRequest) (*models.TestConnectionResponse, error) {
	conn := &models.Connection{
		Host: req.Host, Port: req.Port, DatabaseName: req.DatabaseName,
		Password: req.Password, SSL: req.SSL,
	}

	client, err := s.getClient(conn)
	if err != nil {
		return &models.TestConnectionResponse{Success: false, Message: err.Error()}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	info, err := client.Info(ctx, "server").Result()
	if err != nil {
		return &models.TestConnectionResponse{Success: false, Message: err.Error()}, nil
	}

	version := "Redis"
	for _, line := range strings.Split(info, "\n") {
		if strings.HasPrefix(line, "redis_version:") {
			version = "Redis " + strings.TrimSpace(strings.TrimPrefix(line, "redis_version:"))
			break
		}
	}

	return &models.TestConnectionResponse{
		Success: true, Message: "Connection successful", Version: version,
	}, nil
}

func (s *RedisService) ExecuteQuery(conn *models.Connection, query string) (*models.QueryResult, error) {
	client, err := s.getClient(conn)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	startTime := time.Now()

	parts := strings.Fields(query)
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty command")
	}

	args := make([]interface{}, len(parts))
	for i, p := range parts {
		args[i] = p
	}

	result, err := client.Do(ctx, args...).Result()
	if err != nil && err != redis.Nil {
		return nil, fmt.Errorf("redis command failed: %w", err)
	}

	executionTime := time.Since(startTime).Seconds() * 1000
	rows := resultToRows(result)

	columns := []models.ColumnResult{{Name: "result", Type: "string"}}
	if len(rows) > 0 {
		// Check if rows have key/value structure
		if _, hasKey := rows[0]["key"]; hasKey {
			columns = []models.ColumnResult{{Name: "key", Type: "string"}, {Name: "value", Type: "string"}}
		}
	}

	return &models.QueryResult{
		Columns: columns, Rows: rows, RowCount: len(rows), ExecutionTime: executionTime,
	}, nil
}

func resultToRows(result interface{}) []models.RowResult {
	if result == nil {
		return []models.RowResult{{"result": "(nil)"}}
	}

	switch v := result.(type) {
	case string:
		return []models.RowResult{{"result": v}}
	case int64:
		return []models.RowResult{{"result": v}}
	case []interface{}:
		rows := make([]models.RowResult, 0, len(v))
		// Check if it's a hash result (alternating key/value)
		for i := 0; i < len(v); i++ {
			rows = append(rows, models.RowResult{"result": fmt.Sprintf("%v", v[i])})
		}
		return rows
	default:
		return []models.RowResult{{"result": fmt.Sprintf("%v", v)}}
	}
}

func (s *RedisService) GetDatabases(_ *models.Connection) ([]models.DatabaseInfo, error) {
	dbs := make([]models.DatabaseInfo, 16)
	for i := 0; i < 16; i++ {
		dbs[i] = models.DatabaseInfo{Name: fmt.Sprintf("db%d", i)}
	}
	return dbs, nil
}

func (s *RedisService) GetSchemas(_ *models.Connection) ([]models.SchemaInfo, error) {
	return []models.SchemaInfo{{Name: "default"}}, nil
}

func (s *RedisService) GetTables(conn *models.Connection, _ string) ([]models.TableInfo, error) {
	client, err := s.getClient(conn)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Scan keys (limit to first 1000)
	var keys []string
	var cursor uint64
	for {
		var batch []string
		var err error
		batch, cursor, err = client.Scan(ctx, cursor, "*", 100).Result()
		if err != nil {
			return nil, err
		}
		keys = append(keys, batch...)
		if cursor == 0 || len(keys) >= 1000 {
			break
		}
	}

	// Group by prefix (before first :)
	prefixes := make(map[string]int)
	for _, key := range keys {
		prefix := key
		if idx := strings.Index(key, ":"); idx > 0 {
			prefix = key[:idx] + ":*"
		}
		prefixes[prefix]++
	}

	tables := make([]models.TableInfo, 0, len(prefixes))
	for prefix, count := range prefixes {
		rc := count
		tables = append(tables, models.TableInfo{
			Name: prefix, Schema: "default", Type: "keyspace", RowCount: &rc,
		})
	}
	return tables, nil
}

func (s *RedisService) GetColumns(_ *models.Connection, _, _ string) ([]models.ColumnInfo, error) {
	return []models.ColumnInfo{
		{Name: "key", DataType: "string", IsNullable: false, IsPrimaryKey: true},
		{Name: "type", DataType: "string", IsNullable: false},
		{Name: "value", DataType: "string", IsNullable: true},
		{Name: "ttl", DataType: "integer", IsNullable: true},
	}, nil
}

func (s *RedisService) GetTableData(conn *models.Connection, req models.TableDataRequest) (*models.TableDataResponse, error) {
	client, err := s.getClient(conn)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pattern := req.Table
	if !strings.Contains(pattern, "*") {
		if strings.HasSuffix(pattern, ":*") {
			// already a pattern
		} else {
			pattern = pattern + "*"
		}
	}

	// Scan matching keys
	var allKeys []string
	var cursor uint64
	for {
		var batch []string
		batch, cursor, err = client.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return nil, err
		}
		allKeys = append(allKeys, batch...)
		if cursor == 0 || len(allKeys) >= 10000 {
			break
		}
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

	totalRows := len(allKeys)
	start := (req.Page - 1) * req.PageSize
	end := start + req.PageSize
	if start > len(allKeys) {
		start = len(allKeys)
	}
	if end > len(allKeys) {
		end = len(allKeys)
	}
	pageKeys := allKeys[start:end]

	columns := []models.ColumnInfo{
		{Name: "key", DataType: "string", IsPrimaryKey: true},
		{Name: "type", DataType: "string"},
		{Name: "value", DataType: "string"},
		{Name: "ttl", DataType: "integer"},
	}

	rows := make([]models.RowResult, 0, len(pageKeys))
	for _, key := range pageKeys {
		keyType, _ := client.Type(ctx, key).Result()
		ttl, _ := client.TTL(ctx, key).Result()

		var value string
		switch keyType {
		case "string":
			value, _ = client.Get(ctx, key).Result()
		case "list":
			vals, _ := client.LRange(ctx, key, 0, 9).Result()
			value = strings.Join(vals, ", ")
		case "set":
			vals, _ := client.SMembers(ctx, key).Result()
			value = strings.Join(vals, ", ")
		case "hash":
			m, _ := client.HGetAll(ctx, key).Result()
			pairs := make([]string, 0, len(m))
			for k, v := range m {
				pairs = append(pairs, k+"="+v)
			}
			value = strings.Join(pairs, ", ")
		case "zset":
			vals, _ := client.ZRange(ctx, key, 0, 9).Result()
			value = strings.Join(vals, ", ")
		default:
			value = fmt.Sprintf("(%s)", keyType)
		}

		ttlSec := int(ttl.Seconds())
		ttlStr := fmt.Sprintf("%d", ttlSec)
		if ttlSec < 0 {
			ttlStr = "no expiry"
		}

		rows = append(rows, models.RowResult{
			"key": key, "type": keyType, "value": value, "ttl": ttlStr,
		})
	}

	return &models.TableDataResponse{
		Columns: columns, Rows: rows, TotalRows: totalRows, Page: req.Page, PageSize: req.PageSize,
	}, nil
}

func (s *RedisService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, client := range s.clients {
		client.Close()
	}
	s.clients = make(map[string]*redis.Client)
}
