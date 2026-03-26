package db

import (
	"database/sql"
)

func Migrate(db *sql.DB) error {
	createConnectionsTable := `
	CREATE TABLE IF NOT EXISTS connections (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		host TEXT NOT NULL,
		port INTEGER NOT NULL,
		database_name TEXT NOT NULL,
		username TEXT NOT NULL,
		password TEXT,
		ssl BOOLEAN DEFAULT FALSE,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	createIndexes := `
	CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name);
	CREATE INDEX IF NOT EXISTS idx_connections_host ON connections(host);
	`

	if _, err := db.Exec(createConnectionsTable); err != nil {
		return err
	}

	if _, err := db.Exec(createIndexes); err != nil {
		return err
	}

	return nil
}