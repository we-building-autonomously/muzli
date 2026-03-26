package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/we-building-autonomously/muzli/internal/models"
	"github.com/we-building-autonomously/muzli/internal/services"
)

type API struct {
	connectionService *services.ConnectionService
	queryService      *services.QueryService
}

func SetupRoutes(router *gin.Engine, connectionService *services.ConnectionService, queryService *services.QueryService) {
	api := &API{
		connectionService: connectionService,
		queryService:      queryService,
	}

	// Health check
	router.GET("/health", api.health)

	// API routes
	v1 := router.Group("/api/v1")
	{
		// Connection management
		connections := v1.Group("/connections")
		{
			connections.GET("", api.getConnections)
			connections.POST("", api.createConnection)
			connections.GET("/:id", api.getConnection)
			connections.PUT("/:id", api.updateConnection)
			connections.DELETE("/:id", api.deleteConnection)
			connections.POST("/test", api.testConnection)
		}

		// Database exploration
		database := v1.Group("/database")
		{
			database.GET("/:connectionId/databases", api.getDatabases)
			database.GET("/:connectionId/schemas", api.getSchemas)
			database.GET("/:connectionId/schemas/:schema/tables", api.getTables)
			database.GET("/:connectionId/schemas/:schema/tables/:table/columns", api.getColumns)
		}

		// Query execution
		query := v1.Group("/query")
		{
			query.POST("", api.executeQuery)
		}

		// Table data
		data := v1.Group("/data")
		{
			data.POST("/table", api.getTableData)
		}
	}
}

func (api *API) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"service": "muzli-api",
	})
}

func (api *API) getConnections(c *gin.Context) {
	connections, err := api.connectionService.GetConnections()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, connections)
}

func (api *API) createConnection(c *gin.Context) {
	var req models.CreateConnectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	connection, err := api.connectionService.CreateConnection(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, connection)
}

func (api *API) getConnection(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connection id is required"})
		return
	}

	connection, err := api.connectionService.GetConnection(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, connection)
}

func (api *API) updateConnection(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connection id is required"})
		return
	}

	var req models.UpdateConnectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	connection, err := api.connectionService.UpdateConnection(id, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, connection)
}

func (api *API) deleteConnection(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connection id is required"})
		return
	}

	err := api.connectionService.DeleteConnection(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Connection deleted successfully"})
}

func (api *API) testConnection(c *gin.Context) {
	var req models.TestConnectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := api.queryService.TestConnection(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (api *API) getDatabases(c *gin.Context) {
	connectionId := c.Param("connectionId")
	if connectionId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connection id is required"})
		return
	}

	databases, err := api.queryService.GetDatabases(connectionId, api.connectionService)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, databases)
}

func (api *API) getSchemas(c *gin.Context) {
	connectionId := c.Param("connectionId")
	if connectionId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connection id is required"})
		return
	}

	schemas, err := api.queryService.GetSchemas(connectionId, api.connectionService)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, schemas)
}

func (api *API) getTables(c *gin.Context) {
	connectionId := c.Param("connectionId")
	schema := c.Param("schema")
	if connectionId == "" || schema == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connection id and schema are required"})
		return
	}

	tables, err := api.queryService.GetTables(connectionId, schema, api.connectionService)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, tables)
}

func (api *API) getColumns(c *gin.Context) {
	connectionId := c.Param("connectionId")
	schema := c.Param("schema")
	table := c.Param("table")
	if connectionId == "" || schema == "" || table == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "connection id, schema, and table are required"})
		return
	}

	columns, err := api.queryService.GetColumns(connectionId, schema, table, api.connectionService)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, columns)
}

func (api *API) executeQuery(c *gin.Context) {
	var req models.QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := api.queryService.ExecuteQuery(req.ConnectionID, req.Query, api.connectionService)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (api *API) getTableData(c *gin.Context) {
	var req models.TableDataRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse query parameters
	if page := c.Query("page"); page != "" {
		if p, err := strconv.Atoi(page); err == nil {
			req.Page = p
		}
	}
	if pageSize := c.Query("pageSize"); pageSize != "" {
		if ps, err := strconv.Atoi(pageSize); err == nil {
			req.PageSize = ps
		}
	}
	if orderBy := c.Query("orderBy"); orderBy != "" {
		req.OrderBy = orderBy
	}
	if orderDir := c.Query("orderDir"); orderDir != "" {
		req.OrderDir = orderDir
	}

	result, err := api.queryService.GetTableData(req, api.connectionService)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}