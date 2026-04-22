//! Request handlers for the game server API.
//!
//! Each handler corresponds to one REST endpoint and delegates to the core game engine.

use crate::bot_server::error::ErrorResponse;
use crate::game_server::dto::{
    BoardInfoResponse, ComputeRequest, ComputeResponse, GameStateResponse, MakeMoveRequest,
    NewGameRequest, PlayRequest, PlayResponse,
};
use crate::{
    DefensiveBot, GameAction, GameVariant, GameY, GenerativeAIBot, HardBot, Movement, PlayerId,
    RandomBot, YBot, YEN, check_api_version,
};
use axum::extract::Path;
use axum::Json;
use serde::Deserialize;

/// Path parameters shared by all game endpoints that include the API version.
#[derive(Deserialize)]
pub struct VersionParam {
    /// The API version (e.g., "v1").
    api_version: String,
}

/// Path parameters for the board-info endpoint.
#[derive(Deserialize)]
pub struct BoardInfoParams {
    /// The API version (e.g., "v1").
    api_version: String,
    /// The board size to get information about.
    board_size: u32,
}

/// `POST /{api_version}/game/new`
///
/// Creates a new game with the specified board size.
///
/// # Request Body
/// ```json
/// { "board_size": 7 }
/// ```
///
/// # Response
/// A `GameStateResponse` with the initial empty board state.
#[axum::debug_handler]
pub async fn new_game(
    Path(params): Path<VersionParam>,
    Json(req): Json<NewGameRequest>,
) -> Result<Json<GameStateResponse>, Json<ErrorResponse>> {
    check_api_version(&params.api_version)?;

    if req.board_size == 0 || req.board_size > 100 {
        return Err(Json(ErrorResponse::error(
            &format!(
                "Invalid board size: {}. Must be between 1 and 100.",
                req.board_size
            ),
            Some(params.api_version),
            None,
        )));
    }

    let variants: Vec<GameVariant> = req
        .variants
        .iter()
        .filter_map(|v| GameVariant::from_name(v))
        .collect();

    // DoubleTurn still enforces a minimum inside new_with_variants; no need
    // for a blanket rejection here. Explosions now works on any board size.
    let game = if variants.is_empty() {
        GameY::new(req.board_size)
    } else {
        GameY::new_with_variants(req.board_size, variants)
    };
    let response = GameStateResponse::from_game(&game, params.api_version);
    Ok(Json(response))
}

/// `POST /{api_version}/game/move`
///
/// Makes a move in an existing game. The request body contains the current game
/// state (in YEN format) and the move to make.
///
/// # Request Body
/// ```json
/// {
///   "game": { "size": 3, "turn": 0, "players": ["B","R"], "layout": "./../..." },
///   "movement": { "player_id": 0, "coords": { "x": 2, "y": 0, "z": 0 } }
/// }
/// ```
///
/// # Response
/// A `GameStateResponse` with the updated game state after the move.
#[axum::debug_handler]
pub async fn make_move(
    Path(params): Path<VersionParam>,
    Json(req): Json<MakeMoveRequest>,
) -> Result<Json<GameStateResponse>, Json<ErrorResponse>> {
    check_api_version(&params.api_version)?;

    let mut game = GameY::try_from(req.game).map_err(|err| {
        Json(ErrorResponse::error(
            &format!("Invalid YEN format: {}", err),
            Some(params.api_version.clone()),
            None,
        ))
    })?;

    let player = PlayerId::new(req.movement.player_id);
    let movement = build_movement(player, &req.movement)?;

    game.add_move(movement).map_err(|err| {
        Json(ErrorResponse::error(
            &format!("Invalid move: {}", err),
            Some(params.api_version.clone()),
            None,
        ))
    })?;

    let response = GameStateResponse::from_game(&game, params.api_version);
    Ok(Json(response))
}

/// `POST /{api_version}/game/load`
///
/// Loads a game from a YEN representation.
///
/// # Request Body
/// A JSON object in YEN format.
///
/// # Response
/// A `GameStateResponse` with the loaded game state.
#[axum::debug_handler]
pub async fn load_game(
    Path(params): Path<VersionParam>,
    Json(yen): Json<YEN>,
) -> Result<Json<GameStateResponse>, Json<ErrorResponse>> {
    check_api_version(&params.api_version)?;

    let game = GameY::try_from(yen).map_err(|err| {
        Json(ErrorResponse::error(
            &format!("Invalid YEN format: {}", err),
            Some(params.api_version.clone()),
            None,
        ))
    })?;

    let response = GameStateResponse::from_game(&game, params.api_version);
    Ok(Json(response))
}

/// `GET /{api_version}/game/board-info/{board_size}`
///
/// Returns board geometry information: coordinates, sides, and neighbors
/// for every cell on a board of the given size.
///
/// This endpoint requires no game state and is useful for the frontend
/// to initialize the board rendering.
#[axum::debug_handler]
pub async fn board_info(
    Path(params): Path<BoardInfoParams>,
) -> Result<Json<BoardInfoResponse>, Json<ErrorResponse>> {
    check_api_version(&params.api_version)?;

    if params.board_size == 0 || params.board_size > 100 {
        return Err(Json(ErrorResponse::error(
            &format!(
                "Invalid board size: {}. Must be between 1 and 100.",
                params.board_size
            ),
            Some(params.api_version),
            None,
        )));
    }

    let response = BoardInfoResponse::from_board_size(params.board_size, params.api_version);
    Ok(Json(response))
}

// ============================================================================
// Partner API (Nacho) Endpoints
// ============================================================================

/// `POST /play`
///
/// Handles a bot move. Creates a game from the provided YEN state (or starts a
/// new one if null), asks a bot for a move, applies it, and returns the result.
#[axum::debug_handler]
pub async fn play(
    Json(req): Json<PlayRequest>,
) -> Result<Json<PlayResponse>, Json<ErrorResponse>> {
    let mut game = match req.yen_state {
        Some(layout_str) => {
            parse_yen_layout(layout_str, &req.variants, req.explosives.as_deref(), req.turn)?
        }
        None => {
            if req.board_size == 0 || req.board_size > 100 {
                return Err(Json(ErrorResponse::error(
                    &format!("Invalid board size: {}. Must be between 1 and 100.", req.board_size),
                    None,
                    None,
                )));
            }
            let variants: Vec<GameVariant> = req
                .variants
                .iter()
                .filter_map(|v| GameVariant::from_name(v))
                .collect();

            if variants.is_empty() {
                GameY::new(req.board_size)
            } else {
                GameY::new_with_variants(req.board_size, variants)
            }
        }
    };

    if let crate::GameStatus::Finished { .. } = game.status() {
        return Err(Json(ErrorResponse::error("Game is already finished", None, None)));
    }

    let bot = pick_bot(req.strategy.as_deref(), req.difficulty_level.as_deref());

    let coords = bot.choose_move(&game).ok_or_else(|| {
        Json(ErrorResponse::error("Bot could not find a move", None, None))
    })?;

    let next_player = match game.status() {
        crate::GameStatus::Ongoing { next_player } => next_player,
        _ => return Err(Json(ErrorResponse::error("Game is already finished", None, None))),
    };

    game.add_move(Movement::Placement {
        player: *next_player,
        coords,
    }).map_err(|err| {
        Json(ErrorResponse::error(
            &format!("Failed to apply bot move: {}", err),
            None,
            None,
        ))
    })?;

    let response_yen: YEN = (&game).into();
    // Embed the authoritative turn directly inside `yen_state` as a "t{n}|"
    // prefix (e.g. "t1|R/BR/...").  The client treats `yen_state` as an opaque
    // string and echoes it back unchanged, so the server can always recover the
    // correct turn on the next request — even when the piece-count heuristic
    // would give the wrong answer after a bomb explosion.
    let authoritative_turn = response_yen.turn();
    Ok(Json(PlayResponse {
        coordinates: coords,
        yen_state: format!("t{}|{}", authoritative_turn, response_yen.layout()),
        winner: get_winner_string(&game),
        variants: response_yen.variants().to_vec(),
        explosives: response_yen.explosives().map(|s| s.to_string()),
        turn: authoritative_turn,
    }))
}

/// `POST /compute`
///
/// Handles a human move. Creates a game from state (or starts new if null),
/// applies the given placement coordinates, and returns the updated state.
#[axum::debug_handler]
pub async fn compute(
    Json(req): Json<ComputeRequest>,
) -> Result<Json<ComputeResponse>, Json<ErrorResponse>> {
    let mut game = match req.yen_state_prev {
        Some(layout_str) => {
            parse_yen_layout(layout_str, &req.variants, req.explosives.as_deref(), req.turn)?
        }
        None => {
            // Reconstruct board size from first move coordinates
            // In barycentric coordinates: x + y + z = board_size - 1
            let c = req.coordinates;
            let board_size = c.x() + c.y() + c.z() + 1;
            let variants: Vec<GameVariant> = req
                .variants
                .iter()
                .filter_map(|v| GameVariant::from_name(v))
                .collect();
            if !variants.is_empty() {
                GameY::new_with_variants(board_size, variants)
            } else {
                GameY::new(board_size)
            }
        }
    };

    if let crate::GameStatus::Finished { .. } = game.status() {
        return Err(Json(ErrorResponse::error("Game is already finished", None, None)));
    }

    let next_player = match game.status() {
        crate::GameStatus::Ongoing { next_player } => next_player,
        _ => return Err(Json(ErrorResponse::error("Game is already finished", None, None))),
    };

    game.add_move(Movement::Placement {
        player: *next_player,
        coords: req.coordinates,
    }).map_err(|err| {
        Json(ErrorResponse::error(
            &format!("Invalid move: {}", err),
            None,
            None,
        ))
    })?;

    let response_yen: YEN = (&game).into();
    // Same "t{n}|" prefix trick as in /play — embeds the authoritative turn
    // into the layout string so it survives the round-trip without any
    // client-side changes.
    let authoritative_turn = response_yen.turn();
    Ok(Json(ComputeResponse {
        yen_state: format!("t{}|{}", authoritative_turn, response_yen.layout()),
        winner: get_winner_string(&game),
        variants: response_yen.variants().to_vec(),
        explosives: response_yen.explosives().map(|s| s.to_string()),
        turn: authoritative_turn,
    }))
}

/// Helper: chooses a bot based on the strategy / difficulty-level strings.
///
/// Matching is case-insensitive and accepts every alias the various clients
/// actually send:
///
/// - [`RandomBot`]: `random`, `random_bot`, `easy`
/// - [`DefensiveBot`]: `medium`, `defensive`, `balanced`
/// - [`HardBot`]: `hard`, `ai`, `mcts`, `aggressive`
///
/// If `strategy` is not set we fall back to `difficulty_level`, and if neither
/// matches we default to [`RandomBot`]. This addresses issue #194: the webapp
/// sends `strategy: "aggressive"` for hard mode and `strategy: "balanced"` for
/// medium mode (see `webapp/src/pages/NewGamePage.tsx`), neither of which the
/// previous matcher recognized — so every difficulty silently fell through to
/// [`RandomBot`].
fn pick_bot(strategy: Option<&str>, difficulty_level: Option<&str>) -> Box<dyn YBot> {
    // Try the strategy first, then fall back to difficulty_level. Both fields
    // may be present in the same request (the webapp sends both), and if the
    // strategy value is unknown we still want a meaningful choice, so we
    // consult difficulty_level as a secondary signal.
    let strategy_bot = strategy.and_then(|s| match_bot(s));
    if let Some(bot) = strategy_bot {
        return bot;
    }
    if let Some(bot) = difficulty_level.and_then(|s| match_bot(s)) {
        return bot;
    }
    Box::new(RandomBot)
}

/// Matches a single string to a bot, or returns `None` if the string is not a
/// recognized alias.
fn match_bot(name: &str) -> Option<Box<dyn YBot>> {
    match name.to_lowercase().as_str() {
        // "ncts" is the label the users service uses (see gameRoutes.js) —
        // it maps to the hard-mode MCTS bot. Included explicitly so the
        // strategy match wins directly instead of depending on the
        // difficulty_level fallback.
        "hard" | "ai" | "mcts" | "ncts" | "aggressive" => Some(Box::new(HardBot::default())),
        "medium" | "defensive" | "balanced" => Some(Box::new(DefensiveBot)),
        "random" | "random_bot" | "easy" => Some(Box::new(RandomBot)),
        // Generative AI bot (Google Gemini). Requires GEMINI_API_KEY env var.
        // Falls back to a random move if the key is not set or the API call fails.
        "gemini" | "generative" | "generativeai" | "generative_ai" => {
            GenerativeAIBot::from_env()
                .map(|b| Box::new(b) as Box<dyn YBot>)
                .or_else(|| {
                    tracing::warn!(
                        "GEMINI_API_KEY is not set; 'gemini' strategy falls back to RandomBot"
                    );
                    Some(Box::new(RandomBot))
                })
        }
        _ => None,
    }
}

/// Helper: parses a YEN layout string into a [`GameY`] instance, preserving
/// variants, bomb positions, and — critically — the correct turn.
///
/// ## Turn resolution order (highest priority first)
///
/// 1. **`explicit_turn`** – the `turn` field from the JSON request body, when
///    the client sends it.
/// 2. **Embedded prefix** – the server encodes the authoritative turn directly
///    inside `yen_state` as a `"t{n}|"` prefix (e.g. `"t1|R/BR/..."`).
///    Because the client echoes `yen_state` back unchanged, this survives the
///    round-trip without *any* client-side changes — which is important for
///    the Explosions variant where a bomb can leave the mover with fewer pieces
///    than the opponent, causing the naïve piece-count heuristic to give the
///    wrong answer.
/// 3. **Piece-count heuristic** – fallback for old layouts that carry neither
///    of the above.  Works correctly for all non-explosion scenarios but will
///    mis-fire when an explosion shifted piece counts unexpectedly.
fn parse_yen_layout(
    layout_str: String,
    variants: &[String],
    explosives: Option<&str>,
    explicit_turn: Option<u32>,
) -> Result<GameY, Json<ErrorResponse>> {
    // ── Step 1: strip the optional "t{n}|" turn prefix ───────────────────────
    // The server embeds this prefix into every `yen_state` response so the
    // turn survives the round-trip even when the client does not include the
    // separate `turn` request field.
    let (layout_str, prefix_turn) = if let Some(rest) = layout_str.strip_prefix("t0|") {
        (rest.to_string(), Some(0u32))
    } else if let Some(rest) = layout_str.strip_prefix("t1|") {
        (rest.to_string(), Some(1u32))
    } else {
        (layout_str, None)
    };

    let size = layout_str.split('/').count() as u32;

    // ── Step 2: pick the most-authoritative turn source ───────────────────────
    let turn = explicit_turn          // highest priority: explicit request field
        .or(prefix_turn)              // then: embedded prefix
        .unwrap_or_else(|| {          // last resort: piece-count heuristic
            let b_count = layout_str.chars().filter(|c| *c == 'B').count();
            let r_count = layout_str.chars().filter(|c| *c == 'R').count();
            if b_count > r_count { 1 } else { 0 }
        });

    let yen = YEN::new_with_variants(
        size,
        turn,
        vec!['B', 'R'],
        layout_str,
        variants.to_vec(),
        explosives.map(|s| s.to_string()),
    );
    GameY::try_from(yen).map_err(|err| {
        Json(ErrorResponse::error(
            &format!("Invalid YEN layout: {}", err),
            None,
            None,
        ))
    })
}

/// Helper: returns the winner string ("B" or "R") if the game is finished.
fn get_winner_string(game: &GameY) -> Option<String> {
    match game.status() {
        crate::GameStatus::Finished { winner } => {
            if winner.id() == 0 {
                Some("B".to_string())
            } else {
                Some("R".to_string())
            }
        }
        _ => None,
    }
}

/// Helper: converts a `MoveRequest` into a core `Movement`.
fn build_movement(
    player: PlayerId,
    req: &crate::game_server::dto::MoveRequest,
) -> Result<Movement, Json<ErrorResponse>> {
    match (&req.coords, &req.action) {
        (Some(coords), None) => Ok(Movement::Placement {
            player,
            coords: *coords,
        }),
        (None, Some(action_str)) => {
            let action = match action_str.to_lowercase().as_str() {
                "swap" => GameAction::Swap,
                "resign" => GameAction::Resign,
                _ => {
                    return Err(Json(ErrorResponse::error(
                        &format!("Unknown action: '{}'. Valid actions: swap, resign", action_str),
                        None,
                        None,
                    )));
                }
            };
            Ok(Movement::Action { player, action })
        }
        (Some(_), Some(_)) => Err(Json(ErrorResponse::error(
            "Cannot specify both 'coords' and 'action' in the same move",
            None,
            None,
        ))),
        (None, None) => Err(Json(ErrorResponse::error(
            "Must specify either 'coords' (for placement) or 'action' (swap/resign)",
            None,
            None,
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Coordinates;

    #[test]
    fn test_build_movement_placement() {
        let req = crate::game_server::dto::MoveRequest {
            player_id: 0,
            coords: Some(Coordinates::new(1, 2, 1)),
            action: None,
        };
        let result = build_movement(PlayerId::new(0), &req);
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_movement_resign() {
        let req = crate::game_server::dto::MoveRequest {
            player_id: 0,
            coords: None,
            action: Some("resign".to_string()),
        };
        let result = build_movement(PlayerId::new(0), &req);
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_movement_swap() {
        let req = crate::game_server::dto::MoveRequest {
            player_id: 1,
            coords: None,
            action: Some("Swap".to_string()),
        };
        let result = build_movement(PlayerId::new(1), &req);
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_movement_both_errors() {
        let req = crate::game_server::dto::MoveRequest {
            player_id: 0,
            coords: Some(Coordinates::new(0, 0, 0)),
            action: Some("resign".to_string()),
        };
        let result = build_movement(PlayerId::new(0), &req);
        assert!(result.is_err());
    }

    #[test]
    fn test_build_movement_neither_errors() {
        let req = crate::game_server::dto::MoveRequest {
            player_id: 0,
            coords: None,
            action: None,
        };
        let result = build_movement(PlayerId::new(0), &req);
        assert!(result.is_err());
    }

    #[test]
    fn test_build_movement_unknown_action() {
        let req = crate::game_server::dto::MoveRequest {
            player_id: 0,
            coords: None,
            action: Some("fly".to_string()),
        };
        let result = build_movement(PlayerId::new(0), &req);
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_new_game_success() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let req = axum::Json(NewGameRequest { board_size: 3, variants: vec![] });
        let res = new_game(params, req).await;
        assert!(res.is_ok());
        assert_eq!(res.unwrap().0.board_size, 3);
    }

    #[tokio::test]
    async fn test_new_game_invalid_size() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let req = axum::Json(NewGameRequest { board_size: 0, variants: vec![] });
        let res = new_game(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid board size"));
    }

    #[tokio::test]
    async fn test_new_game_too_large() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let req = axum::Json(NewGameRequest { board_size: 101, variants: vec![] });
        let res = new_game(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid board size"));
    }

    #[tokio::test]
    async fn test_new_game_invalid_version() {
        let params = axum::extract::Path(VersionParam { api_version: "v2".to_string() });
        let req = axum::Json(NewGameRequest { board_size: 3, variants: vec![] });
        let res = new_game(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Unsupported API version"));
    }

    #[tokio::test]
    async fn test_make_move_success() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let yen = crate::YEN::new(2, 0, vec!['B', 'R'], "./..".to_string());
        let req = axum::Json(MakeMoveRequest {
            game: yen,
            movement: crate::game_server::dto::MoveRequest {
                player_id: 0,
                coords: Some(Coordinates::new(0, 0, 1)),
                action: None,
            },
        });
        let res = make_move(params, req).await;
        assert!(res.is_ok());
        assert_eq!(res.unwrap().0.board_size, 2);
    }

    #[tokio::test]
    async fn test_make_move_invalid_yen() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let yen = crate::YEN::new(2, 0, vec!['B', 'R'], "123".to_string()); // invalid layout
        let req = axum::Json(MakeMoveRequest {
            game: yen,
            movement: crate::game_server::dto::MoveRequest {
                player_id: 0,
                coords: Some(Coordinates::new(0, 0, 1)),
                action: None,
            },
        });
        let res = make_move(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid YEN"));
    }

    #[tokio::test]
    async fn test_make_move_invalid_movement() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let yen = crate::YEN::new(2, 0, vec!['B', 'R'], "./..".to_string());
        let req = axum::Json(MakeMoveRequest {
            game: yen,
            movement: crate::game_server::dto::MoveRequest {
                player_id: 0,
                coords: Some(Coordinates::new(0, 0, 1)),
                action: Some("swap".to_string()), // both coords and action
            },
        });
        let res = make_move(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Cannot specify both"));
    }

   #[tokio::test]
    async fn test_make_move_game_error() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let yen = crate::YEN::new(2, 0, vec!['B', 'R'], "B/..".to_string()); // B is occupied
        let req = axum::Json(MakeMoveRequest {
            game: yen,
            movement: crate::game_server::dto::MoveRequest {
                player_id: 0,
                coords: Some(Coordinates::new(0, 0, 1)), // B is at (0,0,1) with the new React-synced coords
                action: None,
            },
        });
        let res = make_move(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid move"));
    }

    #[tokio::test]
    async fn test_make_move_invalid_version() {
        let params = axum::extract::Path(VersionParam { api_version: "v2".to_string() });
        let yen = crate::YEN::new(2, 0, vec!['B', 'R'], "./..".to_string());
        let req = axum::Json(MakeMoveRequest {
            game: yen,
            movement: crate::game_server::dto::MoveRequest {
                player_id: 0,
                coords: Some(Coordinates::new(0, 0, 1)),
                action: None,
            },
        });
        let res = make_move(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Unsupported API version"));
    }

    #[tokio::test]
    async fn test_load_game_success() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let yen = crate::YEN::new(2, 0, vec!['B', 'R'], "./..".to_string());
        let req = axum::Json(yen);
        let res = load_game(params, req).await;
        assert!(res.is_ok());
        assert_eq!(res.unwrap().0.board_size, 2);
    }

    #[tokio::test]
    async fn test_load_game_invalid_yen() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let yen = crate::YEN::new(2, 0, vec!['B', 'R'], "invalid".to_string());
        let req = axum::Json(yen);
        let res = load_game(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid YEN format"));
    }

    #[tokio::test]
    async fn test_load_game_invalid_version() {
        let params = axum::extract::Path(VersionParam { api_version: "v2".to_string() });
        let yen = crate::YEN::new(2, 0, vec!['B', 'R'], "./..".to_string());
        let req = axum::Json(yen);
        let res = load_game(params, req).await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_board_info_success() {
        let params = axum::extract::Path(BoardInfoParams { api_version: "v1".to_string(), board_size: 3 });
        let res = board_info(params).await;
        assert!(res.is_ok());
        assert_eq!(res.unwrap().0.board_size, 3);
    }

    #[tokio::test]
    async fn test_board_info_invalid_version() {
        let params = axum::extract::Path(BoardInfoParams { api_version: "v2".to_string(), board_size: 3 });
        let res = board_info(params).await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_board_info_invalid_size() {
        let params = axum::extract::Path(BoardInfoParams { api_version: "v1".to_string(), board_size: 0 });
        let res = board_info(params).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid board size"));
        
        let params2 = axum::extract::Path(BoardInfoParams { api_version: "v1".to_string(), board_size: 101 });
        let res2 = board_info(params2).await;
        assert!(res2.is_err());
    }

    /// Helper to build a minimal [`PlayRequest`] in tests.
    fn play_req(
        yen_state: Option<&str>,
        strategy: Option<&str>,
        board_size: u32,
    ) -> axum::Json<PlayRequest> {
        axum::Json(PlayRequest {
            yen_state: yen_state.map(|s| s.to_string()),
            strategy: strategy.map(|s| s.to_string()),
            difficulty_level: None,
            board_size,
            variants: vec![],
            explosives: None,
            turn: None,
        })
    }

    /// Helper to build a minimal [`ComputeRequest`] in tests.
    fn compute_req(
        yen_state_prev: Option<&str>,
        coordinates: Coordinates,
    ) -> axum::Json<ComputeRequest> {
        axum::Json(ComputeRequest {
            yen_state_prev: yen_state_prev.map(|s| s.to_string()),
            coordinates,
            variants: vec![],
            explosives: None,
            turn: None,
        })
    }

    #[tokio::test]
    async fn test_computation_false_win() {
        // Based on visually disconnected pieces that might be falsely triggering a win.
        // Size 5: Red at corners (4,0,0), (1,3,0), (1,0,3)? Wait, let's just make Red disconnected.
        let req = compute_req(
            Some("R/B./.B./R..R/....."),
            Coordinates::new(0, 2, 2), // random move on size 5
        );
        let res = compute(req).await;
        assert!(res.is_ok(), "Should successfully parse state and make move");
        let res_json = res.unwrap().0;
        // In this state, R pieces are NOT connected. Winner should be None!
        assert_eq!(res_json.winner, None, "Red pieces are disconnected, should not win!");
    }

    #[tokio::test]
    async fn test_play_success_with_defensive_strategy() {
        // Size 2, R at top corner (0,0,1)
        let req = play_req(Some("R/.."), Some("defensive"), 2);
        let res = play(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;

        // Size 2 board, R at top corner (0,0,1). Neighbors are (1,0,0) and (0,1,0).
        // The bot (B) should have picked one of these.
        let chosen_coords = res_json.coordinates;
        let r_coords = Coordinates::new(0, 0, 1);
        let neighbors = r_coords.neighbors(2);
        assert!(neighbors.contains(&chosen_coords), "Defensive bot should pick a neighbor of R's move");
    }

    #[tokio::test]
    async fn test_play_success_with_medium_strategy() {
        // "medium" is the actual registered name of DefensiveBot. Before the fix
        // for issue #194, passing "medium" silently fell through to RandomBot.
        let req = play_req(Some("R/.."), Some("medium"), 2);
        let res = play(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        let chosen_coords = res_json.coordinates;
        let r_coords = Coordinates::new(0, 0, 1);
        let neighbors = r_coords.neighbors(2);
        assert!(
            neighbors.contains(&chosen_coords),
            "'medium' should route to DefensiveBot, which picks a neighbor of R's move"
        );
    }

    #[tokio::test]
    async fn test_play_strategy_is_case_insensitive() {
        // "HARD" / "Medium" / mixed case should still route to the right bot.
        let req = play_req(Some("./.."), Some("HARD"), 2);
        assert!(play(req).await.is_ok());

        let req = play_req(Some("R/.."), Some("Medium"), 2);
        let res = play(req).await.unwrap().0;
        let chosen = res.coordinates;
        let neighbors = Coordinates::new(0, 0, 1).neighbors(2);
        assert!(neighbors.contains(&chosen));
    }

    #[tokio::test]
    async fn test_play_strategy_falls_back_to_difficulty_level() {
        // If the caller sets difficulty_level instead of strategy, we should still
        // honour it (the Nacho partner API uses difficulty_level).
        let req = axum::Json(PlayRequest {
            yen_state: Some("R/..".to_string()),
            strategy: None,
            difficulty_level: Some("medium".to_string()),
            board_size: 2,
            variants: vec![],
            explosives: None,
            turn: None,
        });
        let res = play(req).await;
        assert!(res.is_ok());
        let chosen = res.unwrap().0.coordinates;
        let neighbors = Coordinates::new(0, 0, 1).neighbors(2);
        assert!(neighbors.contains(&chosen));
    }

    #[tokio::test]
    async fn test_play_success_with_hard_strategy() {
        let req = play_req(Some("./.."), Some("hard"), 2);
        let res = play(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
    }

    #[tokio::test]
    async fn test_play_success_with_yen() {
        let req = play_req(Some("./.."), Some("random"), 2);
        let res = play(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
        assert_eq!(res_json.winner, None);
    }

    #[tokio::test]
    async fn test_play_success_without_yen() {
        let req = play_req(None, None, 2);
        let res = play(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
    }

    #[tokio::test]
    async fn test_play_invalid_board_size() {
        let req = play_req(None, None, 0);
        let res = play(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid board size"));
    }

    #[tokio::test]
    async fn test_play_invalid_yen() {
        let req = play_req(Some("12"), None, 2); // Invalid layout format
        let res = play(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid YEN"));
    }

    #[tokio::test]
    async fn test_play_already_finished() {
        let req = play_req(Some("B"), None, 1); // Size 1 full board
        let res = play(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("finished"));
    }

    #[tokio::test]
    async fn test_play_already_finished_at_next_player() {
        // This is a contrived test to hit the branch where `game.status()` is not `Ongoing`
        // after `bot.choose_move` is called. It shouldn't normally happen, but covering it.
        // B/R size 2 = 3 cells. Full board size 2 is 3 cells.
        let req = play_req(Some("B/RR"), None, 2);
        let res = play(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("finished"));
    }

    #[tokio::test]
    async fn test_play_places_bombs_when_explosions_variant_active() {
        // Issue #203: when the frontend requests the Explosions variant for a new
        // game (no yen_state), the server should place bombs. Afterwards, when
        // round-tripping the game through /play, the bomb positions must be
        // preserved and echoed back in the PlayResponse.
        let req = axum::Json(PlayRequest {
            yen_state: None,
            strategy: Some("random".to_string()),
            difficulty_level: None,
            board_size: 7,
            variants: vec!["Explosions".to_string()],
            explosives: None,
            turn: None,
        });
        let first = play(req).await.expect("play should succeed").0;
        assert!(first.explosives.is_some(), "bomb positions should be returned");
        assert!(first.variants.iter().any(|v| v == "Explosions"));
        assert_eq!(first.yen_state.split('/').count(), 7);
        // Response must carry the authoritative turn.
        assert!(first.turn == 0 || first.turn == 1, "turn must be 0 or 1");

        // Now send the state back to the server — echoing the `turn` field —
        // and confirm both bombs and the correct turn survive the round-trip.
        let req2 = axum::Json(PlayRequest {
            yen_state: Some(first.yen_state.clone()),
            strategy: Some("random".to_string()),
            difficulty_level: None,
            board_size: 7,
            variants: first.variants.clone(),
            explosives: first.explosives.clone(),
            turn: Some(first.turn), // ← echo authoritative turn back
        });
        let second = play(req2).await.expect("second play should succeed").0;
        assert_eq!(
            second.explosives, first.explosives,
            "bomb positions must survive a /play round-trip"
        );
        assert!(second.turn == 0 || second.turn == 1);
    }

    /// Regression test: after a bomb explosion that removes more of the *mover's*
    /// pieces than the opponent's, the piece-count heuristic gives the wrong turn.
    ///
    /// The fix embeds the authoritative turn as a "t{n}|" prefix inside every
    /// `yen_state` response.  When the client echoes `yen_state` back (without
    /// any `turn` field), the server decodes the prefix and uses the correct turn.
    ///
    /// Three branches are tested:
    ///   1. **Prefix round-trip** — `yen_state = "t1|R/BR/..."`, no `turn` field
    ///      → server decodes prefix, bot moves as R.
    ///   2. **Explicit turn field** — `yen_state = "R/BR/..."`, `turn = Some(1)`
    ///      → explicit field takes priority, bot moves as R.
    ///   3. **Heuristic fires** — `yen_state = "R/BR/..."`, no `turn`, no prefix
    ///      → heuristic picks B (wrong), bot moves as B (demonstrates the bug
    ///         this fix resolves).
    #[tokio::test]
    async fn test_turn_survives_explosion_round_trip() {
        // "R/BR/..." — size-3 board with B=1, R=2.
        //   Row 0 (1 cell): "R"
        //   Row 1 (2 cells): "BR"
        //   Row 2 (3 cells): "..."
        // Piece-count heuristic: b_count(1) > r_count(2) → false → turn=0 (B). ← WRONG
        let bare_layout = "R/BR/...";
        let b_count = bare_layout.chars().filter(|c| *c == 'B').count(); // 1
        let r_count = bare_layout.chars().filter(|c| *c == 'R').count(); // 2

        // Sanity-check: heuristic IS wrong for this layout.
        let heuristic_turn = if b_count > r_count { 1u32 } else { 0u32 };
        assert_eq!(heuristic_turn, 0, "heuristic must give the wrong turn for this state");

        // ── Branch 1: prefix in yen_state, no turn field ─────────────────────
        // Simulate client echoing back the "t1|…" yen_state it received from
        // the server — without including the separate `turn` field.
        let req_prefix = axum::Json(PlayRequest {
            yen_state: Some(format!("t1|{}", bare_layout)), // ← embedded prefix
            strategy: Some("random".to_string()),
            difficulty_level: None,
            board_size: 3,
            variants: vec![],
            explosives: None,
            turn: None, // ← no explicit field — server must use prefix
        });
        let resp_prefix = play(req_prefix)
            .await
            .expect("play should succeed with prefix-encoded turn")
            .0;

        // Response yen_state must carry a fresh "t{n}|" prefix.
        assert!(
            resp_prefix.yen_state.starts_with("t0|") || resp_prefix.yen_state.starts_with("t1|"),
            "response yen_state must carry a 't{{n}}|' prefix, got: {}",
            resp_prefix.yen_state
        );
        let new_r_prefix = resp_prefix.yen_state.chars().filter(|c| *c == 'R').count();
        let r_won_prefix  = resp_prefix.winner == Some("R".to_string());
        assert!(
            new_r_prefix > r_count || r_won_prefix,
            "with prefix turn=1, bot should move as R; \
             r_count: {} → {} (winner={:?})",
            r_count, new_r_prefix, resp_prefix.winner
        );

        // ── Branch 2: explicit turn field (no prefix) ────────────────────────
        let req_explicit = axum::Json(PlayRequest {
            yen_state: Some(bare_layout.to_string()),
            strategy: Some("random".to_string()),
            difficulty_level: None,
            board_size: 3,
            variants: vec![],
            explosives: None,
            turn: Some(1), // ← explicit field overrides heuristic
        });
        let resp_explicit = play(req_explicit)
            .await
            .expect("play should succeed with explicit turn")
            .0;
        let new_r_explicit = resp_explicit.yen_state.chars().filter(|c| *c == 'R').count();
        let r_won_explicit  = resp_explicit.winner == Some("R".to_string());
        assert!(
            new_r_explicit > r_count || r_won_explicit,
            "with explicit turn=1, bot should move as R; \
             r_count: {} → {} (winner={:?})",
            r_count, new_r_explicit, resp_explicit.winner
        );

        // ── Branch 3: heuristic fallback (no prefix, no turn field) ──────────
        // Without either source of authoritative turn info the heuristic fires
        // and picks B (turn=0). This branch documents the original bug and
        // confirms the fallback still works (even if it gives the wrong answer
        // in this specific post-explosion layout).
        let req_heuristic = axum::Json(PlayRequest {
            yen_state: Some(bare_layout.to_string()),
            strategy: Some("random".to_string()),
            difficulty_level: None,
            board_size: 3,
            variants: vec![],
            explosives: None,
            turn: None,
        });
        let resp_heuristic = play(req_heuristic)
            .await
            .expect("play should succeed with heuristic turn")
            .0;
        let new_b_heuristic = resp_heuristic.yen_state.chars().filter(|c| *c == 'B').count();
        let b_won_heuristic  = resp_heuristic.winner == Some("B".to_string());
        assert!(
            new_b_heuristic > b_count || b_won_heuristic,
            "without authoritative turn info, heuristic picks B and bot moves as B; \
             b_count: {} → {} (winner={:?})",
            b_count, new_b_heuristic, resp_heuristic.winner
        );
    }

    #[tokio::test]
    async fn test_compute_success_with_yen() {
        let req = compute_req(Some("./.."), Coordinates::new(0, 0, 1));
        let res = compute(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
        assert_eq!(res_json.winner, None);
    }

    #[tokio::test]
    async fn test_compute_winner() {
        // Assume player 1 (R) just placed a piece that finished the game (size 1)
        let req = compute_req(Some("."), Coordinates::new(0, 0, 0));
        let res = compute(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.winner, Some("B".to_string())); // Because turn 0 (B) placed it
    }

    #[tokio::test]
    async fn test_compute_success_without_yen() {
        // Size = 1 + 0 + 0 + 1 = 2
        let req = compute_req(None, Coordinates::new(1, 0, 0));
        let res = compute(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
    }

    #[tokio::test]
    async fn test_compute_invalid_yen() {
        let req = compute_req(Some("12"), Coordinates::new(0, 0, 1)); // Invalid layout
        let res = compute(req).await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_compute_already_finished() {
        // Size 1 full board; already taken cell.
        let req = compute_req(Some("B"), Coordinates::new(0, 0, 0));
        let res = compute(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("finished"));
    }

    #[tokio::test]
    async fn test_compute_already_finished_at_next_player() {
        // Full board.
        let req = compute_req(Some("B/RR"), Coordinates::new(0, 0, 0));
        let res = compute(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("finished"));
    }

    #[tokio::test]
    async fn test_compute_invalid_move() {
        // Top cell occupied; try to play there again.
        let req = compute_req(Some("B/.."), Coordinates::new(0, 0, 1));
        let res = compute(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid move"));
    }

    #[test]
    fn test_pick_bot_routes_strategies() {
        // Names are case-insensitive and support several aliases per bot. This
        // is the regression test for issue #194. In particular the webapp
        // sends strategy: "aggressive" for hard mode and "balanced" for
        // medium, and those used to silently fall through to RandomBot.
        assert_eq!(pick_bot(Some("random"), None).name(), "random_bot");
        assert_eq!(pick_bot(Some("easy"), None).name(), "random_bot");
        assert_eq!(pick_bot(Some("medium"), None).name(), "medium");
        assert_eq!(pick_bot(Some("defensive"), None).name(), "medium");
        assert_eq!(pick_bot(Some("balanced"), None).name(), "medium");
        assert_eq!(pick_bot(Some("MEDIUM"), None).name(), "medium");
        assert_eq!(pick_bot(Some("hard"), None).name(), "hard");
        assert_eq!(pick_bot(Some("ai"), None).name(), "hard");
        assert_eq!(pick_bot(Some("mcts"), None).name(), "hard");
        // "ncts" is sent by the users service (gameRoutes.js) for hard mode.
        assert_eq!(pick_bot(Some("ncts"), None).name(), "hard");
        assert_eq!(pick_bot(Some("NCTS"), None).name(), "hard");
        assert_eq!(pick_bot(Some("aggressive"), None).name(), "hard");
        assert_eq!(pick_bot(Some("AGGRESSIVE"), None).name(), "hard");
        // Unknown values fall through to the difficulty_level, and failing
        // that, to RandomBot.
        assert_eq!(pick_bot(Some("bogus"), None).name(), "random_bot");
        assert_eq!(pick_bot(Some("bogus"), Some("hard")).name(), "hard");
        // `difficulty_level` is used when `strategy` is missing.
        assert_eq!(pick_bot(None, Some("hard")).name(), "hard");
        // `strategy` wins when both are present and both are recognized.
        assert_eq!(pick_bot(Some("hard"), Some("medium")).name(), "hard");

        // The concrete webapp scenario: easy/medium/hard from the UI get
        // mapped by the frontend to random/balanced/aggressive. Regardless of
        // which of the two fields the backend looks at, each difficulty ends
        // up at the matching bot.
        assert_eq!(pick_bot(Some("random"), Some("easy")).name(), "random_bot");
        assert_eq!(pick_bot(Some("balanced"), Some("medium")).name(), "medium");
        assert_eq!(pick_bot(Some("aggressive"), Some("hard")).name(), "hard");

        // Gemini / Generative AI bot aliases.
        // We set a mock key temporarily so the bot is successfully created
        // rather than falling back to RandomBot (which would have the wrong name).
        unsafe { std::env::set_var("GEMINI_API_KEY", "mock_key") };
        assert_eq!(pick_bot(Some("gemini"), None).name(), "gemini");
        assert_eq!(pick_bot(Some("generative"), None).name(), "gemini");
        assert_eq!(pick_bot(Some("generative_ai"), None).name(), "gemini");
        unsafe { std::env::remove_var("GEMINI_API_KEY") };
    }
}
