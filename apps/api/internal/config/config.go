package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	Port         string
	DatabasePath string
	Environment  string
}

func Load() *Config {
	// Get user home directory for database storage
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}

	dbPath := filepath.Join(homeDir, ".muzli", "connections.db")

	// Create directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		dbPath = "./connections.db" // fallback to current directory
	}

	return &Config{
		Port:         getEnv("PORT", "8080"),
		DatabasePath: getEnv("DATABASE_PATH", dbPath),
		Environment:  getEnv("ENVIRONMENT", "development"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}