use crate::core::SetIdx;
use crate::core::player_set::PlayerSet;
use crate::{Coordinates, PlayerId};
use std::collections::{HashMap, HashSet};

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

    /// Coordinates of bomb cells (Explosions variant).
    bombs: HashSet<Coordinates>,
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
            bombs: HashSet::new(),
        }
    }

    /// Creates a board with pre-placed bombs.
    pub fn new_with_bombs(board_size: u32, bombs: HashSet<Coordinates>) -> Self {
        let total_cells = Coordinates::total_cells(board_size);
        Self {
            board_size,
            board_map: HashMap::new(),
            sets: Vec::new(),
            available_cells: (0..total_cells).collect(),
            bombs,
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

    /// Returns the set of bomb positions on the board.
    pub fn bombs(&self) -> &HashSet<Coordinates> {
        &self.bombs
    }

    /// Returns true if the given coordinate is a bomb.
    pub fn is_bomb(&self, coords: &Coordinates) -> bool {
        self.bombs.contains(coords)
    }

    /// Drops a stone on the board. Returns `true` if this move wins the game.
    ///
    /// Does NOT check whether the cell is already taken — that's the caller's job.
    /// Use `is_empty_at()` first.
    ///
    /// If the cell is a bomb, the bomb detonates after placement: all occupied
    /// neighbour cells are cleared, the bomb is consumed, and any adjacent
    /// bombs chain-detonate via BFS — so a cluster of adjacent bombs all
    /// explode together when the first one is triggered.
    pub fn place_piece(&mut self, player: PlayerId, coords: Coordinates) -> bool {
        let is_bomb = self.bombs.remove(&coords);

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

        // ── Bomb path ──────────────────────────────────────────────────────────
        // BFS chain detonation: start from the triggered cell and propagate to
        // every adjacent bomb, consuming them all before rebuilding.
        //
        // `visited` tracks every explosion centre we have already queued so we
        // never process the same cell twice — important both for termination
        // and to avoid double-removing entries from `board_map`.
        if is_bomb {
            let mut pending: Vec<Coordinates> = vec![coords];
            let mut visited: HashSet<Coordinates> = HashSet::new();
            visited.insert(coords);

            while let Some(explosion) = pending.pop() {
                for neighbour in explosion.neighbors(self.board_size) {
                    // Clear any piece sitting on the neighbouring cell.
                    // CRITICAL: we must NOT remove the stone we just placed (`coords`),
                    // even if it is a neighbor of another detonating bomb in the chain.
                    // Doing so would cause us to lose the winner-tracking set_idx
                    // and panic at line 176.
                    if neighbour != coords && self.board_map.remove(&neighbour).is_some() {
                        let idx = neighbour.to_index(self.board_size);
                        if !self.available_cells.contains(&idx) {
                            self.available_cells.push(idx);
                        }
                    }
                    // Chain-react: queue unvisited adjacent bombs.
                    // `bombs.remove` returns true only if the value was present,
                    // so we consume the bomb atomically with the visited-check.
                    if !visited.contains(&neighbour) && self.bombs.remove(&neighbour) {
                        visited.insert(neighbour);
                        pending.push(neighbour);
                    }
                }
            }

            // Rebuild Union-Find from scratch so that detonated cells don't
            // leave orphaned sets whose `touches_side_*` flags could later be
            // merged into a live component and trigger a phantom win.
            self.rebuild_union_find();

            // ── Critical: use find() to reach the canonical root ──────────────
            // After rebuild, the set index stored in `board_map` for `coords`
            // may be a *non-root* node — if it was merged into a neighbour's
            // component during the rebuild loop, its parent was updated but the
            // stored index was not.  Calling `find` with path-compression gives
            // us the root whose `touches_side_*` flags reflect the *entire*
            // connected component, not just the single cell.
            // Without this fix a winning bomb move would return `false`, the
            // game would continue, and the turn would switch to the wrong player.
            let raw_idx = self.board_map[&coords].0;
            let root = self.find(raw_idx);
            return self.sets[root].is_winning_configuration();
        }

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

    /// Rebuilds `sets` and `board_map` from the cells that are currently
    /// occupied. Used after a bomb detonation to discard the stale set
    /// metadata of the pieces that were cleared — without this, the
    /// `touches_side_*` flags of an orphaned set could be folded into a
    /// living component and wrongly signal a win.
    fn rebuild_union_find(&mut self) {
        // Snapshot the surviving pieces and reset the union-find state.
        let mut survivors: Vec<(Coordinates, PlayerId)> = self
            .board_map
            .iter()
            .map(|(coords, (_, player))| (*coords, *player))
            .collect();
        // Deterministic ordering is nice for tests and reasoning, and it
        // doesn't change correctness.
        survivors.sort_by_key(|(c, _)| c.to_index(self.board_size));

        self.sets.clear();
        self.board_map.clear();

        for (coords, player) in survivors {
            let set_idx = self.sets.len();
            let new_set = PlayerSet {
                parent: set_idx,
                touches_side_a: coords.touches_side_a(),
                touches_side_b: coords.touches_side_b(),
                touches_side_c: coords.touches_side_c(),
            };
            self.sets.push(new_set);
            self.board_map.insert(coords, (set_idx, player));

            // Merge with already-re-inserted neighbors of the same player.
            // Because we're iterating in order, each neighbor we find here has
            // already been assigned a fresh set index.
            let neighbors = coords.neighbors(self.board_size);
            for neighbor in neighbors {
                if let Some((neighbor_set, neighbor_player)) = self.board_map.get(&neighbor)
                    && *neighbor_player == player
                    && neighbor != coords
                {
                    self.union(set_idx, *neighbor_set);
                }
            }
        }
    }
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

    #[test]
    fn test_bombs_creation_and_check() {
        let mut bombs = std::collections::HashSet::new();
        let bomb_coord = Coordinates::new(1, 1, 0);
        bombs.insert(bomb_coord);
        
        let board = Board::new_with_bombs(3, bombs);
        assert!(board.is_bomb(&bomb_coord));
        assert!(!board.is_bomb(&Coordinates::new(0, 0, 2)));
        assert_eq!(board.bombs().len(), 1);
    }

    /// After a bomb detonates the union-find must be free of ghost sets:
    /// the `touches_side_*` flags that belonged to cleared cells should not
    /// leak into newly-formed components and trigger a phantom win. We
    /// exercise the rebuild directly and verify it produces exactly one set
    /// per surviving cell.
    #[test]
    fn test_explosion_rebuilds_union_find_without_orphans() {
        use std::collections::HashSet;
        // Size-5 board with a bomb in the middle. Around it we cram a bunch
        // of P0 pieces; the detonation will wipe most of them out.
        let bomb_coord = Coordinates::new(2, 1, 1);
        let mut bombs = HashSet::new();
        bombs.insert(bomb_coord);
        let mut board = Board::new_with_bombs(5, bombs);

        // Place a scatter of P0 pieces: some adjacent to the bomb, some not.
        // All-same-player so the board ends up in a single union-find
        // component of size 4 before the bomb.
        board.place_piece(PlayerId::new(0), Coordinates::new(1, 1, 2)); // adj
        board.place_piece(PlayerId::new(0), Coordinates::new(2, 0, 2)); // adj
        board.place_piece(PlayerId::new(0), Coordinates::new(1, 2, 1)); // adj
        board.place_piece(PlayerId::new(0), Coordinates::new(0, 4, 0)); // NOT adj

        // Before detonation we have 4 P0 pieces + 0 other → at least 4 sets
        // in `sets`. After P1 detonates the bomb, three of those P0 pieces
        // are cleared; only (0, 4, 0) and the bomb-placed P1 piece survive.
        let pre_sets = board.sets.len();
        assert!(pre_sets >= 4);

        // Detonate.
        let won = board.place_piece(PlayerId::new(1), bomb_coord);
        assert!(!won);

        // After rebuild, there should be exactly one set per surviving cell.
        assert_eq!(
            board.board_map.len(),
            2,
            "expected 2 surviving cells (P1 on bomb + far P0)"
        );
        assert_eq!(
            board.sets.len(),
            2,
            "rebuild should discard the orphaned sets from cleared cells"
        );

        // And the surviving P0 piece's set must reflect only its own
        // side-touches — in particular, it must NOT inherit the side-touches
        // of the wiped-out (1, 1, 2) / (2, 0, 2) / (1, 2, 1) pieces.
        let (p0_set_idx, _) = board.board_map[&Coordinates::new(0, 4, 0)];
        let p0_set = &board.sets[p0_set_idx];
        assert!(p0_set.touches_side_a, "(0,4,0) touches A (x=0)");
        assert!(!p0_set.touches_side_b, "(0,4,0) does not touch B (y != 0)");
        assert!(p0_set.touches_side_c, "(0,4,0) touches C (z=0)");
    }

    #[test]
    fn test_explosion_clears_neighbors() {
        let mut bombs = std::collections::HashSet::new();
        let bomb_coord = Coordinates::new(1, 1, 0); // center-ish of size 3 board
        bombs.insert(bomb_coord);

        let mut board = Board::new_with_bombs(3, bombs);

        // Place some pieces around the bomb
        let neighbor_1 = Coordinates::new(1, 0, 1);
        let neighbor_2 = Coordinates::new(2, 0, 0);

        board.place_piece(PlayerId::new(0), neighbor_1);
        board.place_piece(PlayerId::new(1), neighbor_2);

        // Both pieces should exist
        assert_eq!(board.get_cell(&neighbor_1), Some(PlayerId::new(0)));
        assert_eq!(board.get_cell(&neighbor_2), Some(PlayerId::new(1)));

        // Place piece on bomb!
        let won = board.place_piece(PlayerId::new(0), bomb_coord);
        assert!(!won);

        // The piece placed on the bomb stays
        assert_eq!(board.get_cell(&bomb_coord), Some(PlayerId::new(0)));

        // The neighbors are cleared
        assert_eq!(board.get_cell(&neighbor_1), None);
        assert_eq!(board.get_cell(&neighbor_2), None);

        // The bomb is consumed
        assert!(!board.is_bomb(&bomb_coord));
        assert_eq!(board.bombs().len(), 0);
    }

    /// Two adjacent bombs: triggering the first must chain-detonate the second.
    /// Both bombs must be consumed and the combined blast radius must clear all
    /// occupied neighbours of both explosion centres.
    #[test]
    fn test_chain_detonation_adjacent_bombs() {
        use std::collections::HashSet;

        // Size-5 board. Place two adjacent bombs.
        //   bomb_a = (2,1,1)  (interior — 6 neighbours)
        //   bomb_b = (1,2,1)  (adjacent to bomb_a)
        let bomb_a = Coordinates::new(2, 1, 1);
        let bomb_b = Coordinates::new(1, 2, 1);
        assert!(
            bomb_a.neighbors(5).contains(&bomb_b),
            "test assumption: bomb_b must be a neighbour of bomb_a"
        );
        let mut bombs: HashSet<Coordinates> = HashSet::new();
        bombs.insert(bomb_a);
        bombs.insert(bomb_b);
        let mut board = Board::new_with_bombs(5, bombs);

        // Scatter some pieces near both bombs.
        let piece_near_a = Coordinates::new(2, 0, 2); // neighbour of bomb_a only
        let piece_near_b = Coordinates::new(0, 3, 1); // neighbour of bomb_b only
        board.place_piece(PlayerId::new(0), piece_near_a);
        board.place_piece(PlayerId::new(1), piece_near_b);
        // One far piece that should survive the blast.
        let far_piece = Coordinates::new(0, 0, 4);
        board.place_piece(PlayerId::new(0), far_piece);

        // Trigger bomb_a.
        let won = board.place_piece(PlayerId::new(1), bomb_a);
        assert!(!won);

        // Both bombs consumed.
        assert!(!board.is_bomb(&bomb_a), "bomb_a must be consumed");
        assert!(!board.is_bomb(&bomb_b), "bomb_b must chain-detonate and be consumed");
        assert_eq!(board.bombs().len(), 0, "no bombs should remain");

        // The triggering piece survives.
        assert_eq!(board.get_cell(&bomb_a), Some(PlayerId::new(1)));

        // Neighbours of the blast radii are cleared.
        assert_eq!(board.get_cell(&piece_near_a), None, "piece near bomb_a must be cleared");
        assert_eq!(board.get_cell(&piece_near_b), None, "piece near bomb_b must be cleared");

        // The far piece is untouched.
        assert_eq!(board.get_cell(&far_piece), Some(PlayerId::new(0)));
    }
}
