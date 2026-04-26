<div align="center">

<img src="webapp/src/assets/logo.svg" alt="YOVI logo" width="320" />

# YOVI 🎯

> **Claim all three sides of the triangle. Sounds simple. It's not.**

[![Release — Test, Build, Publish, Deploy](https://github.com/arquisoft/yovi_en1b/actions/workflows/release-deploy.yml/badge.svg)](https://github.com/arquisoft/yovi_en1b/actions/workflows/release-deploy.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_en1b&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_en1b)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_en1b&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_en1b)

🌐 **Play now:** [http://4.233.184.98](http://4.233.184.98)  
📝 **Documentation:** [https://arquisoft.github.io/yovi_en1b/](https://arquisoft.github.io/yovi_en1b/)  
⛓ **API documentation:** [http://4.233.184.98:3000/api-docs/](http://4.233.184.98:3000/api-docs/)  
💻 **Presentation:** [https://unioviedo-my.sharepoint.com/:p:/g/personal/uo300737_uniovi_es/IQB9cM3T7TEoRb0_UlpRNN7KAQqYyhrof3oPOBM6smSkXko?e=MURep5](https://unioviedo-my.sharepoint.com/:p:/g/personal/uo300737_uniovi_es/IQB9cM3T7TEoRb0_UlpRNN7KAQqYyhrof3oPOBM6smSkXko?e=MURep5)

</div>

---

## ✨ Welcome to YOVI

YOVI is a full-stack strategy game built as a monorepo. It combines a React frontend, a Node.js users service, a Rust game engine, and MongoDB-based local infrastructure.

## 👥 The Team

| Contributor | Git Account | Role |
|---|---|---|
| Tobias Navrat | <a href="https://github.com/Th0be">@Th0be</a> | Frontend |
| Ahmet Bilal Yazıcıoğlu | <a href="https://github.com/bilalyazicioglu">@bilalyazicioglu</a> | Game Logic & Bots |
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

| Feature | Description                                                 |
|---|-------------------------------------------------------------|
| **🔐 Authentication** | Register and log in securely to keep track about your games |
| **💥 Game Variants** | Play special modes such as the one with explosion           |
| **🗺️ Board Sizes** | Choose between different board sizes for each match         |
| **🧑‍🤝‍🧑 vs Player** | Play locally against another player on the same device      |
| **🤖 vs Bots** | Challenge bots powered by several strategies                |
| **🕘 Game History** | Browse previous games and review what happened              |
| **🏆 Leaderboard** | Compare results and rankings with other players             |
| **📊 Statistics** | Track wins, losses, and performance over time               |

---

## 🚀 Quickstart

### 🐳 Docker (recommended)

```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| 🌍 Web App | http://4.233.184.98 |
| 🔌 Users API | http://4.233.184.98:3000 |
| 🧭 Swagger Docs | http://4.233.184.98:3000/api-docs |
| 🧠 Gamey Engine | http://4.233.184.98:4000 |
| 🗃️ Database | mongodb://127.0.0.1:27017/app_database |
(Change 4.233.184.98 by localhost if you have it in local)

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

- 📖 Architecture and documentation: `docs/`
- 🧪 Service-specific setup: see the README files in each subproject

---

Built with ❤️ at the University of Oviedo — ASW 2025/26
