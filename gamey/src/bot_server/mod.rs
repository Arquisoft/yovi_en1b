//! HTTP server for Y game bots.
//!
//! This module provides an Axum-based REST API for querying Y game bots.
//! The server exposes endpoints for checking bot status and requesting moves.
//!
//! # Endpoints
//! - `GET /status` - Health check endpoint
//! - `POST /{api_version}/ybot/choose/{bot_id}` - Request a move from a bot
//!
//! # Example
//! ```no_run
//! use gamey::run_bot_server;
//!
//! #[tokio::main]
//! async fn main() {
//!     if let Err(e) = run_bot_server(3000).await {
//!         eprintln!("Server error: {}", e);
//!     }
//! }
//! ```

pub mod choose;
pub mod error;
pub mod state;
pub mod version;
use axum::response::IntoResponse;
use axum::http::Method;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
pub use choose::MoveResponse;
pub use error::ErrorResponse;
pub use version::*;

use crate::{GameYError, RandomBot, YBotRegistry, state::AppState};

/// Creates the Axum router with the given state.
///
/// This is useful for testing the API without binding to a network port.
pub fn create_router(state: AppState) -> axum::Router {
    // Configure CORS for development and production environments
    // We use Any to allow the frontend to be served from any domain (e.g. yovi-en1b.alejandrosanclaudio.com)
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
        ]);
    
    axum::Router::new()
        .route("/status", axum::routing::get(status))
        .route(
            "/{api_version}/ybot/choose/{bot_id}",
            axum::routing::post(choose::choose),
        )
        // Game endpoints
        .route(
            "/{api_version}/game/new",
            axum::routing::post(crate::game_server::handlers::new_game),
        )
        .route(
            "/{api_version}/game/move",
            axum::routing::post(crate::game_server::handlers::make_move),
        )
        .route(
            "/{api_version}/game/load",
            axum::routing::post(crate::game_server::handlers::load_game),
        )
        .route(
            "/{api_version}/game/board-info/{board_size}",
            axum::routing::get(crate::game_server::handlers::board_info),
        )
        // Partner API
        .route(
            "/play",
            axum::routing::post(crate::game_server::handlers::play),
        )
        .route(
            "/compute",
            axum::routing::post(crate::game_server::handlers::compute),
        )
        .with_state(state)
        .layer(cors)
}

/// Creates the default application state with the standard bot registry.
///
/// The default state includes the `RandomBot` which selects moves randomly.
pub fn create_default_state() -> AppState {
    let mut registry = YBotRegistry::new()
        .with_bot(Arc::new(RandomBot))
        .with_bot(Arc::new(crate::DefensiveBot))
        .with_bot(Arc::new(crate::HardBot::default()));

    if let Some(bot) = crate::GenerativeAIBot::from_env() {
        registry = registry.with_bot(Arc::new(bot));
    }

    AppState::new(registry)
}

/// Starts the bot server on the specified port.
///
/// This function blocks until the server is shut down.
///
/// # Arguments
/// * `port` - The TCP port to listen on
///
/// # Errors
/// Returns `GameYError::ServerError` if:
/// - The TCP port cannot be bound (e.g., port already in use, permission denied)
/// - The server encounters an error while running
pub async fn run_bot_server(port: u16) -> Result<(), GameYError> {
    let state = create_default_state();
    let app = create_router(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| GameYError::ServerError {
            message: format!("Failed to bind to {}: {}", addr, e),
        })?;

    println!("Server mode: Listening on http://{}", addr);
    axum::serve(listener, app)
        .await
        .map_err(|e| GameYError::ServerError {
            message: format!("Server error: {}", e),
        })?;

    Ok(())
}

/// Health check endpoint handler.
///
/// Returns "OK" to indicate the server is running.
pub async fn status() -> impl IntoResponse {
    "OK"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_status_endpoint() {
        let response = status().await.into_response();
        assert!(response.status().is_success());
    }

    #[test]
    fn test_create_default_state_contains_basic_bots() {
        let state = create_default_state();
        let registry = state.bots();
        
        // Always has these three
        assert!(registry.find("random_bot").is_some());
        assert!(registry.find("medium").is_some());
        assert!(registry.find("hard").is_some());
    }

    #[test]
    fn test_create_default_state_registers_generative_bot_when_key_present() {
        // Mock the environment variable. Use a unique name to avoid conflicts if possible,
        // but create_default_state specifically looks for GEMINI_API_KEY.
        unsafe { std::env::set_var("GEMINI_API_KEY", "mock_key") };
        
        let state = create_default_state();
        let registry = state.bots();
        
        assert!(registry.find("gemini").is_some(), "GenerativeAIBot should be registered when GEMINI_API_KEY is set");
        
        // Clean up
        unsafe { std::env::remove_var("GEMINI_API_KEY") };
    }
}
