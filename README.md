# 🗄️ Muzli

**Modern Open-Source Database Management Tool**

[![CI/CD Pipeline](https://github.com/we-building-autonomously/muzli/actions/workflows/ci.yml/badge.svg)](https://github.com/we-building-autonomously/muzli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/github/v/release/we-building-autonomously/muzli?include_prereleases)](https://github.com/we-building-autonomously/muzli/releases)

> A powerful, modern alternative to DataGrip with web and desktop support. Built for developers who need a fast, reliable, and beautiful PostgreSQL management experience.

![Muzli Interface](https://via.placeholder.com/800x450/1a1a1a/ffffff?text=Muzli+Interface+Screenshot)

## ✨ Features

### 🚀 V1 Core Features
- **🔌 Connection Management** - Create, edit, and manage PostgreSQL connections with SSL support
- **🌳 Database Explorer** - Navigate databases, schemas, tables, and columns in a beautiful tree view
- **⚡ Query Editor** - Monaco Editor with SQL syntax highlighting and auto-completion
- **📊 Results Grid** - Fast, responsive data grid with sorting and filtering
- **🔍 Table Browser** - Browse table data with pagination and search
- **📋 Schema Viewer** - Inspect table structures, indexes, and constraints
- **⚡ Live Execution** - Real-time query execution with performance metrics

### 🎯 Coming Soon
- **📈 Query History** - Save and revisit your queries
- **🎨 Visual Query Builder** - Build queries visually
- **📝 Export/Import** - CSV, JSON, SQL export capabilities
- **🔄 Data Migration Tools** - Import/export between databases
- **📱 Mobile Support** - Responsive web interface
- **🎭 Multiple DB Support** - MySQL, SQLite, and more

## 🏗️ Architecture

Muzli is built as a modern monorepo with three main components:

```
muzli/
├── apps/
│   ├── web/          # React + TypeScript + Vite
│   ├── desktop/      # Electron wrapper
│   └── api/          # Go backend with PostgreSQL
├── packages/
│   └── shared/       # Shared TypeScript types
└── .github/          # CI/CD workflows
```

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS, shadcn/ui |
| **Desktop** | Electron 28+ |
| **Backend** | Go 1.21+, Gin, pgx PostgreSQL driver |
| **Database** | PostgreSQL (primary), SQLite (connections storage) |
| **Build** | Vite, pnpm workspaces |
| **UI Components** | Radix UI, Monaco Editor, React Table |

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **pnpm** 8+
- **Go** 1.21+
- **PostgreSQL** 12+ (for testing connections)

### 1. Clone and Install

```bash
git clone https://github.com/we-building-autonomously/muzli.git
cd muzli
pnpm install
```

### 2. Start the API Server

```bash
cd apps/api
cp .env.example .env
go mod download
go run .
```

The API will start on `http://localhost:8080`

### 3. Start the Web App

```bash
cd apps/web
cp .env.example .env
pnpm dev
```

The web app will start on `http://localhost:3000`

### 4. Build Desktop App (Optional)

```bash
pnpm --filter=@muzli/desktop build
pnpm --filter=@muzli/desktop start
```

## 📖 Usage

### Creating Your First Connection

1. **Launch Muzli** - Open the web app or desktop application
2. **Add Connection** - Click the "+" button in the sidebar
3. **Configure** - Enter your PostgreSQL connection details:
   - Host: `localhost`
   - Port: `5432`
   - Database: `your_database`
   - Username: `your_username`
   - Password: `your_password`
4. **Test** - Click "Test Connection" to verify
5. **Connect** - Click "Create Connection" to save

### Running Queries

1. **Select Connection** - Click on a connection in the sidebar
2. **Write Query** - Use the Monaco editor with syntax highlighting
3. **Execute** - Press `Ctrl+Enter` (or `Cmd+Enter` on Mac)
4. **View Results** - See results in the bottom panel with execution time

### Exploring Data

1. **Browse Schema** - Expand connections to see databases → schemas → tables
2. **View Table Data** - Click on any table to browse its data
3. **Inspect Structure** - View columns, types, constraints, and indexes
4. **Navigate** - Use pagination for large datasets

## 🗺️ V1 Roadmap

### Phase 1: Core Database Management ✅
- [x] PostgreSQL connection management
- [x] Database/schema/table exploration
- [x] Basic query execution
- [x] Results display
- [x] Table data browsing

### Phase 2: Enhanced Experience (Q2 2024)
- [ ] Query history and favorites
- [ ] Advanced query editor features
- [ ] Export/import capabilities
- [ ] Performance optimization
- [ ] Error handling improvements

### Phase 3: Advanced Features (Q3 2024)
- [ ] Visual query builder
- [ ] Data visualization charts
- [ ] Database comparison tools
- [ ] Advanced security features
- [ ] Plugin system

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. **Fork** the repository
2. **Clone** your fork
3. **Create** a feature branch: `git checkout -b feature/amazing-feature`
4. **Make** your changes
5. **Test** your changes: `pnpm test`
6. **Commit** your changes: `git commit -m 'Add amazing feature'`
7. **Push** to your branch: `git push origin feature/amazing-feature`
8. **Create** a Pull Request

### Code Style

- **Frontend**: ESLint + Prettier
- **Backend**: gofmt + golint
- **Commits**: Conventional Commits

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **DataGrip** - Inspiration for database management UI/UX
- **VS Code** - Monaco Editor integration
- **Radix UI** - Accessible component primitives
- **shadcn/ui** - Beautiful component library
- **PostgreSQL** - The world's most advanced open source database

## 📞 Support

- **🐛 Bug Reports**: [GitHub Issues](https://github.com/we-building-autonomously/muzli/issues)
- **💡 Feature Requests**: [GitHub Discussions](https://github.com/we-building-autonomously/muzli/discussions)
- **📚 Documentation**: [Wiki](https://github.com/we-building-autonomously/muzli/wiki)

---

**Made with ❤️ by the open-source community**

*"Because database management should be beautiful and fast"*