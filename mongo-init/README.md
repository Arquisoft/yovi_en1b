# yovi_en1b - MongoDB Infrastructure

This directory contains the initialization and configuration for the project's database layer.

## Project Structure

The database setup is divided into two main parts:

- `init.js`: Script for automated database and collection provisioning.
- `docker-compose.yml`: Root configuration for the MongoDB service and data volumes.

## Basic Features

- **Data Persistence**: Uses Docker volumes to ensure user data is not lost after container restarts.
- **Automated Setup**: Self-configuring database environment through initialization scripts.
- **Microservice Integration**: Provides a real storage backend for the user management service.

## Components

- **Deployment**: `docker compose up -d --build`
- **Shutting down**: `docker compose down`
- **Verification**: `docker exec -it mongodb mongosh app_database --eval "db.users.find()"`
