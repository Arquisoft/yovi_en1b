use crate::core::SetIdx;
use crate::core::player_set::PlayerSet;
use crate::{Coordinates, PlayerId};
use std::collections::HashMap;

/// The physical board for the Y game.
///
/// Tracks which cells are occupied, by whom, and whether placing a piece
/// creates a winning chain. Internally uses Union-Find with path compression
/// to efficiently merge connected components — each component remembers
/// which of the 3 sides it touches. A player wins when a single component
/// reaches all three.
#[derive(Debug, Clone)]
pub struct Board {
    board_size: u32,

    /// Maps each occupied cell to its Union-Find set index and the player who owns it.
    board_map: HashMap<Coordinates, (SetIdx, PlayerId)>,

    /// Union-Find sets tracking connected components per player.
    sets: Vec<PlayerSet>,

    /// Flat indices of cells that haven't been claimed yet.
    available_cells: Vec<u32>,
}

impl Board {
    /// Empty board with the given side length.
    ///
    /// ```
    /// use gamey::Board;
    /// let board = Board::new(5);
    /// assert_eq!(board.board_size(), 5);
    /// ```
    pub fn new(board_size: u32) -> Self {
        let total_cells = Coordinates::total_cells(board_size);
        Self {
            board_size,
            board_map: HashMap::new(),
            sets: Vec::new(),
            available_cells: (0..total_cells).collect(),
        }
    }

    /// Side length of the triangle.
    pub fn board_size(&self) -> u32 {
        self.board_size
    }

    /// How many hexes are on this board.
    pub fn total_cells(&self) -> u32 {
        Coordinates::total_cells(self.board_size)
    }

    /// Flat indices of cells that are still empty.
    pub fn available_cells(&self) -> &Vec<u32> {
        &self.available_cells
    }

    /// True if every cell has a piece on it.
    pub fn is_full(&self) -> bool {
        self.available_cells.is_empty()
    }

    /// True if nothing has been placed at these coordinates.
    pub fn is_empty_at(&self, coords: &Coordinates) -> bool {
        !self.board_map.contains_key(coords)
    }

    /// Who owns this cell? `None` if it's empty.
    pub fn get_cell(&self, coords: &Coordinates) -> Option<PlayerId> {
        self.board_map.get(coords).map(|(_, p)| *p)
    }

    /// Raw access to the coordinate → (set index, player) map. Used for rendering/serialization.
    pub(crate) fn board_map(&self) -> &HashMap<Coordinates, (SetIdx, PlayerId)> {
        &self.board_map
    }

    /// Drops a stone on the board. Returns `true` if this move wins the game.
    ///
    /// Does NOT check whether the cell is already taken — that's the caller's job.
    /// Use `is_empty_at()` first.
    pub fn place_piece(&mut self, player: PlayerId, coords: Coordinates) -> bool {
        let cell_idx = coords.to_index(self.board_size);
        self.available_cells.retain(|&x| x != cell_idx);

        let set_idx = self.sets.len();
        let new_set = PlayerSet {
            parent: set_idx,
            touches_side_a: coords.touches_side_a(),
            touches_side_b: coords.touches_side_b(),
            touches_side_c: coords.touches_side_c(),
        };
        self.sets.push(new_set);
        self.board_map.insert(coords, (set_idx, player));

        // Edge case: on a size-1 board, the single cell touches all 3 sides
        let mut won = self.sets[set_idx].is_winning_configuration();

        // Merge with neighbors that belong to the same player
        let neighbors = coords.neighbors(self.board_size);
        for neighbor in neighbors {
            if let Some((neighbor_idx, neighbor_player)) = self.board_map.get(&neighbor)
                && *neighbor_player == player
            {
                let connection_won = self.union(set_idx, *neighbor_idx);
                won = won || connection_won;
            }
        }

        won
    }

    /// Find with path compression.
    fn find(&mut self, i: SetIdx) -> SetIdx {
        if self.sets[i].parent == i {
            i
        } else {
            self.sets[i].parent = self.find(self.sets[i].parent);
            self.sets[i].parent
        }
    }

    /// Union two sets. Returns `true` if the merged set now touches all 3 sides.
    fn union(&mut self, i: SetIdx, j: SetIdx) -> bool {
        let root_i = self.find(i);
        let root_j = self.find(j);

        if root_i != root_j {
            self.sets[root_i].parent = root_j;
            self.sets[root_j].touches_side_a |= self.sets[root_i].touches_side_a;
            self.sets[root_j].touches_side_b |= self.sets[root_i].touches_side_b;
            self.sets[root_j].touches_side_c |= self.sets[root_i].touches_side_c;
        }
        
        self.sets[root_j].touches_side_a
            && self.sets[root_j].touches_side_b
            && self.sets[root_j].touches_side_c
    }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_board() {
        let board = Board::new(5);
        assert_eq!(board.board_size(), 5);
        assert_eq!(board.total_cells(), 15);
        assert_eq!(board.available_cells().len(), 15);
        assert!(!board.is_full());
    }

    #[test]
    fn test_new_board_size_1() {
        let board = Board::new(1);
        assert_eq!(board.total_cells(), 1);
        assert_eq!(board.available_cells().len(), 1);
    }

    #[test]
    fn test_place_piece() {
        let mut board = Board::new(5);
        let coords = Coordinates::new(2, 1, 1);

        assert!(board.is_empty_at(&coords));
        let won = board.place_piece(PlayerId::new(0), coords);

        assert!(!won);
        assert!(!board.is_empty_at(&coords));
        assert_eq!(board.get_cell(&coords), Some(PlayerId::new(0)));
        assert_eq!(board.available_cells().len(), 14);
    }

    #[test]
    fn test_place_piece_decreases_available() {
        let mut board = Board::new(3);
        assert_eq!(board.available_cells().len(), 6);

        board.place_piece(PlayerId::new(0), Coordinates::new(2, 0, 0));
        assert_eq!(board.available_cells().len(), 5);

        board.place_piece(PlayerId::new(1), Coordinates::new(1, 1, 0));
        assert_eq!(board.available_cells().len(), 4);
    }

    #[test]
    fn test_is_full() {
        let mut board = Board::new(2);
        // Place all 3 cells
        board.place_piece(PlayerId::new(0), Coordinates::new(1, 0, 0));
        board.place_piece(PlayerId::new(1), Coordinates::new(0, 0, 1));
        board.place_piece(PlayerId::new(0), Coordinates::new(0, 1, 0));
        assert!(board.is_full());
    }

    #[test]
    fn test_win_on_size_1() {
        let mut board = Board::new(1);
        // The single cell touches all 3 sides
        let won = board.place_piece(PlayerId::new(0), Coordinates::new(0, 0, 0));
        assert!(won);
    }

    #[test]
    fn test_win_on_size_2() {
        let mut board = Board::new(2);
        // Bottom row: (0,0,1) and (0,1,0) — connected, touch A+B and A+C
        let won1 = board.place_piece(PlayerId::new(0), Coordinates::new(0, 0, 1));
        assert!(!won1);
        let won2 = board.place_piece(PlayerId::new(0), Coordinates::new(0, 1, 0));
        assert!(won2);
    }

    #[test]
    fn test_no_win_different_players() {
        let mut board = Board::new(2);
        // Same cells but different players — should not trigger win
        let won1 = board.place_piece(PlayerId::new(0), Coordinates::new(0, 0, 1));
        assert!(!won1);
        let won2 = board.place_piece(PlayerId::new(1), Coordinates::new(0, 1, 0));
        assert!(!won2);
    }

    #[test]
    fn test_win_three_sides_connected() {
        let mut board = Board::new(3);
        // Player 0 connects bottom row: (0,0,2), (0,1,1), (0,2,0)
        board.place_piece(PlayerId::new(0), Coordinates::new(0, 0, 2)); // side A+B
        board.place_piece(PlayerId::new(0), Coordinates::new(0, 1, 1)); // side A
        let won = board.place_piece(PlayerId::new(0), Coordinates::new(0, 2, 0)); // side A+C
        assert!(won);
    }

    #[test]
    fn test_get_cell_empty() {
        let board = Board::new(5);
        assert_eq!(board.get_cell(&Coordinates::new(2, 1, 1)), None);
    }
}
