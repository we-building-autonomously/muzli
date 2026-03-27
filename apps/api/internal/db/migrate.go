package db

import (
	"database/sql"
	"strings"
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

	addTypeColumn := `ALTER TABLE connections ADD COLUMN type TEXT NOT NULL DEFAULT 'postgres'`
	if _, err := db.Exec(addTypeColumn); err != nil {
		if !isColumnAlreadyExists(err) {
			return err
		}
	}

	return nil
}

func isColumnAlreadyExists(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "duplicate column") || strings.Contains(msg, "already exists")
}