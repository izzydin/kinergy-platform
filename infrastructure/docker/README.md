# Docker Infrastructure for Local Development

This directory contains containerization files and database initialization scripts for the Kinergy Platform.

## Quick Start

Start all services (PostgreSQL & Adminer) in detached mode:

```bash
docker compose up -d
```

Stop all running containers:

```bash
docker compose down
```

Stop and remove persistent database volumes:

```bash
docker compose down -v
```

---

## Services & Ports

- **PostgreSQL 16**: `localhost:5432`
- **Adminer (Database GUI)**: `http://localhost:8080`
  - System: `PostgreSQL`
  - Server: `postgres`
  - Username: `kinergy_user`
  - Password: `kinergy_secure_pass`
  - Database: `kinergy_dev`
