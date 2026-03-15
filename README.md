<div align="center">
<img src="https://capsule-render.vercel.app/api?type=venom&color=0:0f0c29,50:302b63,100:24243e&height=200&section=header&text=YOVI&fontSize=80&fontColor=e0e0e0&fontAlignY=40&desc=Game%20Y%20%E2%80%94%20Universidad%20de%20Oviedo&descAlignY=58&descSize=18&descColor=dddddd" width="100%"/>

[![Release — Test, Build, Publish, Deploy](https://github.com/arquisoft/yovi_en1b/actions/workflows/release-deploy.yml/badge.svg)](https://github.com/arquisoft/yovi_en1b/actions/workflows/release-deploy.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_en1b&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_en1b)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_en1b&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_en1b)

**Claim all three sides of the triangle. Sounds simple. It's not.**

🚀 [**Live → http://4.233.184.98**](http://4.233.184.98)

</div>

---

## 🧑‍🤝‍🧑 The Team

| | Name | Role |
|---|---|---|
| 🛠️ | Alejandro | DevOps & Database |
| 🎨 | Tobias | Frontend |
| ⚙️ | Bilal | Game Logic (Rust) |
| 🔧 | Nacho | Backend |

---

## 📦 Project Structure

```
yovi_en1b/
├── webapp/       ⚛️  React + Vite + TypeScript
├── users/        🟩  Node.js + Express + MongoDB
├── gamey/        🦀  Rust game engine & bot
└── docs/         📐  Arc42 architecture docs
```

---

## 🎯 What can you do?

| | Feature | Description |
|---|---|---|
| 🔐 | **Auth** | Register and log in securely — bcrypt + JWT |
| 🤖 | **vs Bot** | Face the AI at easy, medium or hard |
| 🧑‍🤝‍🧑 | **vs Player** | Local multiplayer, same device |
| 🕰️ | **History** | Browse all your past games |
| ⏪ | **Replay** | Watch any game back move by move |
| 🏆 | **Stats** | Wins, losses, performance by difficulty |
| 📡 | **Monitoring** | Prometheus metrics on the backend |

---

## ⚡ Quickstart

### 🐳 Docker (recommended)

```bash
docker-compose up --build
```

| | Service | URL |
|---|---|---|
| 🌐 | Web App | http://localhost |
| 🟩 | Users API | http://localhost:3000 |
| 📖 | Swagger Docs | http://localhost:3000/api-docs |
| 🦀 | Gamey Engine | http://localhost:4000 |

### 🖥️ Local (no Docker)

```bash
# Backend
cd users && npm install && npm start

# Frontend
cd webapp && npm install && npm run dev

# Game engine
cd gamey && cargo run
```

---

## 📋 Scripts

### 🎨 Webapp
| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run start:all` | Start webapp + users together |

### 🟩 Users
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

---

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=venom&color=0:24243e,50:302b63,100:0f0c29&height=80&section=footer" width="100%"/>

*Built with ❤️ at Universidad de Oviedo — ASW 2025/26*
</div>