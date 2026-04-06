//! Request handlers for the game server API.
//!
//! Each handler corresponds to one REST endpoint and delegates to the core game engine.

use crate::bot_server::error::ErrorResponse;
use crate::game_server::dto::{
    BoardInfoResponse, ComputeRequest, ComputeResponse, GameStateResponse, MakeMoveRequest,
    NewGameRequest, PlayRequest, PlayResponse,
};
use crate::{DefensiveBot, GameAction, GameY, HardBot, Movement, PlayerId, RandomBot, YBot, YEN, check_api_version};
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

    let game = GameY::new(req.board_size);
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
        Some(layout_str) => parse_yen_layout(layout_str)?,
        None => {
            if req.board_size == 0 || req.board_size > 100 {
                return Err(Json(ErrorResponse::error(
                    &format!("Invalid board size: {}. Must be between 1 and 100.", req.board_size),
                    None,
                    None,
                )));
            }
            GameY::new(req.board_size)
        }
    };

    if let crate::GameStatus::Finished { .. } = game.status() {
        return Err(Json(ErrorResponse::error("Game is already finished", None, None)));
    }

    let difficulty = req.difficulty_level.as_deref().unwrap_or("easy");

    let bot: Box<dyn YBot> = match difficulty {
        "hard" => Box::new(HardBot::default()),
        "medium" => Box::new(DefensiveBot),
        _ => Box::new(RandomBot),
    };

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
    Ok(Json(PlayResponse {
        coordinates: coords,
        yen_state: response_yen.layout().to_string(),
        winner: get_winner_string(&game),
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
        Some(layout_str) => parse_yen_layout(layout_str)?,
        None => {
            // Reconstruct board size from first move coordinates
            // In barycentric coordinates: x + y + z = board_size - 1
            let c = req.coordinates;
            let board_size = c.x() + c.y() + c.z() + 1;
            GameY::new(board_size)
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
        // Here we could check if it's the second move and they wanted to swap,
        // but the API specifically provides coordinates, so it's a placement.
        Json(ErrorResponse::error(
            &format!("Invalid move: {}", err),
            None,
            None,
        ))
    })?;

    let response_yen: YEN = (&game).into();
    Ok(Json(ComputeResponse {
        yen_state: response_yen.layout().to_string(),
        winner: get_winner_string(&game),
    }))
}

/// Helper: parses a YEN layout string into a GameY instance.
fn parse_yen_layout(layout_str: String) -> Result<GameY, Json<ErrorResponse>> {
    let size = layout_str.split('/').count() as u32;
    let b_count = layout_str.chars().filter(|c| *c == 'B').count();
    let r_count = layout_str.chars().filter(|c| *c == 'R').count();
    let turn = if b_count > r_count { 1 } else { 0 };
    let yen = YEN::new(size, turn, vec!['B', 'R'], layout_str);
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
        let req = axum::Json(NewGameRequest { board_size: 3 });
        let res = new_game(params, req).await;
        assert!(res.is_ok());
        assert_eq!(res.unwrap().0.board_size, 3);
    }

    #[tokio::test]
    async fn test_new_game_invalid_size() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let req = axum::Json(NewGameRequest { board_size: 0 });
        let res = new_game(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid board size"));
    }

    #[tokio::test]
    async fn test_new_game_too_large() {
        let params = axum::extract::Path(VersionParam { api_version: "v1".to_string() });
        let req = axum::Json(NewGameRequest { board_size: 101 });
        let res = new_game(params, req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid board size"));
    }

    #[tokio::test]
    async fn test_new_game_invalid_version() {
        let params = axum::extract::Path(VersionParam { api_version: "v2".to_string() });
        let req = axum::Json(NewGameRequest { board_size: 3 });
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

    #[tokio::test]
    async fn test_computation_false_win() {
        // Based on visually disconnected pieces that might be falsely triggering a win.
        // Size 5: Red at corners (4,0,0), (1,3,0), (1,0,3)? Wait, let's just make Red disconnected.
        let req = axum::Json(ComputeRequest {
            yen_state_prev: Some("R/B./.B./R..R/.....".to_string()),
            coordinates: Coordinates::new(0, 2, 2), // random move on size 5
        });
        let res = compute(req).await;
        assert!(res.is_ok(), "Should successfully parse state and make move");
        let res_json = res.unwrap().0;
        // In this state, R pieces are NOT connected. Winner should be None!
        assert_eq!(res_json.winner, None, "Red pieces are disconnected, should not win!");
    }

    #[tokio::test]
    async fn test_play_success_with_defensive_strategy() {
        let req = axum::Json(PlayRequest {
            yen_state: Some("R/..".to_string()), // Size 2, R at top corner (0,0,1)
            strategy: Some("defensive".to_string()),
            difficulty_level: Some("medium".to_string()),
            board_size: 2,
        });
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
    async fn test_play_success_with_hard_difficulty() {
        let req = axum::Json(PlayRequest {
            yen_state: Some("./..".to_string()),
            strategy: None,
            difficulty_level: Some("hard".to_string()),
            board_size: 2,
        });
        let res = play(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
    }

    #[tokio::test]
    async fn test_play_success_with_yen() {
        let req = axum::Json(PlayRequest {
            yen_state: Some("./..".to_string()),
            strategy: Some("random".to_string()),
            difficulty_level: None,
            board_size: 2,
        });
        let res = play(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
        assert_eq!(res_json.winner, None);
    }

    #[tokio::test]
    async fn test_play_success_without_yen() {
        let req = axum::Json(PlayRequest {
            yen_state: None,
            strategy: None,
            difficulty_level: None,
            board_size: 2,
        });
        let res = play(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
    }

    #[tokio::test]
    async fn test_play_invalid_board_size() {
        let req = axum::Json(PlayRequest {
            yen_state: None,
            strategy: None,
            difficulty_level: None,
            board_size: 0,
        });
        let res = play(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid board size"));
    }

    #[tokio::test]
    async fn test_play_invalid_yen() {
        let req = axum::Json(PlayRequest {
            yen_state: Some("12".to_string()), // Invalid layout format
            strategy: None,
            difficulty_level: None,
            board_size: 2,
        });
        let res = play(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid YEN"));
    }

    #[tokio::test]
    async fn test_play_already_finished() {
        let req = axum::Json(PlayRequest {
            yen_state: Some("B".to_string()), // Size 1 full board
            strategy: None,
            difficulty_level: None,
            board_size: 1,
        });
        let res = play(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("finished"));
    }

    #[tokio::test]
    async fn test_play_already_finished_at_next_player() {
        // This is a contrived test to hit the branch where `game.status()` is not `Ongoing`
        // after `bot.choose_move` is called. It shouldn't normally happen, but covering it.
        // B/R size 2 = 3 cells. Full board size 2 is 3 cells. 
        let req = axum::Json(PlayRequest {
            yen_state: Some("B/RR".to_string()),
            strategy: None,
            difficulty_level: None,
            board_size: 2,
        });
        let res = play(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("finished"));
    }

    #[tokio::test]
    async fn test_compute_success_with_yen() {
        let req = axum::Json(ComputeRequest {
            yen_state_prev: Some("./..".to_string()),
            coordinates: Coordinates::new(0, 0, 1),
        });
        let res = compute(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
        assert_eq!(res_json.winner, None);
    }

    #[tokio::test]
    async fn test_compute_winner() {
        // Assume player 1 (R) just placed a piece that finished the game (size 1)
        let req = axum::Json(ComputeRequest {
            yen_state_prev: Some(".".to_string()),
            coordinates: Coordinates::new(0, 0, 0),
        });
        let res = compute(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.winner, Some("B".to_string())); // Because turn 0 (B) placed it
    }

    #[tokio::test]
    async fn test_compute_success_without_yen() {
        // Size = 1 + 0 + 0 + 1 = 2
        let req = axum::Json(ComputeRequest {
            yen_state_prev: None,
            coordinates: Coordinates::new(1, 0, 0),
        });
        let res = compute(req).await;
        assert!(res.is_ok());
        let res_json = res.unwrap().0;
        assert_eq!(res_json.yen_state.split('/').count(), 2);
    }

    #[tokio::test]
    async fn test_compute_invalid_yen() {
        let req = axum::Json(ComputeRequest {
            yen_state_prev: Some("12".to_string()), // Invalid layout
            coordinates: Coordinates::new(0, 0, 1),
        });
        let res = compute(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid YEN"));
    }

    #[tokio::test]
    async fn test_compute_already_finished() {
        let req = axum::Json(ComputeRequest {
            yen_state_prev: Some("B".to_string()), // Size 1 full board
            coordinates: Coordinates::new(0, 0, 0), // Already taken
        });
        let res = compute(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("finished"));
    }

    #[tokio::test]
    async fn test_compute_already_finished_at_next_player() {
        let req = axum::Json(ComputeRequest {
            yen_state_prev: Some("B/RR".to_string()), // Full board
            coordinates: Coordinates::new(0, 0, 0),
        });
        let res = compute(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("finished"));
    }

 #[tokio::test]
    async fn test_compute_invalid_move() {
        let req = axum::Json(ComputeRequest {
            yen_state_prev: Some("B/..".to_string()), // Top cell occupied
            coordinates: Coordinates::new(0, 0, 1), // Same cell as the top one
        });
        let res = compute(req).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().0.message.contains("Invalid move"));
    }
}
