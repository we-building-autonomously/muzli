package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/we-building-autonomously/muzli/internal/models"
)

type PineconeService struct {
	mu      sync.Mutex
	clients map[string]*pineconeClient
}

type pineconeClient struct {
	host   string
	apiKey string
	http   *http.Client
}

func NewPineconeService() *PineconeService {
	return &PineconeService{
		clients: make(map[string]*pineconeClient),
	}
}

func (s *PineconeService) getClient(conn *models.Connection) *pineconeClient {
	key := conn.Host
	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.clients[key]; ok {
		return c
	}
	c := &pineconeClient{
		host:   conn.Host,
		apiKey: conn.Password,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
	s.clients[key] = c
	return c
}

func (c *pineconeClient) do(ctx context.Context, method, path string, body interface{}) (map[string]interface{}, error) {
	url := fmt.Sprintf("https://%s%s", c.host, path)

	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Api-Key", c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("pinecone API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result map[string]interface{}
	if len(respBody) > 0 {
		if err := json.Unmarshal(respBody, &result); err != nil {
			return nil, fmt.Errorf("failed to parse response: %w", err)
		}
	}
	return result, nil
}

func (s *PineconeService) TestConnection(req models.TestConnectionRequest) (*models.TestConnectionResponse, error) {
	conn := &models.Connection{Host: req.Host, Password: req.Password, SSL: true}
	client := s.getClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.do(ctx, "GET", "/describe_index_stats", nil)
	if err != nil {
		return &models.TestConnectionResponse{Success: false, Message: err.Error()}, nil
	}

	dim := ""
	if d, ok := result["dimension"]; ok {
		dim = fmt.Sprintf("Pinecone (dimension: %v)", d)
	} else {
		dim = "Pinecone"
	}

	return &models.TestConnectionResponse{
		Success: true,
		Message: "Connection successful",
		Version: dim,
	}, nil
}

func (s *PineconeService) ExecuteQuery(connectionID, query string, connectionService *ConnectionService) (*models.QueryResult, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}
	client := s.getClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	startTime := time.Now()

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(query), &parsed); err != nil {
		return nil, fmt.Errorf("query must be valid JSON: %w", err)
	}

	operation, _ := parsed["operation"].(string)
	if operation == "" {
		return nil, fmt.Errorf("query must include 'operation' field (query, upsert, fetch, delete)")
	}

	var result map[string]interface{}

	switch operation {
	case "query":
		body := map[string]interface{}{}
		if v, ok := parsed["vector"]; ok {
			body["vector"] = v
		}
		if v, ok := parsed["topK"]; ok {
			body["topK"] = v
		} else {
			body["topK"] = 10
		}
		if v, ok := parsed["filter"]; ok {
			body["filter"] = v
		}
		if v, ok := parsed["namespace"]; ok && v != "" {
			body["namespace"] = v
		}
		if v, ok := parsed["includeMetadata"]; ok {
			body["includeMetadata"] = v
		} else {
			body["includeMetadata"] = true
		}
		if v, ok := parsed["includeValues"]; ok {
			body["includeValues"] = v
		}
		result, err = client.do(ctx, "POST", "/query", body)

	case "upsert":
		body := map[string]interface{}{}
		if v, ok := parsed["vectors"]; ok {
			body["vectors"] = v
		}
		if v, ok := parsed["namespace"]; ok && v != "" {
			body["namespace"] = v
		}
		result, err = client.do(ctx, "POST", "/vectors/upsert", body)

	case "fetch":
		ids, _ := parsed["ids"].([]interface{})
		namespace, _ := parsed["namespace"].(string)
		path := "/vectors/fetch?"
		for i, id := range ids {
			if i > 0 {
				path += "&"
			}
			path += fmt.Sprintf("ids=%v", id)
		}
		if namespace != "" {
			path += "&namespace=" + namespace
		}
		result, err = client.do(ctx, "GET", path, nil)

	case "delete":
		body := map[string]interface{}{}
		if v, ok := parsed["ids"]; ok {
			body["ids"] = v
		}
		if v, ok := parsed["namespace"]; ok && v != "" {
			body["namespace"] = v
		}
		if v, ok := parsed["deleteAll"]; ok {
			body["deleteAll"] = v
		}
		if v, ok := parsed["filter"]; ok {
			body["filter"] = v
		}
		result, err = client.do(ctx, "POST", "/vectors/delete", body)

	default:
		return nil, fmt.Errorf("unknown operation: %s (supported: query, upsert, fetch, delete)", operation)
	}

	if err != nil {
		return nil, err
	}

	executionTime := time.Since(startTime).Seconds() * 1000

	// Convert result to rows
	rows := []models.RowResult{}
	columns := []models.ColumnResult{{Name: "result", Type: "json"}}

	if matches, ok := result["matches"].([]interface{}); ok {
		columns = []models.ColumnResult{
			{Name: "id", Type: "string"},
			{Name: "score", Type: "float"},
			{Name: "values", Type: "vector"},
			{Name: "metadata", Type: "object"},
		}
		for _, m := range matches {
			match, _ := m.(map[string]interface{})
			row := models.RowResult{
				"id":       match["id"],
				"score":    match["score"],
				"values":   match["values"],
				"metadata": match["metadata"],
			}
			rows = append(rows, row)
		}
	} else if vectors, ok := result["vectors"].(map[string]interface{}); ok {
		columns = []models.ColumnResult{
			{Name: "id", Type: "string"},
			{Name: "values", Type: "vector"},
			{Name: "metadata", Type: "object"},
		}
		for id, v := range vectors {
			vec, _ := v.(map[string]interface{})
			row := models.RowResult{
				"id":       id,
				"values":   vec["values"],
				"metadata": vec["metadata"],
			}
			rows = append(rows, row)
		}
	} else {
		rows = append(rows, models.RowResult{"result": result})
	}

	return &models.QueryResult{
		Columns:       columns,
		Rows:          rows,
		RowCount:      len(rows),
		ExecutionTime: executionTime,
	}, nil
}

func (s *PineconeService) GetDatabases(connectionID string, connectionService *ConnectionService) ([]models.DatabaseInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}
	return []models.DatabaseInfo{
		{Name: conn.Host, Owner: "pinecone"},
	}, nil
}

func (s *PineconeService) getIndexStats(conn *models.Connection) (map[string]interface{}, error) {
	client := s.getClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return client.do(ctx, "GET", "/describe_index_stats", nil)
}

func (s *PineconeService) GetSchemas(connectionID string, connectionService *ConnectionService) ([]models.SchemaInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}

	stats, err := s.getIndexStats(conn)
	if err != nil {
		return nil, err
	}

	schemas := []models.SchemaInfo{{Name: "", Owner: "default"}}
	if namespaces, ok := stats["namespaces"].(map[string]interface{}); ok {
		for ns := range namespaces {
			if ns != "" {
				schemas = append(schemas, models.SchemaInfo{Name: ns})
			}
		}
	}
	return schemas, nil
}

func (s *PineconeService) GetTables(connectionID, schema string, connectionService *ConnectionService) ([]models.TableInfo, error) {
	conn, err := connectionService.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}

	stats, err := s.getIndexStats(conn)
	if err != nil {
		return nil, err
	}

	tables := []models.TableInfo{}
	if namespaces, ok := stats["namespaces"].(map[string]interface{}); ok {
		for ns, info := range namespaces {
			nsInfo, _ := info.(map[string]interface{})
			var count *int
			if vc, ok := nsInfo["vectorCount"].(float64); ok {
				c := int(vc)
				count = &c
			}
			name := ns
			if name == "" {
				name = "(default)"
			}
			tables = append(tables, models.TableInfo{
				Name: name, Schema: "vectors", Type: "namespace", RowCount: count,
			})
		}
	}
	if len(tables) == 0 {
		tables = append(tables, models.TableInfo{Name: "(default)", Schema: "vectors", Type: "namespace"})
	}
	return tables, nil
}

func (s *PineconeService) GetColumns(_ string, _ string, _ string, _ *ConnectionService) ([]models.ColumnInfo, error) {
	return []models.ColumnInfo{
		{Name: "id", DataType: "string", IsPrimaryKey: true},
		{Name: "values", DataType: "vector"},
		{Name: "metadata", DataType: "object", IsNullable: true},
		{Name: "sparse_values", DataType: "object", IsNullable: true},
	}, nil
}

func (s *PineconeService) GetTableData(req models.TableDataRequest, connectionService *ConnectionService) (*models.TableDataResponse, error) {
	conn, err := connectionService.GetConnection(req.ConnectionID)
	if err != nil {
		return nil, err
	}
	client := s.getClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	namespace := req.Table
	if namespace == "(default)" {
		namespace = ""
	}

	// Use list endpoint to get vector IDs, then fetch them
	path := "/vectors/list?"
	if namespace != "" {
		path += "namespace=" + namespace + "&"
	}
	limit := req.PageSize
	if limit < 1 {
		limit = 50
	}
	path += fmt.Sprintf("limit=%d", limit)

	listResult, err := client.do(ctx, "GET", path, nil)
	if err != nil {
		// Fallback: try a zero-vector query
		stats, statsErr := s.getIndexStats(conn)
		if statsErr != nil {
			return nil, err
		}
		dim := 128
		if d, ok := stats["dimension"].(float64); ok {
			dim = int(d)
		}
		zeroVec := make([]float64, dim)
		body := map[string]interface{}{
			"vector":          zeroVec,
			"topK":            limit,
			"includeMetadata": true,
			"includeValues":   true,
		}
		if namespace != "" {
			body["namespace"] = namespace
		}
		queryResult, qErr := client.do(ctx, "POST", "/query", body)
		if qErr != nil {
			return nil, qErr
		}

		rows := []models.RowResult{}
		if matches, ok := queryResult["matches"].([]interface{}); ok {
			for _, m := range matches {
				match, _ := m.(map[string]interface{})
				rows = append(rows, models.RowResult{
					"id":       match["id"],
					"values":   match["values"],
					"metadata": match["metadata"],
				})
			}
		}

		columns := []models.ColumnInfo{
			{Name: "id", DataType: "string", IsPrimaryKey: true},
			{Name: "values", DataType: "vector"},
			{Name: "metadata", DataType: "object", IsNullable: true},
		}

		return &models.TableDataResponse{
			Columns:   columns,
			Rows:      rows,
			TotalRows: len(rows),
			Page:      1,
			PageSize:  limit,
		}, nil
	}

	// Get IDs from list result
	var ids []interface{}
	if vectors, ok := listResult["vectors"].([]interface{}); ok {
		for _, v := range vectors {
			vec, _ := v.(map[string]interface{})
			if id, ok := vec["id"]; ok {
				ids = append(ids, id)
			}
		}
	}

	if len(ids) == 0 {
		return &models.TableDataResponse{
			Columns: []models.ColumnInfo{
				{Name: "id", DataType: "string", IsPrimaryKey: true},
				{Name: "values", DataType: "vector"},
				{Name: "metadata", DataType: "object", IsNullable: true},
			},
			Rows:     []models.RowResult{},
			TotalRows: 0,
			Page:      1,
			PageSize:  limit,
		}, nil
	}

	// Fetch full vectors
	fetchPath := "/vectors/fetch?"
	for i, id := range ids {
		if i > 0 {
			fetchPath += "&"
		}
		fetchPath += fmt.Sprintf("ids=%v", id)
	}
	if namespace != "" {
		fetchPath += "&namespace=" + namespace
	}

	fetchResult, err := client.do(ctx, "GET", fetchPath, nil)
	if err != nil {
		return nil, err
	}

	rows := []models.RowResult{}
	if vectors, ok := fetchResult["vectors"].(map[string]interface{}); ok {
		for id, v := range vectors {
			vec, _ := v.(map[string]interface{})
			rows = append(rows, models.RowResult{
				"id":       id,
				"values":   vec["values"],
				"metadata": vec["metadata"],
			})
		}
	}

	columns := []models.ColumnInfo{
		{Name: "id", DataType: "string", IsPrimaryKey: true},
		{Name: "values", DataType: "vector"},
		{Name: "metadata", DataType: "object", IsNullable: true},
	}

	return &models.TableDataResponse{
		Columns:   columns,
		Rows:      rows,
		TotalRows: len(rows),
		Page:      1,
		PageSize:  limit,
	}, nil
}

func (s *PineconeService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients = make(map[string]*pineconeClient)
}
