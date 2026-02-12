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
