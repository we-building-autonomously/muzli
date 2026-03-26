package services

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/we-building-autonomously/muzli/internal/models"
)

type ConnectionService struct {
	db *sql.DB
}

func NewConnectionService(db *sql.DB) *ConnectionService {
	return &ConnectionService{db: db}
}

func (s *ConnectionService) CreateConnection(req models.CreateConnectionRequest) (*models.Connection, error) {
	connection := &models.Connection{
		ID:           uuid.New().String(),
		Name:         req.Name,
		Host:         req.Host,
		Port:         req.Port,
		DatabaseName: req.DatabaseName,
		Username:     req.Username,
		Password:     req.Password,
		SSL:          req.SSL,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	query := `
		INSERT INTO connections (id, name, host, port, database_name, username, password, ssl, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := s.db.Exec(query, connection.ID, connection.Name, connection.Host, connection.Port,
		connection.DatabaseName, connection.Username, connection.Password, connection.SSL,
		connection.CreatedAt, connection.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create connection: %w", err)
	}

	return connection, nil
}

func (s *ConnectionService) GetConnections() ([]models.Connection, error) {
	query := `
		SELECT id, name, host, port, database_name, username, password, ssl, created_at, updated_at
		FROM connections
		ORDER BY name ASC
	`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query connections: %w", err)
	}
	defer rows.Close()

	var connections []models.Connection
	for rows.Next() {
		var conn models.Connection
		err := rows.Scan(&conn.ID, &conn.Name, &conn.Host, &conn.Port, &conn.DatabaseName,
			&conn.Username, &conn.Password, &conn.SSL, &conn.CreatedAt, &conn.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan connection: %w", err)
		}
		// Don't include password in response
		conn.Password = ""
		connections = append(connections, conn)
	}

	return connections, nil
}

func (s *ConnectionService) GetConnection(id string) (*models.Connection, error) {
	query := `
		SELECT id, name, host, port, database_name, username, password, ssl, created_at, updated_at
		FROM connections
		WHERE id = ?
	`

	var conn models.Connection
	err := s.db.QueryRow(query, id).Scan(&conn.ID, &conn.Name, &conn.Host, &conn.Port,
		&conn.DatabaseName, &conn.Username, &conn.Password, &conn.SSL, &conn.CreatedAt, &conn.UpdatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("connection not found")
		}
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}

	return &conn, nil
}

func (s *ConnectionService) UpdateConnection(id string, req models.UpdateConnectionRequest) (*models.Connection, error) {
	// First check if connection exists
	existing, err := s.GetConnection(id)
	if err != nil {
		return nil, err
	}

	// Update fields
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Host != "" {
		existing.Host = req.Host
	}
	if req.Port != 0 {
		existing.Port = req.Port
	}
	if req.DatabaseName != "" {
		existing.DatabaseName = req.DatabaseName
	}
	if req.Username != "" {
		existing.Username = req.Username
	}
	if req.Password != "" {
		existing.Password = req.Password
	}
	existing.SSL = req.SSL
	existing.UpdatedAt = time.Now()

	query := `
		UPDATE connections 
		SET name = ?, host = ?, port = ?, database_name = ?, username = ?, password = ?, ssl = ?, updated_at = ?
		WHERE id = ?
	`

	_, err = s.db.Exec(query, existing.Name, existing.Host, existing.Port, existing.DatabaseName,
		existing.Username, existing.Password, existing.SSL, existing.UpdatedAt, id)

	if err != nil {
		return nil, fmt.Errorf("failed to update connection: %w", err)
	}

	// Don't include password in response
	existing.Password = ""
	return existing, nil
}

func (s *ConnectionService) DeleteConnection(id string) error {
	query := `DELETE FROM connections WHERE id = ?`
	result, err := s.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete connection: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("connection not found")
	}

	return nil
}