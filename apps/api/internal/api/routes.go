package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/we-building-autonomously/muzli/internal/models"
	"github.com/we-building-autonomously/muzli/internal/services"
)

type API struct {
	queryService *services.QueryService
}

func SetupRoutes(router *gin.Engine, queryService *services.QueryService) {
	api := &API{
		queryService: queryService,
	}

	// Health check
	router.GET("/health", api.health)

	// API routes
	v1 := router.Group("/api/v1")
	{
		// Connection test
		v1.POST("/connections/test", api.testConnection)

		// Database exploration
		database := v1.Group("/database")
		{
			database.POST("/databases", api.getDatabases)
			database.POST("/schemas", api.getSchemas)
			database.POST("/tables", api.getTables)
			database.POST("/columns", api.getColumns)
		}

		// Query execution
		v1.POST("/query", api.executeQuery)

		// Table data
		v1.POST("/data/table", api.getTableData)
	}
}

func (api *API) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "muzli-api",
	})
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
	var req models.DatabaseExploreRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	databases, err := api.queryService.GetDatabases(req.Connection.ToConnection())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, databases)
}

func (api *API) getSchemas(c *gin.Context) {
	var req models.SchemaExploreRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	schemas, err := api.queryService.GetSchemas(req.Connection.ToConnection())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, schemas)
}

func (api *API) getTables(c *gin.Context) {
	var req models.TableExploreRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tables, err := api.queryService.GetTables(req.Connection.ToConnection(), req.Schema)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, tables)
}

func (api *API) getColumns(c *gin.Context) {
	var req models.ColumnExploreRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	columns, err := api.queryService.GetColumns(req.Connection.ToConnection(), req.Schema, req.Table)
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

	result, err := api.queryService.ExecuteQuery(req.Connection.ToConnection(), req.Query)
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

	result, err := api.queryService.GetTableData(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}
