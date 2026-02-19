# CI/CD com Jenkins, Docker, Prisma e GitHub

Guia para implementar um pipeline de deploy automático: push no GitHub → Jenkins constrói, testa e sobe a aplicação em containers Docker, roda migrations do Prisma e envia e-mail de notificação.

---

## Como funciona

```
git push (GitHub)
        |
  Webhook dispara
        |
   Jenkins recebe
        |
   Pipeline executa:
     1. Checkout  → clona o repositório
     2. Install   → npm install
     3. Build     → prisma generate + tsc (compila TypeScript)
     4. Test      → npm test
     5. Deploy    → docker compose up --build -d
                     └─ container inicia → aguarda Postgres
                                        → prisma migrate deploy
                                        → node dist/index.js
        |
   post { success } → curl envia e-mail via SMTP (Mailtrap)
   post { failure } → curl envia e-mail de falha
```

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 22 + TypeScript |
| API | Fastify 5 |
| ORM | Prisma 7 (`@prisma/adapter-pg`) |
| Banco | PostgreSQL 16 (Docker) |
| CI/CD | Jenkins (Declarative Pipeline) |
| Containers | Docker + Docker Compose |
| Notificações | Mailtrap (SMTP sandbox) via `curl` |

---

## Estrutura do projeto

```
.
├── Jenkinsfile              # Pipeline do CI/CD (Jenkins lê este arquivo)
├── Dockerfile               # Imagem Docker da aplicação Node.js
├── Dockerfile.jenkins       # Imagem Jenkins customizada (Node.js + Docker CLI)
├── docker-compose.yml       # Sobe o Jenkins (porta 8080)
├── docker-compose.app.yml   # Sobe Postgres + API (porta 3000)
├── entrypoint.sh            # Aguarda Postgres → roda migrations → inicia servidor
├── prisma.config.ts         # Configuração do Prisma (datasource via env)
├── prisma/
│   ├── schema.prisma        # Schema do banco (modelos)
│   └── migrations/          # SQL gerado pelo Prisma
├── src/
│   ├── index.ts             # API Fastify (GET /users)
│   └── test.ts              # Suite de testes
├── tsconfig.json
└── package.json
```

---

## Pré-requisitos

- Docker Desktop instalado e rodando
- Git + conta no GitHub
- Conta no [Mailtrap](https://mailtrap.io) (gratuita) para notificações por e-mail
- ngrok (gratuito) para expor o Jenkins ao GitHub via webhook

---

## Implementação passo a passo

### 1. Criar os arquivos do projeto

#### `Dockerfile` — imagem da aplicação

```dockerfile
FROM node:22-alpine

# pg_isready: verifica se o Postgres está pronto (usado no entrypoint)
RUN apk add --no-cache postgresql-client

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Compila TypeScript e gera o Prisma client
RUN npm run build

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3000

CMD ["./entrypoint.sh"]
```

#### `entrypoint.sh` — aguarda Postgres, roda migrations, inicia servidor

Este script é o ponto de entrada do container. Executa toda vez que o container sobe.

```bash
#!/bin/sh
set -e

echo "Waiting for Postgres to be ready..."
until pg_isready -h db -p 5432 -U prisma 2>/dev/null; do
  sleep 1
done
echo "Postgres is ready!"

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec node dist/index.js
```

> `prisma migrate deploy` aplica apenas migrations pendentes — nunca cria novas. Seguro para produção.

#### `docker-compose.app.yml` — Postgres + API

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
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  app:
    build: .
    container_name: deploy-test-app
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://prisma:prisma@db:5432/deploy
    depends_on:
      - db
    restart: unless-stopped

volumes:
  pgdata:
```

> O `DATABASE_URL` usa `db` como host — nome do serviço dentro da rede Docker interna.

#### `Dockerfile.jenkins` — Jenkins com Docker CLI e Node.js

O Jenkins precisa do Docker CLI para executar `docker compose` durante o deploy.

```dockerfile
FROM jenkins/jenkins:lts

USER root

# libatomic1: exigido pelo Node.js 20+
# docker-ce-cli + docker-compose-plugin: para rodar docker dentro do Jenkins
RUN apt-get update && \
    apt-get install -y libatomic1 ca-certificates curl gnupg && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
    chmod a+r /etc/apt/keyrings/docker.asc && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
      https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y docker-ce-cli docker-compose-plugin && \
    rm -rf /var/lib/apt/lists/*

# Evita warnings de permissão do git quando rodando como root
RUN git config --global --add safe.directory '*'

USER jenkins
```

#### `docker-compose.yml` — Jenkins

```yaml
services:
  jenkins:
    build:
      context: .
      dockerfile: Dockerfile.jenkins
    container_name: jenkins
    user: root                           # Necessário para acessar o socket do Docker
    ports:
      - "8080:8080"                      # Interface web do Jenkins
      - "50000:50000"                    # Comunicação com agentes Jenkins
    volumes:
      - jenkins_home:/var/jenkins_home   # Persiste configurações e jobs
      - /var/run/docker.sock:/var/run/docker.sock  # Compartilha o Docker do host
    environment:
      - JAVA_OPTS=-Djenkins.install.runSetupWizard=true
    restart: unless-stopped

volumes:
  jenkins_home:
```

> O volume `/var/run/docker.sock` é o que permite o Jenkins executar `docker compose` no host.

---

### 2. Configurar o Prisma

#### `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  createdAt DateTime @default(now())
}
```

#### `prisma.config.ts`

Lê o `DATABASE_URL` da variável de ambiente — injetada pelo Docker Compose no container.

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

#### Criar a primeira migration (local, durante desenvolvimento)

```bash
# Cria a migration e aplica no banco local
npx prisma migrate dev --name init
```

Isso gera os arquivos em `prisma/migrations/`. Esses arquivos devem ser commitados no Git — o Jenkins vai usá-los no deploy.

---

### 3. Configurar o e-mail com Mailtrap

O e-mail é enviado via `curl` diretamente pelo SMTP do Mailtrap — sem biblioteca Node.js.

#### 3.1. Criar conta no Mailtrap

1. Acesse [mailtrap.io](https://mailtrap.io) e crie uma conta gratuita
2. Em **Email Testing > Inboxes**, crie uma inbox (ex: `jenkins-notifications`)
3. Clique na inbox e vá em **SMTP Settings**
4. Anote as credenciais SMTP:
   - **Host**: `sandbox.smtp.mailtrap.io`
   - **Port**: `2525`
   - **Username**: (ex: `44c92abeb920f3`)
   - **Password**: (ex: `abc123def456`)

#### 3.2. Adicionar a senha no Jenkins

No Jenkins, a senha do Mailtrap é armazenada como credencial segura (não fica exposta nos logs).

- **Manage Jenkins > Credentials > (global) > Add Credentials**
  - Kind: `Secret text`
  - Secret: *(cole o password do Mailtrap)*
  - ID: `mailtrap-password`
  - Save

#### 3.3. Como funciona no Jenkinsfile

O `Jenkinsfile` injeta a credencial via `credentials()` e usa `curl` para enviar o e-mail:

```groovy
environment {
    NOTIFY_EMAIL = 'seu@email.com'
    MAILTRAP_PASSWORD = credentials('mailtrap-password')  // lê do Jenkins Credentials
}
```

```groovy
post {
    success {
        sh '''
            curl --url 'smtp://sandbox.smtp.mailtrap.io:2525' \
              --user 'SEU_SMTP_USERNAME:'"$MAILTRAP_PASSWORD"'' \
              --mail-from 'jenkins@seu-projeto.com' \
              --mail-rcpt 'seu@email.com' \
              --upload-file - <<EOF
From: Jenkins <jenkins@seu-projeto.com>
To: seu@email.com
Subject: SUCCESS: Build completed successfully

The pipeline completed successfully.
All tests passed!
EOF
        '''
    }
    failure {
        sh '''
            curl --url 'smtp://sandbox.smtp.mailtrap.io:2525' \
              --user 'SEU_SMTP_USERNAME:'"$MAILTRAP_PASSWORD"'' \
              --mail-from 'jenkins@seu-projeto.com' \
              --mail-rcpt 'seu@email.com' \
              --upload-file - <<EOF
From: Jenkins <jenkins@seu-projeto.com>
To: seu@email.com
Subject: FAILURE: Build failed

The pipeline FAILED. Check the Jenkins logs for details.
EOF
        '''
    }
}
```

> A senha fica em `$MAILTRAP_PASSWORD` (variável de ambiente injetada pelo Jenkins).
> O SMTP username fica diretamente no script — somente a senha precisa ser protegida.

---

### 4. Escrever o Jenkinsfile completo

```groovy
pipeline {
    agent any

    environment {
        NOTIFY_EMAIL = 'seu@email.com'
        MAILTRAP_PASSWORD = credentials('mailtrap-password')
    }

    tools {
        nodejs 'NodeJS'  // nome configurado em: Manage Jenkins > Tools > NodeJS
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm  // clona o repositório configurado no job
            }
        }

        stage('Install') {
            steps {
                sh 'npm install'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'  // prisma generate && tsc
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Deploy') {
            steps {
                sh 'docker compose -f docker-compose.app.yml up --build -d'
                // Aguarda o entrypoint rodar as migrations e o servidor subir
                sh 'sleep 10 && docker logs deploy-test-app 2>&1'
            }
        }
    }

    post {
        success {
            sh '''
                curl --url 'smtp://sandbox.smtp.mailtrap.io:2525' \
                  --user 'SEU_SMTP_USERNAME:'"$MAILTRAP_PASSWORD"'' \
                  --mail-from 'jenkins@seu-projeto.com' \
                  --mail-rcpt 'seu@email.com' \
                  --upload-file - <<EOF
From: Jenkins <jenkins@seu-projeto.com>
To: seu@email.com
Subject: SUCCESS: Build completed successfully

The pipeline completed successfully.
All tests passed!
EOF
            '''
        }
        failure {
            sh '''
                curl --url 'smtp://sandbox.smtp.mailtrap.io:2525' \
                  --user 'SEU_SMTP_USERNAME:'"$MAILTRAP_PASSWORD"'' \
                  --mail-from 'jenkins@seu-projeto.com' \
                  --mail-rcpt 'seu@email.com' \
                  --upload-file - <<EOF
From: Jenkins <jenkins@seu-projeto.com>
To: seu@email.com
Subject: FAILURE: Build failed

The pipeline FAILED. Check the Jenkins logs for details.
EOF
            '''
        }
    }
}
```

---

### 5. Subir o Jenkins

```bash
docker-compose up -d --build
```

Aguarde ~30 segundos e acesse http://localhost:8080.

**Primeiro acesso:**
```bash
docker logs jenkins   # copie a senha de admin
```

- Cole a senha, clique em **Install suggested plugins**, crie um usuário admin.

#### Instalar plugin NodeJS

- **Manage Jenkins > Plugins > Available plugins** → busque `NodeJS` → Install

#### Configurar o Node.js

- **Manage Jenkins > Tools > NodeJS > Add NodeJS**
  - Name: `NodeJS` *(exatamente este valor — deve ser igual ao `tools { nodejs 'NodeJS' }` no Jenkinsfile)*
  - Check: Install automatically
  - Escolha a versão mais recente
  - Save

#### Adicionar credencial do Mailtrap

- **Manage Jenkins > Credentials > (global) > Add Credentials**
  - Kind: `Secret text`
  - Secret: *(password do Mailtrap SMTP)*
  - ID: `mailtrap-password`

#### Criar o job Pipeline

- **New Item** → nome: `deploy-test` → **Pipeline** → OK
- **General**: marque *GitHub project*, coloque a URL do seu repo
- **Build Triggers**: marque *GitHub hook trigger for GITScm polling*
- **Pipeline**:
  - Definition: `Pipeline script from SCM`
  - SCM: `Git`
  - Repository URL: `https://github.com/SEU_USUARIO/SEU_REPO.git`
  - Branch: `*/main`
  - Script Path: `Jenkinsfile`
- Save

---

### 6. Configurar o webhook do GitHub (para trigger automático)

O Jenkins roda localmente, então o GitHub não consegue alcançá-lo diretamente. Use o ngrok para criar um túnel público.

```bash
ngrok http 8080
```

Copie a URL pública (ex: `https://abc123.ngrok-free.app`).

**No Jenkins:**
- **Manage Jenkins > System > Jenkins URL** → cole a URL do ngrok → Save

**No GitHub:**
- Repo → **Settings > Webhooks > Add webhook**
  - Payload URL: `https://SUA-URL-NGROK/github-webhook/`
  - Content type: `application/json`
  - Events: *Just the push event*
  - Add webhook

---

### 7. Testar o pipeline

```bash
git add .
git commit -m "trigger pipeline"
git push
```

O Jenkins recebe o webhook, executa o pipeline e:
1. Clona o repositório
2. Instala dependências
3. Compila TypeScript e gera o Prisma client
4. Roda os testes
5. Faz o deploy via `docker compose up --build -d`
6. O container aguarda o Postgres, roda `prisma migrate deploy`, inicia o servidor
7. Envia e-mail de sucesso ou falha

API disponível em: http://localhost:3000/users

---

## O que customizar para o seu projeto

| O que mudar | Onde |
|-------------|------|
| E-mail de notificação | `NOTIFY_EMAIL` no `Jenkinsfile` |
| SMTP username do Mailtrap | `--user 'USERNAME:...'` no `Jenkinsfile` |
| Credencial Jenkins | ID `mailtrap-password` no Jenkinsfile + na interface do Jenkins |
| Nome do container | `container_name` no `docker-compose.app.yml` |
| Porta da API | `ports` no `docker-compose.app.yml` e `EXPOSE` no `Dockerfile` |
| Senha do banco | `POSTGRES_PASSWORD` e `DATABASE_URL` no `docker-compose.app.yml` |
| Schema do banco | `prisma/schema.prisma` |
| Rotas da API | `src/index.ts` |

---

## Comandos úteis

```bash
# Jenkins
docker-compose up -d --build         # Sobe/reconstrói o Jenkins
docker-compose down                   # Para o Jenkins (dados preservados)
docker-compose down -v                # Para o Jenkins E apaga todos os dados
docker logs jenkins                   # Logs do Jenkins

# App + Banco
docker compose -f docker-compose.app.yml up --build -d   # Deploy manual
docker compose -f docker-compose.app.yml down             # Para os containers
docker compose -f docker-compose.app.yml logs             # Todos os logs
docker logs deploy-test-app                                # Logs da aplicação
docker logs deploy-test-db                                 # Logs do Postgres

# ngrok
ngrok http 8080                       # Cria túnel para o Jenkins

# Prisma (desenvolvimento local)
npx prisma migrate dev --name nome    # Cria e aplica nova migration
npx prisma migrate deploy             # Aplica migrations pendentes (produção)
npx prisma generate                   # Gera o Prisma client
npx prisma studio                     # Interface visual do banco
```

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Jenkins não encontra NodeJS | O nome em *Manage Jenkins > Tools > NodeJS* deve ser exatamente `NodeJS` |
| Webhook com X vermelho no GitHub | Verifique se o ngrok está rodando e se a URL está atualizada no Jenkins |
| "permission denied" no Docker socket | Confirme que `user: root` está no `docker-compose.yml` do Jenkins |
| Build não dispara no push | Confirme *GitHub hook trigger for GITScm polling* no job |
| E-mail não chega | Verifique o SMTP username no Jenkinsfile e a credencial no Jenkins |
| API não responde na porta 3000 | `docker ps` para verificar se `deploy-test-app` está rodando |
| Migrations não rodam | `docker logs deploy-test-app` para ver a saída do entrypoint |
| "not in a git directory" | Reconstrua o Jenkins: `docker-compose up -d --build` |
