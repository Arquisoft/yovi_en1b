<div align="center">

<img src="webapp/src/assets/logo.svg" alt="YOVI logo" width="320" />

# YOVI 🎯

> **Claim all three sides of the triangle. Sounds simple. It's not.**

[![Release — Test, Build, Publish, Deploy](https://github.com/arquisoft/yovi_en1b/actions/workflows/release-deploy.yml/badge.svg)](https://github.com/arquisoft/yovi_en1b/actions/workflows/release-deploy.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_en1b&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_en1b)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_en1b&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_en1b)

🌐 **Play now:** [http://4.233.184.98](http://4.233.184.98)  
📝 **Documentation:** [https://arquisoft.github.io/yovi_en1b/](https://arquisoft.github.io/yovi_en1b/)  
⛓ **API documentation:** TODO  
💻 **Presentation:** TODO

</div>

---

## ✨ Welcome to YOVI

YOVI is a full-stack strategy game built as a monorepo. It combines a React frontend, a Node.js users service, a Rust game engine, and MongoDB-based local infrastructure.

## 👥 The Team

| Contributor | Git Account | Role |
|---|---|---|
| Tobias Navrat | <a href="https://github.com/Th0be">@Th0be</a> | Frontend |
| Ahmet Bilal Yazıcıoğlu | <a href="https://github.com/bilalyazicioglu">@bilalyazicioglu</a> | Bots |
| Ignacio Hoyos Diego | <a href="https://github.com/nacho50900">@nacho50900</a> | Backend |
| Alejandro de San Claudio Mesa | <a href="https://github.com/UO300896">@UO300896</a> | Database and DevOps |

---

## 🧱 Project Structure

```text
yovi_en1b/
├── webapp/       React + Vite + TypeScript
├── users/        Node.js + Express + MongoDB
├── gamey/        Rust game engine & bot
├── mongo-init/   JavaScript + MongoDB
└── docs/         Arc42 architecture docs
```

---

## 🎮 What can you do?

| Feature | Description |
|---|---|
| **🔐 Auth** | Register and log in securely with bcrypt + JWT |
| **🤖 vs Bot** | Face the AI at easy, medium, or hard |
| **🧑‍🤝‍🧑 vs Player** | Local multiplayer, same device |
| **🕘 History** | Browse all your past games |
| **🔁 Replay** | Watch any game back move by move |
| **📊 Stats** | Wins, losses, and performance by difficulty |
| **📡 Monitoring** | Prometheus metrics on the backend |
| **🗃️ Database** | Access MongoDB via Compass at `mongodb://127.0.0.1:27017/app_database` |

---

## 🚀 Quickstart

### 🐳 Docker (recommended)

```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| 🌍 Web App | http://localhost |
| 🔌 Users API | http://localhost:3000 |
| 🧭 Swagger Docs | http://localhost:3000/api-docs |
| 🧠 Gamey Engine | http://localhost:4000 |
| 🗃️ Database | mongodb://127.0.0.1:27017/app_database |

### 🛠️ Local (no Docker)

```bash
# Backend
cd users && npm install && npm start

# Frontend
cd webapp && npm install && npm run dev

# Game engine
cd gamey && cargo run
```

---

## ⚙️ Scripts

### 🌐 Webapp
| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run start:all` | Start webapp + users together |

### 🧩 Users
| Command | Description |
|---|---|
| `npm start` | Start the service |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage report |

### 🦀 Gamey (Cargo)
| Command | Description |
|---|---|
| `cargo build` | Build the engine |
| `cargo test` | Run tests |
| `cargo run` | Run the engine |
| `cargo doc` | Generate docs |

### 🗄️ Database (MongoDB)
| Command | Description |
|---|---|
| `docker-compose up -d mongodb` | Start the database in the background |
| `docker-compose stop mongodb` | Stop the database without deleting the instance |
| `docker-compose down` | Shut the environment down |

---

## 📚 More info

- 📖 Architecture and documentation: [`docs/`](docs/)
- 🧪 Service-specific setup: see the README files in each subproject

---

Built with ❤️ at the University of Oviedo — ASW 2025/26
