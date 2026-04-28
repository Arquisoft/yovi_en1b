use crate::core::Board;
use crate::{
    Coordinates, GameAction, GameVariant, GameYError, Movement, PlayerId, RenderOptions, YEN,
};
use rand::prelude::IndexedRandom;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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

    /// Active game variants.
    variants: Vec<GameVariant>,

    /// Number of moves made by the current player this turn (for DoubleTurn).
    moves_this_turn: u32,
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
            variants: Vec::new(),
            moves_this_turn: 0,
        }
    }

    /// Builder: overrides the starting player on a freshly created game.
    ///
    /// Call this immediately after [`GameY::new`] or [`GameY::new_with_variants`]
    /// **before** any moves are made, e.g. when the caller knows the first move
    /// belongs to Red (`player_id = 1`).
    ///
    /// # Panics
    /// Panics if any moves have already been recorded (i.e. `history` is non-empty).
    pub fn with_starting_player(mut self, player_id: u32) -> Self {
        assert!(
            self.history.is_empty(),
            "with_starting_player must be called before any moves are made"
        );
        self.status = GameStatus::Ongoing {
            next_player: PlayerId::new(player_id),
        };
        self
    }

    /// Returns the number of bombs to place for a given board size in the
    /// Explosions variant.
    ///
    /// - Size 0 : 0 bombs (degenerate; handled gracefully).
    /// - Sizes 1–7 : exactly **1** bomb — small boards stay playable.
    /// - Sizes 8+   : a **random** value in \[1, 4\] inclusive — bigger boards
    ///   get a variable number of hazards for added unpredictability.
    ///
    /// ```
    /// use gamey::GameY;
    /// assert_eq!(GameY::bomb_count_for_size(1), 1);
    /// assert_eq!(GameY::bomb_count_for_size(7), 1);
    /// let c = GameY::bomb_count_for_size(10);
    /// assert!(c >= 1 && c <= 4);
    /// ```
    pub fn bomb_count_for_size(board_size: u32) -> u32 {
        match board_size {
            0 => 0,
            1..=7 => 1,
            // [1u32, 2, 3, 4].choose reuses the IndexedRandom import already
            // in scope and avoids a separate Rng::gen_range import.
            _ => *[1u32, 2, 3, 4].choose(&mut rand::rng()).unwrap(),
        }
    }

    /// Creates a new game with the specified variants.
    ///
    /// **Size restriction changes:**
    /// - `Explosions` now works on **any** board size; the number of bombs is
    ///   determined by [`GameY::bomb_count_for_size`].
    /// - `DoubleTurn` still requires a board of at least 7 cells per side for
    ///   meaningful two-move turns.
    pub fn new_with_variants(board_size: u32, mut variants: Vec<GameVariant>) -> Self {
        // DoubleTurn still requires a reasonably large board; Explosions no
        // longer has a minimum size restriction.
        if board_size < 7 {
            variants.retain(|v| !matches!(v, GameVariant::DoubleTurn));
        }

        let board = if variants.contains(&GameVariant::Explosions) {
            let total_cells = Coordinates::total_cells(board_size);
            let bomb_count = Self::bomb_count_for_size(board_size) as usize;

            let mut rng = rand::rng();
            // Place bombs one-by-one, removing each chosen cell and all its
            // neighbours from the candidate pool after each placement.  This
            // guarantees that no two bombs are adjacent — they can never
            // chain-detonate at game-start and every bomb blast affects only
            // its own neighbourhood.
            let mut candidates: Vec<Coordinates> = (0..total_cells)
                .map(|idx| Coordinates::from_index(idx, board_size))
                .collect();

            let mut bombs: HashSet<Coordinates> = HashSet::new();
            for _ in 0..bomb_count {
                if candidates.is_empty() {
                    break; // board too small to fit more non-adjacent bombs
                }
                // Pick a random cell from the remaining candidates.
                let chosen = *candidates.choose(&mut rng).unwrap();
                bombs.insert(chosen);
                // Exclude the chosen cell and all its neighbours so the next
                // bomb cannot land adjacent to this one.
                let forbidden: HashSet<Coordinates> = std::iter::once(chosen)
                    .chain(chosen.neighbors(board_size))
                    .collect();
                candidates.retain(|c| !forbidden.contains(c));
            }

            Board::new_with_bombs(board_size, bombs)
        } else {
            Board::new(board_size)
        };

        Self {
            board,
            history: Vec::new(),
            status: GameStatus::Ongoing {
                next_player: PlayerId::new(0),
            },
            variants,
            moves_this_turn: 0,
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

    /// Returns the history of moves made in the game.
    pub fn history(&self) -> &Vec<Movement> {
        &self.history
    }

    /// Returns the active game variants.
    pub fn variants(&self) -> &[GameVariant] {
        &self.variants
    }

    /// Returns the bomb positions on the board (may be empty).
    pub fn bomb_positions(&self) -> Vec<Coordinates> {
        self.board.bombs().iter().copied().collect()
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

        // Check whether this cell carries a bomb *before* placing — the board
        // consumes the bomb on placement, so we must snapshot this now.
        let bomb_detonated = self.board.is_bomb(&coords);

        // Delegate to Board — it handles set creation, neighbor merging, win check
        let won = self.board.place_piece(player, coords);

        self.update_status_after_placement(player, won, bomb_detonated);
        Ok(())
    }

    /// Updates the game status (Finished vs Ongoing).
    ///
    /// `bomb_detonated` is true when the placement triggered a bomb explosion.
    /// In DoubleTurn mode a bomb explosion always ends the current player's
    /// turn — the chaotic explosion forfeits the extra move — so we reset the
    /// counter and switch immediately rather than letting the player take a
    /// second placement this turn.
    fn update_status_after_placement(&mut self, player: PlayerId, won: bool, bomb_detonated: bool) {
        if self.check_game_over() {
            tracing::info!("Game was already over. Move ignored for status update.");
        } else if won {
            tracing::debug!("Player {} wins the game!", player);
            self.status = GameStatus::Finished { winner: player };
        } else if self.variants.contains(&GameVariant::DoubleTurn) {
            if bomb_detonated {
                // Bomb explosion always forfeits the remainder of the turn,
                // even when the player still had moves left (DoubleTurn).
                self.moves_this_turn = 0;
                self.status = GameStatus::Ongoing {
                    next_player: other_player(player),
                };
            } else {
                self.moves_this_turn += 1;
                if self.moves_this_turn >= 2 {
                    // Player used both moves, switch to opponent
                    self.moves_this_turn = 0;
                    self.status = GameStatus::Ongoing {
                        next_player: other_player(player),
                    };
                }
                // else: stay on same player for second move
            }
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
            None => {
                if self.variants().contains(&crate::GameVariant::Explosions)
                    && self.board.is_bomb(&coords)
                {
                    "O".to_string()
                } else {
                    ".".to_string()
                }
            }
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
        let mut variants: Vec<GameVariant> = game
            .variants()
            .iter()
            .filter_map(|v| GameVariant::from_name(v))
            .collect();

        // DoubleTurn still requires a large board; Explosions has no minimum.
        if game.size() < 7 {
            variants.retain(|v| !matches!(v, GameVariant::DoubleTurn));
        }

        // Parse bomb positions from the "e" field *and* from any 'e' characters
        // in the layout string. Both sources are unioned — historically bombs
        // were only in the `explosives` field, but we now also emit them as 'e'
        // inside `layout` so the frontend can render them directly from
        // `yen_state` without a separate field (issue #203).
        let mut bombs: HashSet<Coordinates> = match game.explosives() {
            Some(e_str) if !e_str.is_empty() => e_str
                .split(',')
                .filter_map(|s| s.trim().parse::<u32>().ok())
                .map(|idx| Coordinates::from_index(idx, game.size()))
                .collect(),
            _ => HashSet::new(),
        };

        // Also scan the layout string for 'e' (empty cells containing a bomb).
        // We parse row-by-row so we can compute (x, y, z) for each 'e' found.
        for (row, row_str) in game.layout().split('/').enumerate() {
            for (col, cell) in row_str.chars().enumerate() {
                if cell == 'e' {
                    let r = row as u32;
                    let c = col as u32;
                    let x = game.size() - 1 - r;
                    let y = c;
                    let z = (game.size() - 1) - x - y;
                    bombs.insert(Coordinates::new(x, y, z));
                }
            }
        }

        let board = if bombs.is_empty() {
            Board::new(game.size())
        } else {
            Board::new_with_bombs(game.size(), bombs)
        };

        let mut ygame = GameY {
            board,
            history: Vec::new(),
            status: GameStatus::Ongoing {
                next_player: PlayerId::new(0),
            },
            variants,
            moves_this_turn: 0,
        };

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
                let r = row as u32;
                let c = col as u32;
                let x = game.size() - 1 - r;
                let y = c;
                let z = (game.size() - 1) - x - y;
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
                    // '.' is an empty cell; 'e' is an empty cell that also has
                    // a bomb on it — the bomb bookkeeping was done above when
                    // we scanned the layout, so here we just treat 'e' as '.'.
                    '.' | 'e' => {}
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
        let players = vec!['B', 'R'];

        for row in 0..size {
            for col in 0..=row {
                let r = row;
                let c = col;
                let x = size - 1 - r;
                let y = c;
                let z = (size - 1) - x - y;
                let coords = Coordinates::new(x, y, z);

                // Empty + bomb cells are encoded as 'e' so the frontend can
                // render the mine without needing a separate `explosives`
                // field. Occupied bomb cells stay as the owner — the bomb will
                // have been consumed on placement, so an occupied bomb cell is
                // not possible in practice.
                let cell_char = match game.board.board_map().get(&coords) {
                    Some((_, player)) if player.id() == 0 => 'B',
                    Some((_, player)) if player.id() == 1 => 'R',
                    _ if game.board.bombs().contains(&coords) => 'e',
                    _ => '.',
                };
                layout.push(cell_char);
            }
            if row < size - 1 {
                layout.push('/');
            }
        }

        // Serialize variants
        let variant_names: Vec<String> = game
            .variants
            .iter()
            .map(|v| format!("{:?}", v)) // Uses Debug repr: "Explosions", "DoubleTurn"
            .collect();

        let explosives = if game.board.bombs().is_empty() {
            None
        } else {
            let mut indices: Vec<u32> = game
                .board
                .bombs()
                .iter()
                .map(|c| c.to_index(size))
                .collect();
            indices.sort_unstable();
            let indices_str: Vec<String> = indices.into_iter().map(|i| i.to_string()).collect();
            Some(indices_str.join(","))
        };

        YEN::new_with_variants(size, turn, players, layout, variant_names, explosives)
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

    #[test]
    fn test_bomb_count_for_size() {
        // Size 0: edge case
        assert_eq!(GameY::bomb_count_for_size(0), 0);
        // Sizes 1-7: always exactly 1 bomb
        for size in 1..=7u32 {
            assert_eq!(
                GameY::bomb_count_for_size(size),
                1,
                "size {size} should always yield 1 bomb"
            );
        }
        // Sizes >= 8: random value in [1, 4] — run many times to verify range
        for _ in 0..50 {
            let c = GameY::bomb_count_for_size(8);
            assert!(c >= 1 && c <= 4, "size 8 bomb count {c} out of [1,4]");
            let c = GameY::bomb_count_for_size(15);
            assert!(c >= 1 && c <= 4, "size 15 bomb count {c} out of [1,4]");
        }
    }

    #[test]
    fn test_gamey_variants_initialization() {
        // Size < 7: DoubleTurn is filtered out, but Explosions is now allowed.
        let variants = vec![GameVariant::Explosions, GameVariant::DoubleTurn];
        let game1 = GameY::new_with_variants(5, variants.clone());
        assert!(
            game1.variants().contains(&GameVariant::Explosions),
            "Explosions should be active on size-5 boards"
        );
        assert!(
            !game1.variants().contains(&GameVariant::DoubleTurn),
            "DoubleTurn should still be restricted to size >= 7"
        );
        // Size <= 7 → exactly 1 bomb
        assert_eq!(game1.bomb_positions().len(), 1);

        // Size 7: both variants active, 1 bomb (size <= 7 rule)
        let game2 = GameY::new_with_variants(7, variants);
        assert_eq!(game2.variants().len(), 2);
        assert_eq!(game2.bomb_positions().len(), 1);

        // Size >= 8: both active, bomb count in [1,4]
        let game3 = GameY::new_with_variants(9, vec![GameVariant::Explosions]);
        let bc = game3.bomb_positions().len() as u32;
        assert!(bc >= 1 && bc <= 4, "size-9 bomb count {bc} out of [1,4]");
    }

    /// Randomly-placed bombs must never be adjacent to each other.
    ///
    /// Adjacent bombs would chain-detonate on the very first trigger, wiping
    /// out huge sections of the board instantly. The placement algorithm should
    /// exclude each chosen cell's neighbours from the candidate pool after
    /// every placement.
    #[test]
    fn test_bombs_not_adjacent_to_each_other() {
        // Run many times to catch non-deterministic failures.
        for _ in 0..100 {
            // Use a large board so we reliably get multiple bombs.
            let game = GameY::new_with_variants(10, vec![GameVariant::Explosions]);
            let bombs = game.bomb_positions();

            for &bomb in &bombs {
                let neighbours = bomb.neighbors(10);
                for neighbour in &neighbours {
                    assert!(
                        !bombs.contains(neighbour),
                        "bombs {bomb:?} and {neighbour:?} are adjacent — \
                         placement must guarantee no two bombs touch"
                    );
                }
            }
        }
    }

    /// In DoubleTurn mode, detonating a bomb on the *first* of the two moves
    /// must switch the turn to the opponent immediately — the explosion forfeits
    /// the remaining move(s). Previously, `moves_this_turn` was simply
    /// incremented, leaving the same player at the controls for another move.
    #[test]
    fn test_explosion_forfeits_double_turn() {
        use std::collections::HashSet;

        // Build a size-7 game with DoubleTurn only (we place the bomb manually
        // so we know exactly where it is).
        let bomb_coord = Coordinates::new(3, 2, 1); // interior cell, far from edges
        let mut bombs = HashSet::new();
        bombs.insert(bomb_coord);

        let mut game = GameY {
            board: Board::new_with_bombs(7, bombs),
            history: Vec::new(),
            status: GameStatus::Ongoing {
                next_player: PlayerId::new(0),
            },
            variants: vec![GameVariant::DoubleTurn],
            moves_this_turn: 0,
        };

        // Sanity: Player 0 starts, moves_this_turn is 0.
        assert_eq!(game.next_player(), Some(PlayerId::new(0)));

        // Player 0 detonates the bomb on their *first* DoubleTurn move.
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: bomb_coord,
        })
        .unwrap();

        // The explosion must have switched the turn to Player 1, not kept
        // Player 0 for a second move.
        assert_eq!(
            game.next_player(),
            Some(PlayerId::new(1)),
            "bomb explosion must forfeit the remaining DoubleTurn move and switch to Player 1"
        );
    }

    /// Confirm that a normal (non-bomb) move in DoubleTurn still keeps the
    /// same player for their second move.
    #[test]
    fn test_normal_move_does_not_forfeit_double_turn() {
        let mut game = GameY::new_with_variants(7, vec![GameVariant::DoubleTurn]);
        assert_eq!(game.next_player(), Some(PlayerId::new(0)));

        // First normal move — player 0 should keep the turn.
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 6),
        })
        .unwrap();

        assert_eq!(
            game.next_player(),
            Some(PlayerId::new(0)),
            "first normal move in DoubleTurn must not switch the turn"
        );
    }

    #[test]
    fn test_gamey_double_turn_logic() {
        let mut game = GameY::new_with_variants(7, vec![GameVariant::DoubleTurn]);
        
        // Starts with Player 0
        assert_eq!(game.next_player(), Some(PlayerId::new(0)));
        
        // Move 1
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 2),
        }).unwrap();
        
        // Still Player 0's turn!
        assert_eq!(game.next_player(), Some(PlayerId::new(0)));
        
        // Move 2
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(1, 0, 1),
        }).unwrap();
        
        // Now it's Player 1's turn
        assert_eq!(game.next_player(), Some(PlayerId::new(1)));
        
        // Player 1 Move 1
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(0, 1, 1),
        }).unwrap();
        
        // Still Player 1
        assert_eq!(game.next_player(), Some(PlayerId::new(1)));
    }

    #[test]
    fn test_gamey_yen_with_variants_and_bombs() {
        let yen = YEN::new_with_variants(7, 0, vec!['B', 'R'], "./../.../..../...../....../.......".to_string(), vec!["DoubleTurn".to_string(), "Explosions".to_string()], Some("4".to_string()));

        let game = GameY::try_from(yen).unwrap();
        assert_eq!(game.variants().len(), 2);
        assert!(game.variants().contains(&GameVariant::DoubleTurn));
        assert!(game.variants().contains(&GameVariant::Explosions));

        let bombs = game.bomb_positions();
        assert_eq!(bombs.len(), 1);
        assert_eq!(bombs[0], Coordinates::from_index(4, 7));

        // Round trip test
        let yen_back = YEN::from(&game);
        assert_eq!(yen_back.variants().len(), 2);
        assert_eq!(yen_back.explosives(), Some("4"));
    }

    /// Bombs on empty cells must round-trip through the layout string as 'e' —
    /// that's what lets the frontend render the mine without an auxiliary
    /// field. Regression test for issue #203 (part 2: frontend visibility).
    #[test]
    fn test_bomb_emitted_as_e_in_layout() {
        // Build a size-7 game with a bomb at flat index 4 (row 2, col 1 →
        // coords (1, 1, 4)).
        let mut bombs = HashSet::new();
        let bomb_coords = Coordinates::from_index(4, 7);
        bombs.insert(bomb_coords);

        let mut game = GameY {
            board: Board::new_with_bombs(7, bombs),
            history: Vec::new(),
            status: GameStatus::Ongoing {
                next_player: PlayerId::new(0),
            },
            variants: vec![GameVariant::Explosions],
            moves_this_turn: 0,
        };

        // Place a B piece somewhere non-bomb so the layout has both a player
        // piece and an 'e' — exercises both branches of the cell matcher.
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 6),
        })
        .unwrap();

        let yen: YEN = (&game).into();
        let layout = yen.layout();

        // Layout should contain 'e' exactly once (the one bomb) and one 'B'
        // (the piece we placed).
        assert_eq!(layout.chars().filter(|c| *c == 'e').count(), 1, "layout missing 'e' marker: {}", layout);
        assert_eq!(layout.chars().filter(|c| *c == 'B').count(), 1);

        // And round-tripping the YEN back into a GameY must recover the bomb.
        let reloaded = GameY::try_from(yen).unwrap();
        assert_eq!(reloaded.bomb_positions().len(), 1);
        assert!(reloaded.bomb_positions().contains(&bomb_coords));
    }

    /// Parsing a layout that carries 'e' characters (and no explosives field)
    /// must still populate the bombs set. This is the inbound side of the
    /// round-trip: the users service stores `yen_state` (just the layout) and
    /// sends it back without the `explosives` field, so layout alone must be
    /// enough.
    #[test]
    fn test_bomb_parsed_from_e_in_layout_only() {
        let yen = YEN::new_with_variants(
            3,
            0,
            vec!['B', 'R'],
            "./../e..".to_string(),
            vec!["Explosions".to_string()],
            None,
        );
        let game = GameY::try_from(yen).unwrap();
        let bombs = game.bomb_positions();
        assert_eq!(bombs.len(), 1);
        assert!(bombs.contains(&Coordinates::new(0, 0, 2)));
    }

    /// When *both* the `explosives` field and inline 'e' markers are present
    /// they should union (duplicates dedup since bombs is a HashSet).
    #[test]
    fn test_bomb_layout_and_explosives_union() {
        let yen = YEN::new_with_variants(
            3,
            0,
            vec!['B', 'R'],
            "./.e/...".to_string(),
            vec!["Explosions".to_string()],
            Some("0".to_string()),
        );
        let game = GameY::try_from(yen).unwrap();
        let bombs = game.bomb_positions();
        assert_eq!(bombs.len(), 2, "should union layout bomb + explosives bomb");
    }

    // ========================================================================
    // Tests for with_starting_player
    // ========================================================================

    #[test]
    fn test_with_starting_player_sets_red() {
        let game = GameY::new(5).with_starting_player(1);
        assert_eq!(game.next_player(), Some(PlayerId::new(1)));
    }

    #[test]
    fn test_with_starting_player_identity_blue() {
        let game = GameY::new(5).with_starting_player(0);
        assert_eq!(game.next_player(), Some(PlayerId::new(0)));
    }

    #[test]
    fn test_with_starting_player_with_variants() {
        let game = GameY::new_with_variants(7, vec![GameVariant::DoubleTurn])
            .with_starting_player(1);
        assert_eq!(game.next_player(), Some(PlayerId::new(1)));
        assert!(game.variants().contains(&GameVariant::DoubleTurn));
    }

    #[test]
    #[should_panic(expected = "with_starting_player must be called before any moves are made")]
    fn test_with_starting_player_panics_after_move() {
        let mut game = GameY::new(5);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 4),
        }).unwrap();
        // This should panic because a move has been made
        let _ = game.with_starting_player(1);
    }
}
