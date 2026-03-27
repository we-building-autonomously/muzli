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

const pineconeControlPlane = "api.pinecone.io"

type PineconeService struct {
	mu      sync.Mutex
	clients map[string]*pineconeClient
}

type pineconeClient struct {
	apiKey string
	host   string // index-specific data plane host
	http   *http.Client
}

func NewPineconeService() *PineconeService {
	return &PineconeService{
		clients: make(map[string]*pineconeClient),
	}
}

func (s *PineconeService) getClient(conn *models.Connection) *pineconeClient {
	key := conn.Password // API key is the unique identifier
	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.clients[key]; ok {
		// Update host if provided (user may connect to a specific index)
		if conn.Host != "" {
			c.host = conn.Host
		}
		return c
	}
	c := &pineconeClient{
		apiKey: conn.Password,
		host:   conn.Host,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
	s.clients[key] = c
	return c
}

func (c *pineconeClient) doURL(ctx context.Context, method, fullURL string, body interface{}) (map[string]interface{}, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, reqBody)
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

// controlPlane calls the Pinecone control plane API
func (c *pineconeClient) controlPlane(ctx context.Context, method, path string, body interface{}) (map[string]interface{}, error) {
	return c.doURL(ctx, method, fmt.Sprintf("https://%s%s", pineconeControlPlane, path), body)
}

// dataPlane calls a specific index's data plane API
func (c *pineconeClient) dataPlane(ctx context.Context, host, method, path string, body interface{}) (map[string]interface{}, error) {
	return c.doURL(ctx, method, fmt.Sprintf("https://%s%s", host, path), body)
}

// resolveHost gets the data plane host for an index from the control plane
func (c *pineconeClient) resolveHost(ctx context.Context, indexName string) (string, error) {
	// If client already has a host set (user provided index host directly), use it
	if c.host != "" && c.host != pineconeControlPlane {
		return c.host, nil
	}

	result, err := c.controlPlane(ctx, "GET", "/indexes/"+indexName, nil)
	if err != nil {
		return "", fmt.Errorf("failed to resolve index host: %w", err)
	}
	host, ok := result["host"].(string)
	if !ok || host == "" {
		return "", fmt.Errorf("host not found for index %s", indexName)
	}
	return host, nil
}

func (s *PineconeService) TestConnection(req models.TestConnectionRequest) (*models.TestConnectionResponse, error) {
	client := &pineconeClient{
		apiKey: req.Password,
		host:   req.Host,
		http:   &http.Client{Timeout: 10 * time.Second},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// If user provided a specific index host, try describe_index_stats on it
	if req.Host != "" && req.Host != pineconeControlPlane {
		result, err := client.dataPlane(ctx, req.Host, "POST", "/describe_index_stats", map[string]interface{}{})
		if err == nil {
			dim := "Pinecone"
			if d, ok := result["dimension"]; ok {
				dim = fmt.Sprintf("Pinecone (dimension: %v)", d)
			}
			return &models.TestConnectionResponse{
				Success: true,
				Message: "Connection successful",
				Version: dim,
			}, nil
		}
		// If that fails, fall through to control plane test
	}

	// Test via control plane: list indexes
	result, err := client.controlPlane(ctx, "GET", "/indexes", nil)
	if err != nil {
		return &models.TestConnectionResponse{
			Success: false,
			Message: fmt.Sprintf("Connection failed: %s", err.Error()),
		}, nil
	}

	indexCount := 0
	if indexes, ok := result["indexes"].([]interface{}); ok {
		indexCount = len(indexes)
	}

	return &models.TestConnectionResponse{
		Success: true,
		Message: "Connection successful",
		Version: fmt.Sprintf("Pinecone (%d indexes)", indexCount),
	}, nil
}

func (s *PineconeService) ExecuteQuery(conn *models.Connection, query string) (*models.QueryResult, error) {
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
		return nil, fmt.Errorf("query must include 'operation' field (query, upsert, fetch, delete, list_indexes)")
	}

	// Resolve the data plane host
	indexName, _ := parsed["index"].(string)
	var host string
	if indexName != "" {
		resolved, err := client.resolveHost(ctx, indexName)
		if err != nil {
			return nil, err
		}
		host = resolved
	} else if client.host != "" && client.host != pineconeControlPlane {
		host = client.host
	}

	var result map[string]interface{}
	var err error

	switch operation {
	case "list_indexes":
		result, err = client.controlPlane(ctx, "GET", "/indexes", nil)

	case "query":
		if host == "" {
			return nil, fmt.Errorf("specify 'index' field or set index host in connection")
		}
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
		result, err = client.dataPlane(ctx, host, "POST", "/query", body)

	case "upsert":
		if host == "" {
			return nil, fmt.Errorf("specify 'index' field or set index host in connection")
		}
		body := map[string]interface{}{}
		if v, ok := parsed["vectors"]; ok {
			body["vectors"] = v
		}
		if v, ok := parsed["namespace"]; ok && v != "" {
			body["namespace"] = v
		}
		result, err = client.dataPlane(ctx, host, "POST", "/vectors/upsert", body)

	case "fetch":
		if host == "" {
			return nil, fmt.Errorf("specify 'index' field or set index host in connection")
		}
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
		result, err = client.dataPlane(ctx, host, "GET", path, nil)

	case "delete":
		if host == "" {
			return nil, fmt.Errorf("specify 'index' field or set index host in connection")
		}
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
		result, err = client.dataPlane(ctx, host, "POST", "/vectors/delete", body)

	default:
		return nil, fmt.Errorf("unknown operation: %s (supported: list_indexes, query, upsert, fetch, delete)", operation)
	}

	if err != nil {
		return nil, err
	}

	executionTime := time.Since(startTime).Seconds() * 1000

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
			rows = append(rows, models.RowResult{
				"id":       match["id"],
				"score":    match["score"],
				"values":   match["values"],
				"metadata": match["metadata"],
			})
		}
	} else if indexes, ok := result["indexes"].([]interface{}); ok {
		columns = []models.ColumnResult{
			{Name: "name", Type: "string"},
			{Name: "dimension", Type: "int"},
			{Name: "metric", Type: "string"},
			{Name: "host", Type: "string"},
			{Name: "status", Type: "object"},
		}
		for _, idx := range indexes {
			index, _ := idx.(map[string]interface{})
			rows = append(rows, models.RowResult{
				"name":      index["name"],
				"dimension": index["dimension"],
				"metric":    index["metric"],
				"host":      index["host"],
				"status":    index["status"],
			})
		}
	} else if vectors, ok := result["vectors"].(map[string]interface{}); ok {
		columns = []models.ColumnResult{
			{Name: "id", Type: "string"},
			{Name: "values", Type: "vector"},
			{Name: "metadata", Type: "object"},
		}
		for id, v := range vectors {
			vec, _ := v.(map[string]interface{})
			rows = append(rows, models.RowResult{
				"id":       id,
				"values":   vec["values"],
				"metadata": vec["metadata"],
			})
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

func (s *PineconeService) GetDatabases(conn *models.Connection) ([]models.DatabaseInfo, error) {
	client := s.getClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.controlPlane(ctx, "GET", "/indexes", nil)
	if err != nil {
		return nil, err
	}

	var databases []models.DatabaseInfo
	if indexes, ok := result["indexes"].([]interface{}); ok {
		for _, idx := range indexes {
			index, _ := idx.(map[string]interface{})
			name, _ := index["name"].(string)
			host, _ := index["host"].(string)
			metric, _ := index["metric"].(string)
			dimension, _ := index["dimension"].(float64)
			databases = append(databases, models.DatabaseInfo{
				Name:      name,
				Owner:     "pinecone",
				Encoding:  metric,
				Collation: host,
				Ctypes:    fmt.Sprintf("%d", int(dimension)),
			})
		}
	}
	return databases, nil
}

func (s *PineconeService) getIndexStats(conn *models.Connection) (map[string]interface{}, error) {
	client := s.getClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	host := client.host
	if host == "" || host == pineconeControlPlane {
		return nil, fmt.Errorf("no index host configured -- select a specific index")
	}

	return client.dataPlane(ctx, host, "POST", "/describe_index_stats", map[string]interface{}{})
}

func (s *PineconeService) GetSchemas(conn *models.Connection) ([]models.SchemaInfo, error) {
	stats, err := s.getIndexStats(conn)
	if err != nil {
		return []models.SchemaInfo{{Name: "", Owner: "default"}}, nil
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

func (s *PineconeService) GetTables(conn *models.Connection, _ string) ([]models.TableInfo, error) {
	stats, err := s.getIndexStats(conn)
	if err != nil {
		return []models.TableInfo{{Name: "(default)", Schema: "vectors", Type: "namespace"}}, nil
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

func (s *PineconeService) GetColumns(_ *models.Connection, _, _ string) ([]models.ColumnInfo, error) {
	return []models.ColumnInfo{
		{Name: "id", DataType: "string", IsPrimaryKey: true},
		{Name: "values", DataType: "vector"},
		{Name: "metadata", DataType: "object", IsNullable: true},
		{Name: "sparse_values", DataType: "object", IsNullable: true},
	}, nil
}

func (s *PineconeService) GetTableData(conn *models.Connection, req models.TableDataRequest) (*models.TableDataResponse, error) {
	client := s.getClient(conn)

	host := client.host
	if host == "" || host == pineconeControlPlane {
		return nil, fmt.Errorf("no index host configured -- set index host in connection")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	namespace := req.Table
	if namespace == "(default)" {
		namespace = ""
	}

	limit := req.PageSize
	if limit < 1 {
		limit = 50
	}

	// Try list+fetch approach first
	path := "/vectors/list?"
	if namespace != "" {
		path += "namespace=" + namespace + "&"
	}
	path += fmt.Sprintf("limit=%d", limit)

	listResult, err := client.dataPlane(ctx, host, "GET", path, nil)
	if err != nil {
		// Fallback: zero-vector query
		stats, statsErr := client.dataPlane(ctx, host, "POST", "/describe_index_stats", map[string]interface{}{})
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
		queryResult, qErr := client.dataPlane(ctx, host, "POST", "/query", body)
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

		return &models.TableDataResponse{
			Columns: []models.ColumnInfo{
				{Name: "id", DataType: "string", IsPrimaryKey: true},
				{Name: "values", DataType: "vector"},
				{Name: "metadata", DataType: "object", IsNullable: true},
			},
			Rows:      rows,
			TotalRows: len(rows),
			Page:      1,
			PageSize:  limit,
		}, nil
	}

	var ids []interface{}
	if vectors, ok := listResult["vectors"].([]interface{}); ok {
		for _, v := range vectors {
			vec, _ := v.(map[string]interface{})
			if id, ok := vec["id"]; ok {
				ids = append(ids, id)
			}
		}
	}

	columns := []models.ColumnInfo{
		{Name: "id", DataType: "string", IsPrimaryKey: true},
		{Name: "values", DataType: "vector"},
		{Name: "metadata", DataType: "object", IsNullable: true},
	}

	if len(ids) == 0 {
		return &models.TableDataResponse{
			Columns:   columns,
			Rows:      []models.RowResult{},
			TotalRows: 0,
			Page:      1,
			PageSize:  limit,
		}, nil
	}

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

	fetchResult, err := client.dataPlane(ctx, host, "GET", fetchPath, nil)
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
