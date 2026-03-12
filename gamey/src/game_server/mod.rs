//! Game server — REST endpoints for game state management.
//!
//! This module exposes the core Y game engine over HTTP so the frontend
//! can create games, make moves, load positions, and query board geometry.
//!
//! # Endpoints
//! - `POST /{api_version}/game/new` — Create a new game
//! - `POST /{api_version}/game/move` — Make a move
//! - `POST /{api_version}/game/load` — Load game from YEN
//! - `GET  /{api_version}/game/board-info/{board_size}` — Board geometry info

pub mod dto;
pub mod handlers;

pub use dto::*;
