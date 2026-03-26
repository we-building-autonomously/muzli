# Contributing to Muzli

Thank you for your interest in contributing to Muzli! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ and **pnpm** 8+
- **Go** 1.21+
- **Git**
- **PostgreSQL** 12+ (for testing)

### Development Setup

1. **Fork the repository**
   ```bash
   git clone https://github.com/your-username/muzli.git
   cd muzli
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment files**
   ```bash
   cd apps/api && cp .env.example .env
   cd ../web && cp .env.example .env
   ```

4. **Start development servers**
   ```bash
   # Terminal 1: API Server
   cd apps/api && go run .
   
   # Terminal 2: Web App
   cd apps/web && pnpm dev
   ```

## 📋 Development Guidelines

### Code Style

#### Frontend (TypeScript/React)
- Use **ESLint** and **Prettier** for formatting
- Follow **React hooks** best practices
- Use **TypeScript strict mode**
- Prefer **functional components**
- Use **shadcn/ui** components when possible

#### Backend (Go)
- Use **gofmt** for formatting
- Follow **Go best practices**
- Use **context** for request handling
- Add proper **error handling**
- Write **tests** for new features

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(api): add table pagination support
fix(web): resolve connection dialog validation
docs: update installation instructions
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Maintenance

### Branch Naming

Use descriptive branch names:
- `feature/connection-pooling`
- `fix/query-execution-timeout`
- `docs/api-documentation`

## 🐛 Reporting Issues

### Bug Reports

When reporting bugs, please include:

1. **Environment information**
   - OS and version
   - Node.js and Go versions
   - Database version
   - Browser (if web-related)

2. **Steps to reproduce**
   - Clear, step-by-step instructions
   - Expected vs actual behavior
   - Screenshots if applicable

3. **Error logs**
   - Console errors
   - Server logs
   - Stack traces

### Feature Requests

When requesting features:

1. **Describe the problem** you're trying to solve
2. **Explain your proposed solution**
3. **Consider alternatives** you've thought of
4. **Provide use cases** and examples

## 🔧 Development Workflow

### 1. Create an Issue

Before starting work, create an issue to discuss:
- Bug reports
- Feature proposals
- API changes
- Breaking changes

### 2. Development Process

1. **Create a branch** from `main`
2. **Make your changes**
3. **Write tests** if applicable
4. **Update documentation**
5. **Test locally**
6. **Create a pull request**

### 3. Pull Request Process

#### Before Submitting
- [ ] Code compiles without errors
- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] Self-review completed

#### PR Template
Your PR should include:
- **Clear description** of changes
- **Related issue links**
- **Type of change** (feature/fix/docs/etc.)
- **Testing information**
- **Screenshots** if UI changes

### 4. Code Review

All PRs require review from maintainers:
- Reviews focus on correctness, performance, and maintainability
- Address feedback promptly
- Keep PRs focused and reasonably sized
- Be patient and professional

## 🧪 Testing

### Running Tests

```bash
# Frontend tests
cd apps/web && pnpm test

# Backend tests
cd apps/api && go test ./...

# Integration tests
pnpm test:integration
```

### Writing Tests

#### Frontend
- Use **React Testing Library**
- Test component behavior, not implementation
- Mock external dependencies
- Test user interactions

#### Backend
- Use Go's built-in testing
- Test all public functions
- Use table-driven tests when appropriate
- Mock database interactions

### Test Coverage

Aim for:
- **80%+ coverage** for new code
- **100% coverage** for critical paths
- **Integration tests** for API endpoints
- **E2E tests** for core user flows

## 📁 Project Structure

```
muzli/
├── apps/
│   ├── web/              # React frontend
│   │   ├── src/
│   │   │   ├── components/   # UI components
│   │   │   ├── hooks/        # Custom hooks
│   │   │   ├── api/          # API client
│   │   │   └── types/        # TypeScript types
│   │   └── package.json
│   │
│   ├── desktop/          # Electron app
│   │   ├── src/main/         # Electron main process
│   │   └── package.json
│   │
│   └── api/              # Go backend
│       ├── internal/         # Internal packages
│       │   ├── api/          # HTTP handlers
│       │   ├── services/     # Business logic
│       │   └── models/       # Data models
│       └── main.go
│
├── packages/
│   └── shared/           # Shared TypeScript types
│
└── .github/              # GitHub workflows and templates
```

## 🎯 Areas for Contribution

### High Priority
- **Performance improvements**
- **Bug fixes**
- **Test coverage**
- **Documentation**

### Medium Priority
- **New database features**
- **UI/UX enhancements**
- **Developer tooling**

### Future Features
- **Multi-database support**
- **Visual query builder**
- **Mobile responsive design**
- **Plugin system**

## 📚 Resources

### Documentation
- [API Documentation](docs/api.md)
- [Architecture Guide](docs/architecture.md)
- [Deployment Guide](docs/deployment.md)

### External Resources
- [React Documentation](https://react.dev/)
- [Go Documentation](https://golang.org/doc/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Electron Documentation](https://www.electronjs.org/docs)

## 🤝 Community

### Communication
- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - General questions and ideas
- **Pull Requests** - Code contributions

### Code of Conduct

We enforce a [Code of Conduct](CODE_OF_CONDUCT.md) to ensure a welcoming environment for all contributors.

## 🏆 Recognition

Contributors are recognized in:
- **README.md** contributors section
- **Release notes** for significant contributions
- **GitHub contributors** graph

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## ❓ Questions?

If you have questions about contributing:
1. Check existing [issues](https://github.com/we-building-autonomously/muzli/issues)
2. Create a new [discussion](https://github.com/we-building-autonomously/muzli/discussions)
3. Review this contributing guide

Thank you for contributing to Muzli! 🚀