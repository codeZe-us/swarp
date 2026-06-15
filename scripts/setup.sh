#!/bin/bash
set -e

# Change directory to scripts root
cd "$(dirname "$0")"

echo "Setting up local configurations and environment files..."

# Setup scripts env
if [ ! -f .env ]; then
  echo "Copying scripts/.env.example to scripts/.env..."
  cp .env.example .env
else
  echo "scripts/.env already exists."
fi

# Setup web env
if [ ! -f ../web/.env ]; then
  echo "Copying web/.env.example to web/.env..."
  cp ../web/.env.example ../web/.env
else
  echo "web/.env already exists."
fi

echo "Swarp monorepo environment setup complete. Please populate secret keys in .env files."
