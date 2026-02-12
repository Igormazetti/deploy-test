# Deploy Test - Jenkins CI/CD with GitHub

Automatic CI/CD pipeline: push code to GitHub, Jenkins builds, tests, and deploys your Fastify API + PostgreSQL in Docker containers with automatic database migrations.

## How It Works

```
You push code to GitHub
        |
GitHub sends a webhook to Jenkins
        |
Jenkins pulls the code and runs the pipeline:
        |
   1. Checkout  - pulls code from GitHub
   2. Install   - runs npm install
   3. Build     - prisma generate + tsc (compiles TypeScript)
   4. Test      - runs the test suite
   5. Deploy    - builds Docker image, starts Postgres + app containers
        |        - entrypoint waits for Postgres, runs migrations, starts server
        |
API is live at http://localhost:3000
Email notification sent (success or failure)
```

## Tech Stack

- **Runtime**: Node.js 22 + TypeScript
- **API Framework**: Fastify
- **Database**: PostgreSQL 16 (Docker)
- **ORM**: Prisma 7 (with `@prisma/adapter-pg`)
- **CI/CD**: Jenkins (Declarative Pipeline)
- **Containerization**: Docker + Docker Compose

## Project Structure

```
deploy/
  Jenkinsfile            <- Pipeline definition (what Jenkins executes)
  Dockerfile             <- Docker image for the API app
  Dockerfile.jenkins     <- Custom Jenkins image (with Node.js support + Docker CLI)
  docker-compose.yml     <- Runs Jenkins (port 8080)
  docker-compose.app.yml <- Runs Postgres + API app (port 3000)
  entrypoint.sh          <- Waits for Postgres, runs migrations, starts server
  package.json           <- Node.js project config
  tsconfig.json          <- TypeScript compiler config
  prisma.config.ts       <- Prisma config (datasource URL)
  prisma/
    schema.prisma        <- Database schema (User model)
    migrations/          <- SQL migration files
  src/
    index.ts             <- Fastify API with GET /users route
    test.ts              <- Test suite
```

## Database

### Schema

The Prisma schema defines a `User` model:

```prisma
model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  createdAt DateTime @default(now())
}
```

### Migrations

Migrations run automatically on every deploy via `entrypoint.sh`:

1. Container starts
2. `pg_isready` waits until Postgres is accepting connections
3. `npx prisma migrate deploy` applies any pending migrations
4. `node dist/index.js` starts the API

### API Routes

| Method | Route    | Description        |
|--------|----------|--------------------|
| GET    | `/users` | List all users     |

## Prerequisites

- Docker Desktop installed and running
- Git
- A GitHub account
- ngrok account (free) for webhooks

## Quick Start

### 1. Start Jenkins

```bash
docker-compose up -d --build
```

Jenkins will be available at http://localhost:8080.

On first run:
- Get the admin password: `docker logs jenkins`
- Open http://localhost:8080 and paste the password
- Click "Install suggested plugins"
- Create an admin user

### 2. Configure Jenkins

#### Install NodeJS Plugin
- Manage Jenkins > Plugins > Available plugins > search "NodeJS" > Install

#### Configure Node.js Tool
- Manage Jenkins > Tools > NodeJS > Add NodeJS
- **Name**: `NodeJS` (must match the Jenkinsfile exactly)
- Check "Install automatically"
- Pick the latest version
- Save

#### Add Mailtrap Credentials
- Manage Jenkins > Credentials > (global) > Add Credentials
- Kind: "Secret text"
- Secret: your Mailtrap SMTP password
- ID: `mailtrap-password`
- Create

#### Create the Pipeline Job
- New Item > name: `deploy-test` > Pipeline > OK
- General: check "GitHub project", URL: `https://github.com/YOUR_USER/deploy-test/`
- Build Triggers: check "GitHub hook trigger for GITScm polling"
- Pipeline:
  - Definition: "Pipeline script from SCM"
  - SCM: Git
  - Repository URL: `https://github.com/YOUR_USER/deploy-test.git`
  - Branch: `*/main`
  - Script Path: `Jenkinsfile`
- Save

### 3. Set Up Webhooks (for automatic triggers)

Since Jenkins runs locally, GitHub can't reach it directly. Use ngrok to create a tunnel:

```bash
ngrok http 8080
```

Copy the public URL (e.g., `https://abc123.ngrok-free.app`), then:

- Update Jenkins URL: Manage Jenkins > System > Jenkins URL > paste ngrok URL
- Add webhook on GitHub: repo Settings > Webhooks > Add webhook
  - Payload URL: `https://YOUR-NGROK-URL/github-webhook/`
  - Content type: `application/json`
  - Events: "Just the push event"

### 4. Test It

Push any change to the `main` branch. Jenkins will automatically:
1. Pull the code
2. Install dependencies
3. Generate Prisma client and compile TypeScript
4. Run tests
5. Deploy Postgres + app in Docker containers
6. Wait for Postgres, run database migrations
7. Start the Fastify server
8. Send an email notification

The API will be live at http://localhost:3000/users.

---

## File Reference

### Jenkinsfile

The Jenkinsfile defines the CI/CD pipeline using Jenkins' Declarative Pipeline syntax.

```groovy
pipeline {
    agent any            // Run on any available Jenkins executor

    environment {        // Variables available to all stages
        NOTIFY_EMAIL = 'your@email.com'
        MAILTRAP_PASSWORD = credentials('mailtrap-password')  // Pulls from Jenkins credentials
    }

    tools {
        nodejs 'NodeJS'  // Name must match Jenkins > Tools > NodeJS config
    }

    stages {
        stage('Checkout') { ... }  // Pull code from GitHub
        stage('Install')  { ... }  // npm install
        stage('Build')    { ... }  // prisma generate && tsc
        stage('Test')     { ... }  // npm test
        stage('Deploy')   { ... }  // docker compose up --build -d + check logs
    }

    post {
        success { ... }  // Runs only if all stages pass
        failure { ... }  // Runs only if any stage fails
    }
}
```

#### Key concepts:

| Keyword | What it does |
|---------|-------------|
| `agent any` | Run the pipeline on any available machine |
| `environment` | Define variables accessible in all stages |
| `credentials('id')` | Securely pull a secret from Jenkins credentials store |
| `tools` | Auto-install tools (Node.js in our case) |
| `stage('Name')` | A named step in the pipeline |
| `sh 'command'` | Run a shell command (Linux). Use `bat` for Windows |
| `checkout scm` | Pull code from the configured repository |
| `post` | Actions that run after all stages complete |

### docker-compose.yml (Jenkins)

Runs the Jenkins server.

```yaml
services:
  jenkins:
    build:
      context: .
      dockerfile: Dockerfile.jenkins   # Custom Jenkins image
    container_name: jenkins
    user: root                          # Needed to access Docker socket
    ports:
      - "8080:8080"                     # Jenkins web interface
      - "50000:50000"                   # Jenkins agent communication
    volumes:
      - jenkins_home:/var/jenkins_home  # Persist Jenkins config/data
      - /var/run/docker.sock:/var/run/docker.sock  # Allow Jenkins to run Docker commands
    restart: unless-stopped

volumes:
  jenkins_home:                         # Named volume - survives container restarts
```

| Field | What it does |
|-------|-------------|
| `build.dockerfile` | Uses our custom Dockerfile (with Docker CLI + libatomic) |
| `user: root` | Runs as root so Jenkins can access the Docker socket |
| `ports: 8080` | Exposes Jenkins web UI |
| `jenkins_home` volume | Persists all Jenkins data (jobs, plugins, config) |
| `docker.sock` volume | Lets Jenkins run Docker commands on the host |

**Commands:**
```bash
docker-compose up -d --build   # Start Jenkins (rebuild image if Dockerfile changed)
docker-compose down            # Stop Jenkins (config is preserved in volume)
docker-compose down -v         # Stop Jenkins AND delete all data
docker logs jenkins            # View Jenkins logs
```

### docker-compose.app.yml (Postgres + API)

Runs PostgreSQL and the Fastify API. Jenkins triggers this during the Deploy stage.

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: deploy-test-db
    environment:
      POSTGRES_USER: prisma
      POSTGRES_PASSWORD: prisma
      POSTGRES_DB: deploy
    volumes:
      - pgdata:/var/lib/postgresql/data  # Persist database data

  app:
    build: .
    container_name: deploy-test-app
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://prisma:prisma@db:5432/deploy
    depends_on:
      - db

volumes:
  pgdata:
```

| Field | What it does |
|-------|-------------|
| `db` service | PostgreSQL 16 database, data persisted in `pgdata` volume |
| `app` service | Fastify API, connects to `db` via Docker internal network |
| `DATABASE_URL` | Connection string passed to Prisma at runtime |
| `depends_on: db` | Ensures Postgres container starts before the app |

**Commands:**
```bash
docker compose -f docker-compose.app.yml up --build -d   # Build and start
docker compose -f docker-compose.app.yml down             # Stop
docker compose -f docker-compose.app.yml logs             # View logs
docker compose -f docker-compose.app.yml logs app         # View only app logs
```

### Dockerfile (API Application)

Builds the API app image.

```dockerfile
FROM node:22-alpine               # Lightweight Node.js base image

RUN apk add --no-cache postgresql-client  # pg_isready for entrypoint

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma              # Schema + migrations
COPY src ./src

RUN npm run build                 # prisma generate && tsc

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3000

CMD ["./entrypoint.sh"]           # Wait for DB, migrate, start server
```

### entrypoint.sh

Runs on every container start (every deploy):

```bash
#!/bin/sh
set -e

# 1. Wait for Postgres to be ready
until pg_isready -h db -p 5432 -U prisma; do sleep 1; done

# 2. Apply pending migrations
npx prisma migrate deploy

# 3. Start the server
exec node dist/index.js
```

### Dockerfile.jenkins (Custom Jenkins Image)

Extends the official Jenkins image with extra tools.

```dockerfile
FROM jenkins/jenkins:lts                    # Official Jenkins LTS image

USER root                                   # Switch to root to install packages

RUN apt-get update && \
    apt-get install -y libatomic1 \         # Required by Node.js 20+
    docker-ce-cli docker-compose-plugin     # Docker CLI for deploy stage

RUN git config --global --add safe.directory '*'  # Fix git ownership warnings

USER jenkins                                # Switch back to jenkins user
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Jenkins says "NodeJS not found" | Manage Jenkins > Tools > NodeJS name must be exactly `NodeJS` |
| Webhook shows red X on GitHub | Check that ngrok is running and the URL matches |
| "permission denied" on Docker socket | Make sure `user: root` is set in docker-compose.yml |
| "not in a git directory" | Rebuild Jenkins: `docker-compose up -d --build` |
| Build never triggers on push | Check "GitHub hook trigger for GITScm polling" is enabled in the job |
| Email not sending | Check Mailtrap credentials and that port 2525 is used |
| API not accessible at :3000 | Run `docker ps` to check if deploy-test-app container is running |
| Port 5432 already allocated | Another Postgres is running on the host; stop it or the db service doesn't expose host ports (already handled) |
| Migrations not running | Check `docker logs deploy-test-app` for entrypoint output |

## Useful Commands

```bash
# Jenkins
docker-compose up -d --build       # Start/rebuild Jenkins
docker-compose down                # Stop Jenkins
docker logs jenkins                # Jenkins logs

# API App + Database
docker compose -f docker-compose.app.yml up --build -d   # Build and start
docker compose -f docker-compose.app.yml down             # Stop
docker compose -f docker-compose.app.yml logs             # All logs
docker logs deploy-test-app                                # App logs only
docker logs deploy-test-db                                 # Database logs only

# ngrok
ngrok http 8080                    # Create tunnel to Jenkins

# Prisma (local development)
npx prisma generate               # Generate Prisma client
npx prisma migrate dev             # Create and apply a new migration
npx prisma migrate deploy          # Apply pending migrations (production)
npx prisma studio                  # Open database GUI

# Git (triggers the pipeline)
git add . && git commit -m "my change" && git push
```
