use crate::core::Board;
use crate::{Coordinates, GameAction, GameYError, Movement, PlayerId, RenderOptions, YEN};
use serde::{Deserialize, Serialize};
use std::fmt::Write;
use std::path::Path;

/// A Result type alias for game operations that may fail with a `GameYError`.
pub type Result<T> = std::result::Result<T, crate::GameYError>;

/// The main game state for a Y game.
///
/// Y is a connection game played on a triangular board where players
/// take turns placing pieces. The goal is to connect all three sides
/// of the triangle with a single chain of connected pieces.
///
/// Game-flow logic (turns, status, history, actions) lives here.
/// Board operations (placement, win detection) are delegated to [`Board`].
#[derive(Debug, Clone)]
pub struct GameY {
    /// The board state (coordinates, Union-Find, available cells).
    board: Board,

    /// Current status of the game (ongoing or finished).
    status: GameStatus,

    /// History of moves made in the game.
    history: Vec<Movement>,
}

/// Represents the state of a single cell on the board.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Cell {
    /// The cell has no piece.
    Empty,
    /// The cell is occupied by a piece belonging to the specified player.
    Occupied(PlayerId),
}

impl GameY {
    /// Creates a new game with the specified board size and number of players.
    pub fn new(board_size: u32) -> Self {
        Self {
            board: Board::new(board_size),
            history: Vec::new(),
            status: GameStatus::Ongoing {
                next_player: PlayerId::new(0),
            },
        }
    }

    /// Returns a reference to the underlying board.
    pub fn board(&self) -> &Board {
        &self.board
    }

    /// Returns the current game status.
    pub fn status(&self) -> &GameStatus {
        &self.status
    }

    /// Returns true if the game has ended (has a winner).
    pub fn check_game_over(&self) -> bool {
        match self.status {
            GameStatus::Ongoing { .. } => false,
            GameStatus::Finished { winner: _ } => true,
        }
    }

    /// Returns the list of available cell indices where pieces can be placed.
    pub fn available_cells(&self) -> &Vec<u32> {
        self.board.available_cells()
    }

    /// Returns the total number of cells on the board.
    pub fn total_cells(&self) -> u32 {
        self.board.total_cells()
    }

    /// Returns the size of the board (length of one side of the triangle).
    pub fn board_size(&self) -> u32 {
        self.board.board_size()
    }

    /// Checks if the movement is made by the correct player.
    ///
    /// Returns an error if it's not the specified player's turn.
    pub fn check_player_turn(&self, movement: &Movement) -> Result<()> {
        if let GameStatus::Ongoing { next_player } = self.status {
            let player = match movement {
                Movement::Placement { player, .. } => *player,
                Movement::Action { player, .. } => *player,
            };
            if player != next_player {
                return Err(GameYError::InvalidPlayerTurn {
                    expected: next_player,
                    found: player,
                });
            }
        }
        Ok(())
    }

    /// Returns the player who should make the next move, or None if the game is over.
    pub fn next_player(&self) -> Option<PlayerId> {
        if let GameStatus::Ongoing { next_player } = self.status {
            Some(next_player)
        } else {
            None
        }
    }

    /// Loads a game state from a YEN format file.
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let filename = path.as_ref().display().to_string();
        let file_content = std::fs::read_to_string(path).map_err(|e| GameYError::IoError {
            message: format!("Failed to read file: {}", filename),
            error: e.to_string(),
        })?;
        let yen: YEN =
            serde_json::from_str(&file_content).map_err(|e| GameYError::SerdeError { error: e })?;
        GameY::try_from(yen)
    }

    /// Saves the game state to a file in YEN format.
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let yen: YEN = self.into();
        let json_content =
            serde_json::to_string_pretty(&yen).map_err(|e| GameYError::SerdeError { error: e })?;
        let filename = path.as_ref().display().to_string();
        std::fs::write(path, json_content).map_err(|e| GameYError::IoError {
            message: format!("Failed to write file: {}", filename),
            error: e.to_string(),
        })?;
        Ok(())
    }

    /// Adds a move to the game.
    pub fn add_move(&mut self, movement: Movement) -> Result<()> {
        match &movement {
            Movement::Placement { player, coords } => {
                self.handle_placement(*player, *coords)?;
            }
            Movement::Action { player, action } => {
                self.handle_action(*player, action);
            }
        }
        self.history.push(movement);
        Ok(())
    }

    /// Orchestrates the placement logic.
    fn handle_placement(&mut self, player: PlayerId, coords: Coordinates) -> Result<()> {
        self.validate_placement(player, coords)?;

        // Delegate to Board — it handles set creation, neighbor merging, win check
        let won = self.board.place_piece(player, coords);

        self.update_status_after_placement(player, won);
        Ok(())
    }

    /// Updates the game status (Finished vs Ongoing).
    fn update_status_after_placement(&mut self, player: PlayerId, won: bool) {
        if self.check_game_over() {
            tracing::info!("Game was already over. Move ignored for status update.");
        } else if won {
            tracing::debug!("Player {} wins the game!", player);
            self.status = GameStatus::Finished { winner: player };
        } else {
            self.status = GameStatus::Ongoing {
                next_player: other_player(player),
            };
        }
    }

    /// Handles non-placement actions (Resign, Swap, etc.)
    fn handle_action(&mut self, player: PlayerId, action: &GameAction) {
        match action {
            GameAction::Resign => {
                self.status = GameStatus::Finished {
                    winner: other_player(player),
                };
            }
            GameAction::Swap => {
                self.status = GameStatus::Ongoing {
                    next_player: other_player(player),
                };
            }
        }
    }

    /// Handles validation logic (Game Over checks and Occupancy).
    fn validate_placement(&self, player: PlayerId, coords: Coordinates) -> Result<()> {
        if self.check_game_over() {
            tracing::info!("Game is already over. Move at {} could be ignored", coords);
        }

        if !self.board.is_empty_at(&coords) {
            return Err(GameYError::Occupied {
                coordinates: coords,
                player,
            });
        }
        Ok(())
    }

    /// Renders the current state of the board as a text string.
    /// If `show_coordinates` is true, the coordinates of each cell will be displayed.
    pub fn render(&self, options: &RenderOptions) -> String {
        let board_size = self.board.board_size();
        let mut result = String::new();
        let coords_size = board_size.to_string().len();
        let _ = writeln!(result, "--- Game of Y (Size {}) ---", board_size);

        let indent_multiplier = self.get_indent_multiplier(options);

        for row in 0..board_size {
            let x = board_size - 1 - row;
            indent(&mut result, x * indent_multiplier);

            for y in 0..=row {
                let z = row - y;
                let coords = Coordinates::new(x, y, z);
                let cell_str = self.format_cell(coords, options, coords_size);
                let _ = write!(result, "{}   ", cell_str);
            }

            result.push('\n');
            if options.show_idx || options.show_3d_coords {
                result.push('\n');
            }
        }
        result
    }

    fn get_indent_multiplier(&self, options: &RenderOptions) -> u32 {
        match (options.show_3d_coords, options.show_idx) {
            (true, true) => 8,
            (true, false) => 4,
            (false, true) => 4,
            (false, false) => 2,
        }
    }

    fn format_cell(&self, coords: Coordinates, options: &RenderOptions, width: usize) -> String {
        let player = self.board.get_cell(&coords);

        // 1. Base symbol
        let mut symbol = match player {
            Some(p) => format!("{}", p),
            None => ".".to_string(),
        };

        // 2. Append metadata (3D Coords / Index)
        if options.show_3d_coords {
            symbol.push_str(&format!(
                "({:0w$},{:0w$},{:0w$})",
                coords.x(),
                coords.y(),
                coords.z(),
                w = width
            ));
        }
        if options.show_idx {
            let idx = coords.to_index(self.board.board_size());
            symbol.push_str(&format!("({}) ", idx));
        }

        // 3. Apply colors
        if options.show_colors {
            symbol = apply_player_color(symbol, player);
        }

        symbol
    }
}

fn indent(str: &mut String, level: u32) {
    str.push_str(&" ".repeat(level as usize));
}

impl TryFrom<YEN> for GameY {
    type Error = GameYError;

    fn try_from(game: YEN) -> Result<Self> {
        let mut ygame = GameY::new(game.size());
        let rows: Vec<&str> = game.layout().split('/').collect();
        if rows.len() as u32 != game.size() {
            return Err(GameYError::InvalidYENLayout {
                expected: game.size(),
                found: rows.len() as u32,
            });
        }
        for (row, row_str) in rows.iter().enumerate() {
            let cells: Vec<char> = row_str.chars().collect();
            if cells.len() as u32 != row as u32 + 1 {
                return Err(GameYError::InvalidYENLayoutLine {
                    expected: row as u32 + 1,
                    found: cells.len() as u32,
                    line: row as u32,
                });
            }
            for (col, cell) in cells.iter().enumerate() {
                let x = col as u32;
                let y = (row as u32) - (col as u32);
                let z = game.size() - 1 - (row as u32);
                let coords = Coordinates::new(x, y, z);
                match cell {
                    'B' => {
                        ygame.add_move(Movement::Placement {
                            player: PlayerId::new(0),
                            coords,
                        })?;
                    }
                    'R' => {
                        ygame.add_move(Movement::Placement {
                            player: PlayerId::new(1),
                            coords,
                        })?;
                    }
                    '.' => {}
                    _ => {
                        return Err(GameYError::InvalidCharInLayout {
                            char: *cell,
                            row,
                            col,
                        });
                    }
                }
            }
        }
        
        if let GameStatus::Ongoing { .. } = ygame.status {
            ygame.status = GameStatus::Ongoing {
                next_player: PlayerId::new(game.turn()),
            };
        }

        Ok(ygame)
    }
}

impl From<&GameY> for YEN {
    fn from(game: &GameY) -> Self {
        let size = game.board.board_size();
        let turn = match game.status {
            GameStatus::Finished { winner } => other_player(winner).id() as u32,
            GameStatus::Ongoing { next_player } => next_player.id(),
        };
        let mut layout = String::new();
        let total_cells = game.board.total_cells();
        let players = vec!['B', 'R'];
        for idx in 0..total_cells {
            let coords = Coordinates::from_index(idx, size);
            let cell_char = match game.board.board_map().get(&coords) {
                Some((_, player)) if player.id() == 0 => 'B',
                Some((_, player)) if player.id() == 1 => 'R',
                _ => '.',
            };
            layout.push(cell_char);
            if coords.y() == 0 && coords.z() > 0 {
                layout.push('/');
            }
        }
        YEN::new(size, turn, players, layout)
    }
}

fn other_player(player: PlayerId) -> PlayerId {
    // Assuming two players with IDs 0 and 1
    if player.id() == 0 {
        PlayerId::new(1)
    } else {
        PlayerId::new(0)
    }
}

fn apply_player_color(symbol: String, player: Option<PlayerId>) -> String {
    match player {
        Some(p) if p.id() == 0 => format!("\x1b[34m{}\x1b[0m", symbol), // Blue
        Some(p) if p.id() == 1 => format!("\x1b[31m{}\x1b[0m", symbol), // Red
        _ => symbol,
    }
}

/// Represents the current status of a game.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GameStatus {
    /// The game is still in progress with the specified player to move next.
    Ongoing { next_player: PlayerId },
    /// The game has ended with a winner.
    Finished { winner: PlayerId },
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_other_player() {
        assert_eq!(other_player(PlayerId::new(0)), PlayerId::new(1));
        assert_eq!(other_player(PlayerId::new(1)), PlayerId::new(0));
    }

    #[test]
    fn test_game_initialization() {
        let game = GameY::new(7);
        assert_eq!(game.board_size(), 7);
        assert_eq!(game.history.len(), 0);
        match game.status {
            GameStatus::Ongoing { next_player } => {
                assert_eq!(next_player, PlayerId::new(0));
            }
            _ => panic!("Game should be ongoing"),
        }
    }

    // Helper function to compare neighbor sets
    fn assert_neighbors_match(actual: Vec<Coordinates>, expected: Vec<Coordinates>) {
        let actual_set: HashSet<_> = actual.into_iter().collect();
        let expected_set: HashSet<_> = expected.into_iter().collect();
        assert_eq!(actual_set, expected_set);
    }

    #[test]
    fn test_interior_cell_has_six_neighbors() {
        let cell = Coordinates::new(2, 1, 1);
        let neighbors = cell.neighbors(5);

        let expected = vec![
            Coordinates::new(1, 2, 1),
            Coordinates::new(1, 1, 2),
            Coordinates::new(3, 0, 1),
            Coordinates::new(2, 0, 2),
            Coordinates::new(3, 1, 0),
            Coordinates::new(2, 2, 0),
        ];

        assert_eq!(neighbors.len(), 6);
        assert_neighbors_match(neighbors, expected);
    }

    #[test]
    fn test_corner_cell_has_two_neighbors() {
        let top_corner = Coordinates::new(4, 0, 0);
        let neighbors = top_corner.neighbors(5);

        let expected = vec![Coordinates::new(3, 1, 0), Coordinates::new(3, 0, 1)];

        assert_eq!(neighbors.len(), 2);
        assert_neighbors_match(neighbors, expected);
    }

    #[test]
    fn test_edge_cell_has_four_neighbors() {
        let edge_cell = Coordinates::new(0, 2, 2);
        let neighbors = edge_cell.neighbors(5);

        let expected = vec![
            Coordinates::new(1, 1, 2),
            Coordinates::new(0, 1, 3),
            Coordinates::new(1, 2, 1),
            Coordinates::new(0, 3, 1),
        ];

        assert_eq!(neighbors.len(), 4);
        assert_neighbors_match(neighbors, expected);
    }

    #[test]
    fn test_winning_condition() {
        let mut game = GameY::new(3);

        let moves = vec![
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 2, 0),
            },
            Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(2, 0, 0),
            },
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 1, 1),
            },
            Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(1, 1, 0),
            },
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 0, 2),
            },
        ];

        for mv in moves {
            game.add_move(mv).unwrap();
        }

        match game.status {
            GameStatus::Finished { winner } => {
                assert_eq!(winner, PlayerId::new(0));
            }
            _ => panic!("Game should be finished with a winner"),
        }
    }

    #[test]
    fn test_yen_conversion() {
        let mut game = GameY::new(3);

        let moves = vec![
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 2, 0),
            },
            Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(2, 0, 0),
            },
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 1, 1),
            },
        ];

        for mv in moves {
            game.add_move(mv).unwrap();
        }

        let yen: YEN = (&game).into();
        let loaded_game = GameY::try_from(yen.clone()).unwrap();

        assert_eq!(game.board_size(), loaded_game.board_size());
        let yen_loaded: YEN = (&loaded_game).into();
        assert_eq!(yen.layout(), yen_loaded.layout());
    }

    // Test loading a YEN representation of a finished game
    #[test]
    fn test_load_yen_end2() {
        let yen_str = r#"{
            "size": 2,
            "turn": 0,
            "players": ["B","R"],
            "layout": "B/BB"
        }"#;
        let yen: YEN = serde_json::from_str(yen_str).unwrap();
        let game = GameY::try_from(yen).unwrap();
        match game.status {
            GameStatus::Finished { winner } => {
                assert_eq!(winner, PlayerId::new(0));
            }
            _ => panic!("Game should be finished with a winner"),
        }
    }

    // Test loading a YEN representation of a finished game
    #[test]
    fn test_load_yen_end3() {
        let yen_str = r#"{
            "size": 3,
            "turn": 0,
            "players": ["B","R"],
            "layout": "B/BB/BBR"
        }"#;
        let yen: YEN = serde_json::from_str(yen_str).unwrap();
        let game = GameY::try_from(yen).unwrap();
        match game.status {
            GameStatus::Finished { winner } => {
                assert_eq!(winner, PlayerId::new(0));
            }
            other => panic!("Game should be finished with a winner. Found: {:?}", other),
        }
    }

    // Test loading a YEN representation of a finished game
    #[test]
    fn test_load_yen_single_full() {
        let yen_str = r#"{
            "size": 1,
            "turn": 0,
            "players": ["B","R"],
            "layout": "B"
        }"#;
        let yen: YEN = serde_json::from_str(yen_str).unwrap();
        let game = GameY::try_from(yen).unwrap();
        match game.status {
            GameStatus::Finished { winner } => {
                assert_eq!(winner, PlayerId::new(0));
            }
            other => panic!("Game should be finished with a winner. Found {:?}", other),
        }
    }

    // Test loading a YEN representation of a finished game
    #[test]
    fn test_load_yen_single_empty() {
        let yen_str = r#"{
            "size": 1,
            "turn": 0,
            "players": ["B","R"],
            "layout": "."
        }"#;
        let yen: YEN = serde_json::from_str(yen_str).unwrap();
        let game = GameY::try_from(yen).unwrap();
        match game.status {
            GameStatus::Ongoing { next_player } => {
                assert_eq!(next_player, PlayerId::new(0));
            }
            _ => panic!("Game should be ongoing"),
        }
    }

    #[test]
    fn test_try_from_turn_logic_bug() {
        let yen = YEN::new(3, 0, vec!['B', 'R'], "R/../B..".to_string()); // 1 B, 1 R. Last is 'B'.
        let game = GameY::try_from(yen).unwrap();
        // `YEN` explicitly says turn is 0 (Blue).
        // Since B and R count is equal (1 each), blue should be next.
        // The last parsed piece was B. Without our fix, GameY would toggle the turn to R (1).
        assert_eq!(game.next_player(), Some(crate::PlayerId::new(0)), "Should be Blue's turn according to YEN!");
    }
}
