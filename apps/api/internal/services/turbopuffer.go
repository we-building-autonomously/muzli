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

type TurbopufferService struct {
	mu      sync.Mutex
	clients map[string]*turbopufferClient
}

type turbopufferClient struct {
	apiKey string
	http   *http.Client
}

func NewTurbopufferService() *TurbopufferService {
	return &TurbopufferService{
		clients: make(map[string]*turbopufferClient),
	}
}

func (s *TurbopufferService) getClient(conn *models.Connection) *turbopufferClient {
	key := conn.Password
	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.clients[key]; ok {
		return c
	}
	c := &turbopufferClient{
		apiKey: conn.Password,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
	s.clients[key] = c
	return c
}

func (c *turbopufferClient) do(ctx context.Context, method, path string, body interface{}) (json.RawMessage, error) {
	url := fmt.Sprintf("https://gcp-us-central1.turbopuffer.com/v1%s", path)

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
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
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
		return nil, fmt.Errorf("turbopuffer API error %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

func (s *TurbopufferService) TestConnection(req models.TestConnectionRequest) (*models.TestConnectionResponse, error) {
	conn := &models.Connection{Password: req.Password}
	client := s.getClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := client.do(ctx, "GET", "/vectors/_test_ping", nil)
	// Even a 404 means we connected; only network/auth errors matter
	if err != nil {
		// Try listing namespaces instead
		_, err2 := client.do(ctx, "GET", "/namespaces", nil)
		if err2 != nil {
			return &models.TestConnectionResponse{Success: false, Message: err2.Error()}, nil
		}
	}

	return &models.TestConnectionResponse{
		Success: true,
		Message: "Connection successful",
		Version: "Turbopuffer",
	}, nil
}

func (s *TurbopufferService) ExecuteQuery(conn *models.Connection, query string) (*models.QueryResult, error) {
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
		return nil, fmt.Errorf("query must include 'operation' field (query, upsert, delete)")
	}

	var respBody json.RawMessage
	var err error

	// Handle list_namespaces before namespace resolution
	if operation == "list_namespaces" {
		respBody, err = client.do(ctx, "GET", "/namespaces", nil)
		if err != nil {
			return nil, err
		}

		executionTime := time.Since(startTime).Seconds() * 1000
		var result interface{}
		json.Unmarshal(respBody, &result)

		rows := []models.RowResult{}
		columns := []models.ColumnResult{
			{Name: "id", Type: "string"},
			{Name: "dimensions", Type: "int"},
			{Name: "approx_count", Type: "int"},
			{Name: "distance_metric", Type: "string"},
		}

		if resultMap, ok := result.(map[string]interface{}); ok {
			if namespaces, ok := resultMap["namespaces"].([]interface{}); ok {
				for _, ns := range namespaces {
					if nsMap, ok := ns.(map[string]interface{}); ok {
						rows = append(rows, models.RowResult{
							"id":              nsMap["id"],
							"dimensions":      nsMap["dimensions"],
							"approx_count":    nsMap["approx_count"],
							"distance_metric": nsMap["distance_metric"],
						})
					}
				}
			}
		}

		return &models.QueryResult{
			Columns:       columns,
			Rows:          rows,
			RowCount:      len(rows),
			ExecutionTime: executionTime,
		}, nil
	}

	namespace := conn.DatabaseName
	if ns, ok := parsed["namespace"].(string); ok && ns != "" {
		namespace = ns
	}
	if namespace == "" {
		return nil, fmt.Errorf("namespace is required (set in connection or query)")
	}

	switch operation {
	case "query":
		body := map[string]interface{}{}
		if v, ok := parsed["vector"]; ok {
			body["vector"] = v
		}
		if v, ok := parsed["top_k"]; ok {
			body["top_k"] = v
		} else {
			body["top_k"] = 10
		}
		if v, ok := parsed["filters"]; ok {
			body["filters"] = v
		}
		if v, ok := parsed["distance_metric"]; ok {
			body["distance_metric"] = v
		}
		if v, ok := parsed["include_vectors"]; ok {
			body["include_vectors"] = v
		}
		if v, ok := parsed["include_attributes"]; ok {
			body["include_attributes"] = v
		}
		respBody, err = client.do(ctx, "POST", "/vectors/"+namespace+"/query", body)

	case "upsert":
		body := map[string]interface{}{}
		if v, ok := parsed["ids"]; ok {
			body["ids"] = v
		}
		if v, ok := parsed["vectors"]; ok {
			body["vectors"] = v
		}
		if v, ok := parsed["attributes"]; ok {
			body["attributes"] = v
		}
		respBody, err = client.do(ctx, "POST", "/vectors/"+namespace, body)

	case "delete":
		body := map[string]interface{}{}
		if v, ok := parsed["ids"]; ok {
			body["ids"] = v
		}
		respBody, err = client.do(ctx, "POST", "/vectors/"+namespace+"/delete", body)

	default:
		return nil, fmt.Errorf("unknown operation: %s (supported: query, upsert, delete)", operation)
	}

	if err != nil {
		return nil, err
	}

	executionTime := time.Since(startTime).Seconds() * 1000

	// Parse response
	var result interface{}
	if len(respBody) > 0 {
		json.Unmarshal(respBody, &result)
	}

	rows := []models.RowResult{}
	columns := []models.ColumnResult{{Name: "result", Type: "json"}}

	// Try to parse as array of results (query response)
	if resultMap, ok := result.(map[string]interface{}); ok {
		if ids, ok := resultMap["ids"].([]interface{}); ok {
			columns = []models.ColumnResult{
				{Name: "id", Type: "string"},
				{Name: "dist", Type: "float"},
				{Name: "vector", Type: "vector"},
				{Name: "attributes", Type: "object"},
			}
			dists, _ := resultMap["dist"].([]interface{})
			vectors, _ := resultMap["vectors"].([]interface{})
			attrs, _ := resultMap["attributes"].(map[string]interface{})

			for i, id := range ids {
				row := models.RowResult{"id": id}
				if dists != nil && i < len(dists) {
					row["dist"] = dists[i]
				}
				if vectors != nil && i < len(vectors) {
					row["vector"] = vectors[i]
				}
				if attrs != nil {
					attrRow := map[string]interface{}{}
					for k, v := range attrs {
						if arr, ok := v.([]interface{}); ok && i < len(arr) {
							attrRow[k] = arr[i]
						}
					}
					row["attributes"] = attrRow
				}
				rows = append(rows, row)
			}
		} else {
			rows = append(rows, models.RowResult{"result": result})
		}
	} else if resultArr, ok := result.([]interface{}); ok {
		for _, item := range resultArr {
			rows = append(rows, models.RowResult{"result": item})
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

func (s *TurbopufferService) GetDatabases(conn *models.Connection) ([]models.DatabaseInfo, error) {
	client := s.getClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	respBody, err := client.do(ctx, "GET", "/namespaces", nil)
	if err != nil {
		// Return default
		return []models.DatabaseInfo{{Name: conn.DatabaseName, Owner: "turbopuffer"}}, nil
	}

	dbs := []models.DatabaseInfo{}

	// Response can be a JSON array or {"namespaces": [...]}
	var namespaces []interface{}
	var resultArr []interface{}
	if json.Unmarshal(respBody, &resultArr) == nil {
		namespaces = resultArr
	} else {
		var resultMap map[string]interface{}
		if json.Unmarshal(respBody, &resultMap) == nil {
			namespaces, _ = resultMap["namespaces"].([]interface{})
		}
	}

	for _, ns := range namespaces {
		switch v := ns.(type) {
		case map[string]interface{}:
			name, _ := v["id"].(string)
			if name == "" {
				name, _ = v["name"].(string)
			}
			if name != "" {
				dbs = append(dbs, models.DatabaseInfo{Name: name, Owner: "turbopuffer"})
			}
		case string:
			dbs = append(dbs, models.DatabaseInfo{Name: v, Owner: "turbopuffer"})
		default:
			dbs = append(dbs, models.DatabaseInfo{Name: fmt.Sprintf("%v", ns), Owner: "turbopuffer"})
		}
	}

	if len(dbs) == 0 && conn.DatabaseName != "" {
		dbs = append(dbs, models.DatabaseInfo{Name: conn.DatabaseName, Owner: "turbopuffer"})
	}
	return dbs, nil
}

func (s *TurbopufferService) GetSchemas(_ *models.Connection) ([]models.SchemaInfo, error) {
	return []models.SchemaInfo{{Name: "default"}}, nil
}

func (s *TurbopufferService) GetTables(conn *models.Connection, _ string) ([]models.TableInfo, error) {
	dbs, err := s.GetDatabases(conn)
	if err != nil {
		return nil, err
	}
	tables := []models.TableInfo{}
	for _, db := range dbs {
		tables = append(tables, models.TableInfo{
			Name: db.Name, Schema: "default", Type: "namespace",
		})
	}
	return tables, nil
}

func (s *TurbopufferService) GetColumns(_ *models.Connection, _, _ string) ([]models.ColumnInfo, error) {
	return []models.ColumnInfo{
		{Name: "id", DataType: "string/int", IsPrimaryKey: true},
		{Name: "vector", DataType: "float[]"},
		{Name: "attributes", DataType: "object", IsNullable: true},
	}, nil
}

func (s *TurbopufferService) GetTableData(conn *models.Connection, req models.TableDataRequest) (*models.TableDataResponse, error) {
	client := s.getClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	namespace := req.Table
	if namespace == "" {
		namespace = conn.DatabaseName
	}

	limit := req.PageSize
	if limit < 1 {
		limit = 50
	}

	// Query to list vectors
	body := map[string]interface{}{
		"top_k":              limit,
		"include_vectors":    true,
		"include_attributes": true,
	}

	respBody, err := client.do(ctx, "POST", "/vectors/"+namespace+"/query", body)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	json.Unmarshal(respBody, &result)

	rows := []models.RowResult{}
	columns := []models.ColumnInfo{
		{Name: "id", DataType: "string/int", IsPrimaryKey: true},
		{Name: "vector", DataType: "float[]"},
		{Name: "dist", DataType: "float"},
	}

	if ids, ok := result["ids"].([]interface{}); ok {
		dists, _ := result["dist"].([]interface{})
		vectors, _ := result["vectors"].([]interface{})

		for i, id := range ids {
			row := models.RowResult{"id": id}
			if dists != nil && i < len(dists) {
				row["dist"] = dists[i]
			}
			if vectors != nil && i < len(vectors) {
				row["vector"] = vectors[i]
			}
			rows = append(rows, row)
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

func (s *TurbopufferService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients = make(map[string]*turbopufferClient)
}
