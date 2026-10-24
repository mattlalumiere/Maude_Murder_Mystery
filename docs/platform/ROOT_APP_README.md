<!-- Preserved 2026-10-23: this was the uncommitted root README. It describes the generic Express/Postgres/Redis app in src/ and test/ at the repo root, not the game in web/. Moved here so nothing is lost. -->

# Maude Murder Mystery

A murder mystery game for mixed-age groups (10-20 adults and 5-10 kids).

## Features

- Multiplayer game support
- Game state management
- Player management
- Secret character cards
- Clue system
- Game state persistence

## Architecture

This application uses a microservices architecture with:

1. **Core Service**: Main application logic
2. **Database**: PostgreSQL for persistent storage
3. **Cache**: Redis for session management and caching
4. **Storage**: Local file storage for game data

## Development Setup

### Prerequisites

- Docker
- Docker Compose

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/maude-murder-mystery/maude-murder-mystery.git
cd maude-murder-mystery
```

2. Build and run the application:
```bash
docker-compose up --build
```

3. The application will be available at http://localhost:3000

### Development Environment

For development, you can run:

```bash
docker-compose up
```

### Testing

To run tests:

```bash
npm test
```

## Project Structure

```
.
├── src/
│   ├── index.js
│   ├── config/
│   ├── routes/
│   ├── models/
│   ├── services/
│   └── middleware/
├── test/
├── docker-compose.yml
└── Dockerfile
```

## Deployment

### Local Development

For development, use Docker Compose to run the application:

```bash
docker-compose up --build
```

### Production Deployment

For production deployment, you can deploy to:

1. **AWS ECS/EKS**: Using ECS or EKS with containerized services
2. **Azure AKS**: Using AKS with containerized services
3. **GCP GKS**: Using GKS with containerized services

## Development Guidelines

### Testing

All code should be tested with:
- Unit tests
- Integration tests
- Integration tests

### Code Style

- Follow JavaScript/Node.js best practices
- Use ESLint for code linting
- Use Prettier for formatting

### Security

- Use environment variables for configuration
- Implement proper authentication and authorization
- Use secure session management

### Scalability

- Design for horizontal scaling
- Use stateless design patterns
- Implement proper caching strategies

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.