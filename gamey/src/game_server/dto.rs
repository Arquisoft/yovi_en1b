//! Data Transfer Objects for the game server API.
//!
//! These types define the JSON request and response formats used by the game endpoints.

use crate::{Coordinates, GameStatus, GameY, PlayerId, YEN};
use serde::{Deserialize, Serialize};

// ============================================================================
// Request DTOs
// ============================================================================

/// Request body for creating a new game.
#[derive(Deserialize, Debug)]
pub struct NewGameRequest {
    /// The board size (length of one side of the triangle).
    pub board_size: u32,
}

/// Request body for making a move in an existing game.
#[derive(Deserialize, Debug)]
pub struct MakeMoveRequest {
    /// The current game state in YEN format.
    pub game: YEN,
    /// The move to make.
    pub movement: MoveRequest,
}

/// Describes a move to make — either a placement or an action.
#[derive(Deserialize, Debug)]
pub struct MoveRequest {
    /// The player making the move (0 or 1).
    pub player_id: u32,
    /// Coordinates for a placement move. Required if `action` is `None`.
    pub coords: Option<Coordinates>,
    /// Special action: "swap" or "resign". Required if `coords` is `None`.
    pub action: Option<String>,
}

// ============================================================================
// Response DTOs
// ============================================================================

/// Full game state response returned by game endpoints.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameStateResponse {
    /// The API version used for this request.
    pub api_version: String,
    /// The game state in YEN format (for round-tripping).
    pub yen: YEN,
    /// Current game status (ongoing/finished).
    pub status: GameStatusDto,
    /// Board size (side length).
    pub board_size: u32,
    /// Total number of cells on the board.
    pub total_cells: u32,
    /// Flat indices of cells that are still empty.
    pub available_cells: Vec<u32>,
    /// Detailed info for every cell on the board.
    pub cells: Vec<CellInfo>,
}

/// Simplified game status for the frontend.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameStatusDto {
    /// Whether the game has ended.
    pub is_finished: bool,
    /// The winner's player ID, if the game is finished.
    pub winner: Option<u32>,
    /// The next player's ID, if the game is ongoing.
    pub next_player: Option<u32>,
}

/// Information about a single cell on the board.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CellInfo {
    /// The linear index of this cell.
    pub index: u32,
    /// Barycentric coordinates (x, y, z).
    pub coords: Coordinates,
    /// The player who owns this cell, or `None` if empty.
    pub player: Option<u32>,
    /// Which board sides this cell touches (e.g., ["A", "B"]).
    pub sides: Vec<String>,
}

/// Board geometry information (no game state, just coordinates and neighbors).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BoardInfoResponse {
    /// The API version used for this request.
    pub api_version: String,
    /// Board size (side length).
    pub board_size: u32,
    /// Total number of cells.
    pub total_cells: u32,
    /// Coordinate and neighbor info for every cell.
    pub cells: Vec<CellCoordInfo>,
}

/// Coordinate and neighbor information for a single cell.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CellCoordInfo {
    /// The linear index of this cell.
    pub index: u32,
    /// Barycentric coordinates (x, y, z).
    pub coords: Coordinates,
    /// Which board sides this cell touches.
    pub sides: Vec<String>,
    /// Coordinates of all neighboring cells.
    pub neighbors: Vec<Coordinates>,
}

// ============================================================================
// Partner API (Nacho) DTOs
// ============================================================================

/// Request format for the /play endpoint where the bot makes a move.
#[derive(Deserialize, Debug)]
pub struct PlayRequest {
    /// The current game state (null if first move).
    pub yen_state: Option<YEN>,
    /// The bot strategy/difficulty (e.g., "random").
    pub strategy: Option<String>,
    /// The bot difficulty level.
    pub difficulty_level: Option<String>,
    /// The board size.
    pub board_size: u32,
}

/// Response format for the /play endpoint.
#[derive(Serialize, Deserialize, Debug)]
pub struct PlayResponse {
    /// The coordinates where the bot placed its piece.
    pub coordinates: Coordinates,
    /// The new game state after the bot's move.
    pub yen_state: YEN,
}

/// Request format for the /compute endpoint where a human move is processed.
#[derive(Deserialize, Debug)]
pub struct ComputeRequest {
    /// The current game state before the human's move (null if first move).
    pub yen_state_prev: Option<YEN>,
    /// The coordinates where the human placed their piece.
    pub coordinates: Coordinates,
}

/// Response format for the /compute endpoint.
#[derive(Serialize, Deserialize, Debug)]
pub struct ComputeResponse {
    /// The new game state after the human's move.
    pub yen_state: YEN,
}

// ============================================================================
// Conversion helpers
// ============================================================================

impl GameStatusDto {
    /// Converts a `GameStatus` to its DTO representation.
    pub fn from_game_status(status: &GameStatus) -> Self {
        match status {
            GameStatus::Ongoing { next_player } => GameStatusDto {
                is_finished: false,
                winner: None,
                next_player: Some(next_player.id()),
            },
            GameStatus::Finished { winner } => GameStatusDto {
                is_finished: true,
                winner: Some(winner.id()),
                next_player: None,
            },
        }
    }
}

impl GameStateResponse {
    /// Builds a full `GameStateResponse` from a `GameY` instance.
    pub fn from_game(game: &GameY, api_version: String) -> Self {
        let board_size = game.board_size();
        let total_cells = game.total_cells();

        let yen: YEN = game.into();
        let status = GameStatusDto::from_game_status(game.status());

        let mut cells = Vec::with_capacity(total_cells as usize);
        for idx in 0..total_cells {
            let coords = Coordinates::from_index(idx, board_size);
            let player = game.board().get_cell(&coords).map(|p| p.id());
            let sides: Vec<String> = coords.sides().iter().map(|s| s.to_string()).collect();
            cells.push(CellInfo {
                index: idx,
                coords,
                player,
                sides,
            });
        }

        GameStateResponse {
            api_version,
            yen,
            status,
            board_size,
            total_cells,
            available_cells: game.available_cells().clone(),
            cells,
        }
    }
}

impl BoardInfoResponse {
    /// Builds a `BoardInfoResponse` for a given board size.
    pub fn from_board_size(board_size: u32, api_version: String) -> Self {
        let total_cells = Coordinates::total_cells(board_size);

        let mut cells = Vec::with_capacity(total_cells as usize);
        for idx in 0..total_cells {
            let coords = Coordinates::from_index(idx, board_size);
            let sides: Vec<String> = coords.sides().iter().map(|s| s.to_string()).collect();
            let neighbors = coords.neighbors(board_size);
            cells.push(CellCoordInfo {
                index: idx,
                coords,
                sides,
                neighbors,
            });
        }

        BoardInfoResponse {
            api_version,
            board_size,
            total_cells,
            cells,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_game_status_dto_ongoing() {
        let status = GameStatus::Ongoing {
            next_player: PlayerId::new(0),
        };
        let dto = GameStatusDto::from_game_status(&status);
        assert!(!dto.is_finished);
        assert_eq!(dto.next_player, Some(0));
        assert_eq!(dto.winner, None);
    }

    #[test]
    fn test_game_status_dto_finished() {
        let status = GameStatus::Finished {
            winner: PlayerId::new(1),
        };
        let dto = GameStatusDto::from_game_status(&status);
        assert!(dto.is_finished);
        assert_eq!(dto.winner, Some(1));
        assert_eq!(dto.next_player, None);
    }

    #[test]
    fn test_game_state_response_from_new_game() {
        let game = GameY::new(3);
        let response = GameStateResponse::from_game(&game, "v1".to_string());
        assert_eq!(response.board_size, 3);
        assert_eq!(response.total_cells, 6);
        assert_eq!(response.available_cells.len(), 6);
        assert_eq!(response.cells.len(), 6);
        assert!(!response.status.is_finished);
        assert_eq!(response.status.next_player, Some(0));
    }

    #[test]
    fn test_game_state_response_serialization() {
        let game = GameY::new(3);
        let response = GameStateResponse::from_game(&game, "v1".to_string());
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"board_size\":3"));
        assert!(json.contains("\"total_cells\":6"));
        assert!(json.contains("\"is_finished\":false"));
    }

    #[test]
    fn test_board_info_response() {
        let response = BoardInfoResponse::from_board_size(3, "v1".to_string());
        assert_eq!(response.board_size, 3);
        assert_eq!(response.total_cells, 6);
        assert_eq!(response.cells.len(), 6);
        // The top corner should have 2 neighbors
        let top = &response.cells[0];
        assert_eq!(top.index, 0);
        assert_eq!(top.neighbors.len(), 2);
    }

    #[test]
    fn test_board_info_response_serialization() {
        let response = BoardInfoResponse::from_board_size(2, "v1".to_string());
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"board_size\":2"));
        assert!(json.contains("\"total_cells\":3"));
    }

    #[test]
    fn test_new_game_request_deserialize() {
        let json = r#"{"board_size": 7}"#;
        let req: NewGameRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.board_size, 7);
    }

    #[test]
    fn test_make_move_request_placement_deserialize() {
        let json = r#"{
            "game": {"size": 3, "turn": 0, "players": ["B", "R"], "layout": "./../..."},
            "movement": {"player_id": 0, "coords": {"x": 2, "y": 0, "z": 0}}
        }"#;
        let req: MakeMoveRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.movement.player_id, 0);
        assert!(req.movement.coords.is_some());
        assert!(req.movement.action.is_none());
    }

    #[test]
    fn test_make_move_request_action_deserialize() {
        let json = r#"{
            "game": {"size": 3, "turn": 0, "players": ["B", "R"], "layout": "./../..."},
            "movement": {"player_id": 0, "action": "resign"}
        }"#;
        let req: MakeMoveRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.movement.player_id, 0);
        assert!(req.movement.coords.is_none());
        assert_eq!(req.movement.action, Some("resign".to_string()));
    }
}
