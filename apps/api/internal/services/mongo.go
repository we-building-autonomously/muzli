package services

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/we-building-autonomously/muzli/internal/models"
)

type MongoService struct {
	mu      sync.Mutex
	clients map[string]*mongo.Client
}

func NewMongoService() *MongoService {
	return &MongoService{
		clients: make(map[string]*mongo.Client),
	}
}

func (s *MongoService) getClient(conn *models.Connection) (*mongo.Client, error) {
	var uri string
	if strings.HasPrefix(conn.Host, "mongodb://") || strings.HasPrefix(conn.Host, "mongodb+srv://") {
		uri = conn.Host
	} else if conn.Host != "" {
		scheme := "mongodb"
		tlsParam := "false"
		if conn.SSL {
			tlsParam = "true"
		}
		uri = fmt.Sprintf("%s://%s:%s@%s:%d/%s?tls=%s",
			scheme, conn.Username, conn.Password, conn.Host, conn.Port, conn.DatabaseName, tlsParam)
	} else {
		return nil, fmt.Errorf("MongoDB connection string or host is required")
	}


	key := uri
	s.mu.Lock()
	defer s.mu.Unlock()

	if client, exists := s.clients[key]; exists {
		return client, nil
	}

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	s.clients[key] = client
	return client, nil
}

func (s *MongoService) TestConnection(req models.TestConnectionRequest) (*models.TestConnectionResponse, error) {
	conn := &models.Connection{
		Host:         req.Host,
		Port:         req.Port,
		DatabaseName: req.DatabaseName,
		Username:     req.Username,
		Password:     req.Password,
		SSL:          req.SSL,
	}

	client, err := s.getClient(conn)
	if err != nil {
		return &models.TestConnectionResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.ListDatabases(ctx, bson.D{})
	if err != nil {
		return &models.TestConnectionResponse{
			Success: false,
			Message: fmt.Sprintf("Connection failed: %s", err.Error()),
		}, nil
	}

	version := fmt.Sprintf("MongoDB (%d databases)", len(result.Databases))

	return &models.TestConnectionResponse{
		Success: true,
		Message: "Connection successful",
		Version: version,
	}, nil
}

type mongoQuery struct {
	Collection string        `json:"collection"`
	Operation  string        `json:"operation"`
	Filter     bson.M        `json:"filter"`
	Sort       bson.M        `json:"sort"`
	Limit      int64         `json:"limit"`
	Pipeline   []bson.M      `json:"pipeline"`
	Document   bson.M        `json:"document"`
	Documents  []interface{} `json:"documents"`
	Update     bson.M        `json:"update"`
}

func (s *MongoService) ExecuteQuery(conn *models.Connection, query string) (*models.QueryResult, error) {
	client, err := s.getClient(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	var mq mongoQuery
	if err := json.Unmarshal([]byte(query), &mq); err != nil {
		return nil, fmt.Errorf("invalid query format, expected JSON: %w", err)
	}

	if mq.Collection == "" {
		return nil, fmt.Errorf("collection is required")
	}
	if mq.Operation == "" {
		return nil, fmt.Errorf("operation is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	startTime := time.Now()
	db := client.Database(conn.DatabaseName)
	coll := db.Collection(mq.Collection)

	switch mq.Operation {
	case "find":
		return s.executeFind(ctx, coll, mq, startTime)
	case "aggregate":
		return s.executeAggregate(ctx, coll, mq, startTime)
	case "insertOne":
		return s.executeInsertOne(ctx, coll, mq, startTime)
	case "insertMany":
		return s.executeInsertMany(ctx, coll, mq, startTime)
	case "updateMany":
		return s.executeUpdateMany(ctx, coll, mq, startTime)
	case "deleteMany":
		return s.executeDeleteMany(ctx, coll, mq, startTime)
	case "count":
		return s.executeCount(ctx, coll, mq, startTime)
	default:
		return nil, fmt.Errorf("unsupported operation: %s", mq.Operation)
	}
}

func (s *MongoService) executeFind(ctx context.Context, coll *mongo.Collection, mq mongoQuery, startTime time.Time) (*models.QueryResult, error) {
	filter := mq.Filter
	if filter == nil {
		filter = bson.M{}
	}

	limit := mq.Limit
	if limit <= 0 {
		limit = 50
	}

	opts := options.Find().SetLimit(limit)
	if len(mq.Sort) > 0 {
		opts.SetSort(mq.Sort)
	}

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("find failed: %w", err)
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		return nil, fmt.Errorf("failed to decode results: %w", err)
	}

	return bsonResultsToQueryResult(results, startTime), nil
}

func (s *MongoService) executeAggregate(ctx context.Context, coll *mongo.Collection, mq mongoQuery, startTime time.Time) (*models.QueryResult, error) {
	pipeline := make([]bson.D, len(mq.Pipeline))
	for i, stage := range mq.Pipeline {
		d := bson.D{}
		for k, v := range stage {
			d = append(d, bson.E{Key: k, Value: v})
		}
		pipeline[i] = d
	}

	cursor, err := coll.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("aggregate failed: %w", err)
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		return nil, fmt.Errorf("failed to decode results: %w", err)
	}

	return bsonResultsToQueryResult(results, startTime), nil
}

func (s *MongoService) executeInsertOne(ctx context.Context, coll *mongo.Collection, mq mongoQuery, startTime time.Time) (*models.QueryResult, error) {
	result, err := coll.InsertOne(ctx, mq.Document)
	if err != nil {
		return nil, fmt.Errorf("insertOne failed: %w", err)
	}

	executionTime := time.Since(startTime).Seconds() * 1000
	affected := 1
	return &models.QueryResult{
		Columns:       []models.ColumnResult{{Name: "insertedId", Type: "objectId"}},
		Rows:          []models.RowResult{{"insertedId": result.InsertedID}},
		RowCount:      1,
		ExecutionTime: executionTime,
		AffectedRows:  &affected,
	}, nil
}

func (s *MongoService) executeInsertMany(ctx context.Context, coll *mongo.Collection, mq mongoQuery, startTime time.Time) (*models.QueryResult, error) {
	result, err := coll.InsertMany(ctx, mq.Documents)
	if err != nil {
		return nil, fmt.Errorf("insertMany failed: %w", err)
	}

	executionTime := time.Since(startTime).Seconds() * 1000
	affected := len(result.InsertedIDs)
	rows := make([]models.RowResult, len(result.InsertedIDs))
	for i, id := range result.InsertedIDs {
		rows[i] = models.RowResult{"insertedId": id}
	}

	return &models.QueryResult{
		Columns:       []models.ColumnResult{{Name: "insertedId", Type: "objectId"}},
		Rows:          rows,
		RowCount:      affected,
		ExecutionTime: executionTime,
		AffectedRows:  &affected,
	}, nil
}

func (s *MongoService) executeUpdateMany(ctx context.Context, coll *mongo.Collection, mq mongoQuery, startTime time.Time) (*models.QueryResult, error) {
	filter := mq.Filter
	if filter == nil {
		filter = bson.M{}
	}

	result, err := coll.UpdateMany(ctx, filter, mq.Update)
	if err != nil {
		return nil, fmt.Errorf("updateMany failed: %w", err)
	}

	executionTime := time.Since(startTime).Seconds() * 1000
	affected := int(result.ModifiedCount)

	return &models.QueryResult{
		Columns:       []models.ColumnResult{},
		Rows:          []models.RowResult{{"matchedCount": result.MatchedCount, "modifiedCount": result.ModifiedCount}},
		RowCount:      1,
		ExecutionTime: executionTime,
		AffectedRows:  &affected,
	}, nil
}

func (s *MongoService) executeDeleteMany(ctx context.Context, coll *mongo.Collection, mq mongoQuery, startTime time.Time) (*models.QueryResult, error) {
	filter := mq.Filter
	if filter == nil {
		filter = bson.M{}
	}

	result, err := coll.DeleteMany(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("deleteMany failed: %w", err)
	}

	executionTime := time.Since(startTime).Seconds() * 1000
	affected := int(result.DeletedCount)

	return &models.QueryResult{
		Columns:       []models.ColumnResult{},
		Rows:          []models.RowResult{{"deletedCount": result.DeletedCount}},
		RowCount:      1,
		ExecutionTime: executionTime,
		AffectedRows:  &affected,
	}, nil
}

func (s *MongoService) executeCount(ctx context.Context, coll *mongo.Collection, mq mongoQuery, startTime time.Time) (*models.QueryResult, error) {
	filter := mq.Filter
	if filter == nil {
		filter = bson.M{}
	}

	count, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("count failed: %w", err)
	}

	executionTime := time.Since(startTime).Seconds() * 1000

	return &models.QueryResult{
		Columns:       []models.ColumnResult{{Name: "count", Type: "int64"}},
		Rows:          []models.RowResult{{"count": count}},
		RowCount:      1,
		ExecutionTime: executionTime,
	}, nil
}

func (s *MongoService) GetDatabases(conn *models.Connection) ([]models.DatabaseInfo, error) {
	client, err := s.getClient(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.ListDatabases(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list databases: %w", err)
	}

	databases := make([]models.DatabaseInfo, len(result.Databases))
	for i, db := range result.Databases {
		databases[i] = models.DatabaseInfo{
			Name: db.Name,
		}
	}

	return databases, nil
}

func (s *MongoService) GetSchemas(conn *models.Connection) ([]models.SchemaInfo, error) {
	// Return databases as "schemas" so the sidebar tree shows Databases → Collections
	client, err := s.getClient(conn)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.ListDatabases(ctx, bson.D{})
	if err != nil {
		return nil, err
	}

	schemas := make([]models.SchemaInfo, len(result.Databases))
	for i, db := range result.Databases {
		schemas[i] = models.SchemaInfo{Name: db.Name}
	}
	return schemas, nil
}

func (s *MongoService) GetCollections(conn *models.Connection) ([]models.TableInfo, error) {
	client, err := s.getClient(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db := client.Database(conn.DatabaseName)
	names, err := db.ListCollectionNames(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list collections: %w", err)
	}

	tables := make([]models.TableInfo, len(names))
	for i, name := range names {
		tables[i] = models.TableInfo{
			Name:   name,
			Schema: conn.DatabaseName,
			Type:   "collection",
		}
	}

	return tables, nil
}

func (s *MongoService) GetColumns(conn *models.Connection, collection string) ([]models.ColumnInfo, error) {
	client, err := s.getClient(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db := client.Database(conn.DatabaseName)
	coll := db.Collection(collection)

	cursor, err := coll.Find(ctx, bson.D{}, options.Find().SetLimit(100))
	if err != nil {
		return nil, fmt.Errorf("failed to sample documents: %w", err)
	}
	defer cursor.Close(ctx)

	var docs []bson.M
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, fmt.Errorf("failed to decode sample documents: %w", err)
	}

	fieldTypes := make(map[string]string)
	for _, doc := range docs {
		for key, value := range doc {
			if _, exists := fieldTypes[key]; !exists {
				fieldTypes[key] = inferBsonType(value)
			}
		}
	}

	columns := make([]models.ColumnInfo, 0, len(fieldTypes))
	for name, dataType := range fieldTypes {
		col := models.ColumnInfo{
			Name:       name,
			DataType:   dataType,
			IsNullable: true,
		}
		if name == "_id" {
			col.IsPrimaryKey = true
			col.IsNullable = false
		}
		columns = append(columns, col)
	}

	return columns, nil
}

func (s *MongoService) GetTableData(conn *models.Connection, req models.TableDataRequest) (*models.TableDataResponse, error) {
	client, err := s.getClient(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db := client.Database(conn.DatabaseName)
	coll := db.Collection(req.Table)

	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 {
		req.PageSize = 50
	}
	if req.PageSize > 1000 {
		req.PageSize = 1000
	}

	totalRows, err := coll.CountDocuments(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to count documents: %w", err)
	}

	skip := int64((req.Page - 1) * req.PageSize)
	limit := int64(req.PageSize)

	opts := options.Find().SetSkip(skip).SetLimit(limit)
	if req.OrderBy != "" {
		direction := 1
		if req.OrderDir == "DESC" {
			direction = -1
		}
		opts.SetSort(bson.D{{Key: req.OrderBy, Value: direction}})
	}

	cursor, err := coll.Find(ctx, bson.D{}, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to query collection: %w", err)
	}
	defer cursor.Close(ctx)

	var docs []bson.M
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, fmt.Errorf("failed to decode documents: %w", err)
	}

	columns, _ := s.GetColumns(conn, req.Table)

	rows := make([]models.RowResult, len(docs))
	for i, doc := range docs {
		row := make(models.RowResult)
		for k, v := range doc {
			row[k] = v
		}
		rows[i] = row
	}

	return &models.TableDataResponse{
		Columns:   columns,
		Rows:      rows,
		TotalRows: int(totalRows),
		Page:      req.Page,
		PageSize:  req.PageSize,
	}, nil
}

func (s *MongoService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for _, client := range s.clients {
		_ = client.Disconnect(ctx)
	}
	s.clients = make(map[string]*mongo.Client)
}

func bsonResultsToQueryResult(results []bson.M, startTime time.Time) *models.QueryResult {
	executionTime := time.Since(startTime).Seconds() * 1000

	if len(results) == 0 {
		return &models.QueryResult{
			Columns:       []models.ColumnResult{},
			Rows:          []models.RowResult{},
			RowCount:      0,
			ExecutionTime: executionTime,
		}
	}

	columnSet := make(map[string]bool)
	var columns []models.ColumnResult
	for _, doc := range results {
		for key := range doc {
			if !columnSet[key] {
				columnSet[key] = true
				columns = append(columns, models.ColumnResult{
					Name: key,
					Type: inferBsonType(doc[key]),
				})
			}
		}
	}

	rows := make([]models.RowResult, len(results))
	for i, doc := range results {
		row := make(models.RowResult)
		for k, v := range doc {
			row[k] = v
		}
		rows[i] = row
	}

	return &models.QueryResult{
		Columns:       columns,
		Rows:          rows,
		RowCount:      len(rows),
		ExecutionTime: executionTime,
	}
}

func inferBsonType(value interface{}) string {
	if value == nil {
		return "null"
	}
	t := reflect.TypeOf(value)
	switch t.Kind() {
	case reflect.String:
		return "string"
	case reflect.Int, reflect.Int32, reflect.Int64:
		return "int"
	case reflect.Float32, reflect.Float64:
		return "double"
	case reflect.Bool:
		return "bool"
	case reflect.Slice, reflect.Array:
		return "array"
	case reflect.Map:
		return "object"
	default:
		return t.String()
	}
}
