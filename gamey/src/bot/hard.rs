//! A hard-difficulty bot using Monte Carlo Tree Search (MCTS).
//!
//! This module provides [`HardBot`], a bot that uses MCTS with UCB1
//! to choose strong moves. It simulates many random games from each
//! candidate position and picks the move that leads to the most wins.

use crate::{Coordinates, GameY, PlayerId, YBot};
use rand::prelude::IndexedRandom;
use std::collections::HashMap;

/// Number of MCTS simulations to run per move decision.
const DEFAULT_SIMULATIONS: u32 = 800;

/// Exploration constant for UCB1 formula.
const EXPLORATION_C: f64 = 1.414;

/// A bot that uses Monte Carlo Tree Search to choose strong moves.
///
/// The HardBot evaluates candidate moves by running many random game
/// simulations (playouts) from each position. It uses UCB1 to balance
/// exploring new moves vs exploiting known good ones.
pub struct HardBot {
    simulations: u32,
}

impl HardBot {
    /// Creates a new HardBot with custom simulation count.
    #[allow(dead_code)]
    pub fn with_simulations(simulations: u32) -> Self {
        Self { simulations }
    }
}

impl Default for HardBot {
    fn default() -> Self {
        Self {
            simulations: DEFAULT_SIMULATIONS,
        }
    }
}

impl YBot for HardBot {
    fn name(&self) -> &str {
        "hard"
    }

    fn choose_move(&self, game: &GameY) -> Option<Coordinates> {
        let available = game.available_cells();
        if available.is_empty() {
            return None;
        }

        let board_size = game.board_size();

        // If only one move available, take it
        if available.len() == 1 {
            return Some(Coordinates::from_index(available[0], board_size));
        }

        // Determine which player the bot is (the next player)
        let bot_player = match game.status() {
            crate::GameStatus::Ongoing { next_player } => *next_player,
            _ => return None,
        };

        let opponent = other_player(bot_player);

        // Tactical pre-check: scan for immediate wins and blocks
        let root_board = SimBoard::from_game(game);

        // 1. Check if bot can win immediately
        for &cell_idx in available {
            let mut board = root_board.clone_for_sim();
            if board.place(cell_idx, bot_player) {
                return Some(Coordinates::from_index(cell_idx, board_size));
            }
        }

        // 2. Check if opponent can win immediately → block
        for &cell_idx in available {
            let mut board = root_board.clone_for_sim();
            if board.place(cell_idx, opponent) {
                return Some(Coordinates::from_index(cell_idx, board_size));
            }
        }

        // 3. Run MCTS for positional evaluation
        let mut tree = MctsTree::new_with_board(root_board, bot_player);
        for _ in 0..self.simulations {
            tree.run_one_simulation();
        }

        tree.best_move()
    }
}

// =============================================================================
// MCTS Tree
// =============================================================================

/// A node in the MCTS tree.
struct MctsNode {
    /// The move that led to this node (None for root).
    move_coords: Option<Coordinates>,
    /// Number of times this node has been visited.
    visits: u32,
    /// Number of wins from the bot's perspective.
    wins: f64,
    /// Child node indices.
    children: Vec<usize>,
    /// Parent node index.
    #[allow(dead_code)]
    parent: Option<usize>,
    /// Whether this node has been expanded.
    expanded: bool,
    /// Depth in the tree (0 = root, 1 = bot's moves, 2 = opponent's moves, etc.)
    depth: u32,
}

/// Lightweight board state for fast simulation.
/// Tracks occupied cells and which sides each player's connected components touch.
struct SimBoard {
    board_size: u32,
    /// Maps cell index to the player who occupies it.
    cells: HashMap<u32, PlayerId>,
    /// Available cell indices.
    available: Vec<u32>,
    /// Union-Find: parent[set_idx] = parent set index.
    uf_parent: Vec<usize>,
    /// Union-Find: which sides each set touches (bitfield: A=1, B=2, C=4).
    uf_sides: Vec<u8>,
    /// Maps cell index to its Union-Find set index.
    cell_to_set: HashMap<u32, usize>,
}

impl SimBoard {
    /// Create a SimBoard from the current game state.
    fn from_game(game: &GameY) -> Self {
        let board_size = game.board_size();
        let total_cells = game.total_cells();
        let mut cells = HashMap::new();
        let mut available = Vec::new();
        let mut uf_parent = Vec::new();
        let mut uf_sides: Vec<u8> = Vec::new();
        let mut cell_to_set = HashMap::new();

        for idx in 0..total_cells {
            let coords = Coordinates::from_index(idx, board_size);
            match game.board().get_cell(&coords) {
                Some(player) => {
                    cells.insert(idx, player);
                    let set_idx = uf_parent.len();
                    uf_parent.push(set_idx);
                    uf_sides.push(sides_bits(&coords));
                    cell_to_set.insert(idx, set_idx);
                }
                None => {
                    available.push(idx);
                }
            }
        }

        let mut board = SimBoard {
            board_size,
            cells,
            available,
            uf_parent,
            uf_sides,
            cell_to_set,
        };

        // Rebuild union-find by merging neighboring cells of the same player
        for idx in 0..total_cells {
            if let Some(player) = board.cells.get(&idx).copied() {
                let coords = Coordinates::from_index(idx, board_size);
                let neighbors = coords.neighbors(board_size);
                for n in neighbors {
                    let n_idx = n.to_index(board_size);
                    if let Some(n_player) = board.cells.get(&n_idx).copied() {
                        if n_player == player {
                            board.union(idx, n_idx);
                        }
                    }
                }
            }
        }

        board
    }

    /// Clone the board state for simulation.
    fn clone_for_sim(&self) -> Self {
        SimBoard {
            board_size: self.board_size,
            cells: self.cells.clone(),
            available: self.available.clone(),
            uf_parent: self.uf_parent.clone(),
            uf_sides: self.uf_sides.clone(),
            cell_to_set: self.cell_to_set.clone(),
        }
    }

    /// Place a piece and return true if the player wins.
    fn place(&mut self, cell_idx: u32, player: PlayerId) -> bool {
        self.cells.insert(cell_idx, player);
        self.available.retain(|&x| x != cell_idx);

        let coords = Coordinates::from_index(cell_idx, self.board_size);
        let set_idx = self.uf_parent.len();
        self.uf_parent.push(set_idx);
        self.uf_sides.push(sides_bits(&coords));
        self.cell_to_set.insert(cell_idx, set_idx);

        // Check if single cell wins (e.g., board size 1)
        if self.uf_sides[set_idx] == 7 {
            return true;
        }

        // Merge with neighboring cells of the same player
        let neighbors = coords.neighbors(self.board_size);
        let mut won = false;
        for n in neighbors {
            let n_idx = n.to_index(self.board_size);
            if let Some(n_player) = self.cells.get(&n_idx).copied() {
                if n_player == player {
                    if self.union(cell_idx, n_idx) {
                        won = true;
                    }
                }
            }
        }
        won
    }

    /// Find root with path compression.
    fn find(&mut self, idx: u32) -> usize {
        let set_idx = self.cell_to_set[&idx];
        self.find_set(set_idx)
    }

    fn find_set(&mut self, i: usize) -> usize {
        if self.uf_parent[i] == i {
            i
        } else {
            self.uf_parent[i] = self.find_set(self.uf_parent[i]);
            self.uf_parent[i]
        }
    }

    /// Union two cells' sets. Returns true if the merged set touches all 3 sides.
    fn union(&mut self, a_idx: u32, b_idx: u32) -> bool {
        let root_a = self.find(a_idx);
        let root_b = self.find(b_idx);

        if root_a != root_b {
            self.uf_parent[root_a] = root_b;
            self.uf_sides[root_b] |= self.uf_sides[root_a];
            return self.uf_sides[root_b] == 7; // All 3 sides: A=1, B=2, C=4
        }
        false
    }
}

/// Compute side bits for a coordinate: A=1, B=2, C=4.
fn sides_bits(coords: &Coordinates) -> u8 {
    let mut bits: u8 = 0;
    if coords.touches_side_a() {
        bits |= 1;
    }
    if coords.touches_side_b() {
        bits |= 2;
    }
    if coords.touches_side_c() {
        bits |= 4;
    }
    bits
}

fn other_player(p: PlayerId) -> PlayerId {
    if p.id() == 0 {
        PlayerId::new(1)
    } else {
        PlayerId::new(0)
    }
}

/// The MCTS tree structure.
struct MctsTree {
    nodes: Vec<MctsNode>,
    root_board: SimBoard,
    bot_player: PlayerId,
    root_next_player: PlayerId,
}

impl MctsTree {
    fn new_with_board(root_board: SimBoard, bot_player: PlayerId) -> Self {
        let root_next_player = bot_player; // Bot is always next at root

        let root = MctsNode {
            move_coords: None,
            visits: 0,
            wins: 0.0,
            children: Vec::new(),
            parent: None,
            expanded: false,
            depth: 0,
        };

        MctsTree {
            nodes: vec![root],
            root_board,
            bot_player,
            root_next_player,
        }
    }


    fn run_one_simulation(&mut self) {
        let mut board = self.root_board.clone_for_sim();
        let mut current_player = self.root_next_player;

        // 1. Selection: walk down the tree using UCB1
        let mut node_idx = 0;
        let mut path = vec![0usize];

        loop {
            if !self.nodes[node_idx].expanded {
                break;
            }
            if self.nodes[node_idx].children.is_empty() {
                break; // Terminal node
            }

            let child_idx = self.select_child(node_idx);
            node_idx = child_idx;
            path.push(node_idx);

            // Apply the move
            let coords = self.nodes[node_idx].move_coords.unwrap();
            let cell_idx = coords.to_index(board.board_size);
            let won = board.place(cell_idx, current_player);
            if won {
                // Game over — backpropagate
                let winner = current_player;
                self.backpropagate(&path, winner);
                return;
            }
            current_player = other_player(current_player);
        }

        // 2. Expansion: add children for all available moves
        if !self.nodes[node_idx].expanded && !board.available.is_empty() {
            let available_moves: Vec<u32> = board.available.clone();
            let mut child_indices = Vec::with_capacity(available_moves.len());

            let parent_depth = self.nodes[node_idx].depth;

            for &cell_idx in &available_moves {
                let coords = Coordinates::from_index(cell_idx, board.board_size);
                let child = MctsNode {
                    move_coords: Some(coords),
                    visits: 0,
                    wins: 0.0,
                    children: Vec::new(),
                    parent: Some(node_idx),
                    expanded: false,
                    depth: parent_depth + 1,
                };
                let idx = self.nodes.len();
                self.nodes.push(child);
                child_indices.push(idx);
            }
            self.nodes[node_idx].children = child_indices;
            self.nodes[node_idx].expanded = true;

            // Pick one child to simulate from
            let child_idx = *self.nodes[node_idx]
                .children
                .choose(&mut rand::rng())
                .unwrap();
            node_idx = child_idx;
            path.push(node_idx);

            let coords = self.nodes[node_idx].move_coords.unwrap();
            let cell_idx = coords.to_index(board.board_size);
            let won = board.place(cell_idx, current_player);
            if won {
                let winner = current_player;
                self.backpropagate(&path, winner);
                return;
            }
            current_player = other_player(current_player);
        }

        // 3. Simulation: random playout
        let winner = self.random_playout(&mut board, current_player);

        // 4. Backpropagation
        if let Some(winner) = winner {
            self.backpropagate(&path, winner);
        }
    }

    /// Select child with highest UCB1 score.
    /// At even depths (bot's turn), maximize bot win rate.
    /// At odd depths (opponent's turn), minimize bot win rate (maximize opponent's).
    fn select_child(&self, node_idx: usize) -> usize {
        let parent_visits = self.nodes[node_idx].visits as f64;
        let ln_parent = parent_visits.ln();
        let parent_depth = self.nodes[node_idx].depth;
        // At even depth, the bot is choosing → maximize bot wins
        // At odd depth, the opponent is choosing → minimize bot wins
        let is_bot_turn = parent_depth % 2 == 0;

        let mut best_score = f64::NEG_INFINITY;
        let mut best_child = self.nodes[node_idx].children[0];

        for &child_idx in &self.nodes[node_idx].children {
            let child = &self.nodes[child_idx];
            if child.visits == 0 {
                // Unvisited child gets infinite priority
                return child_idx;
            }

            let bot_win_rate = child.wins / child.visits as f64;
            let exploitation = if is_bot_turn {
                bot_win_rate
            } else {
                1.0 - bot_win_rate // Opponent wants to minimize bot wins
            };
            let exploration = EXPLORATION_C * (ln_parent / child.visits as f64).sqrt();
            let score = exploitation + exploration;

            if score > best_score {
                best_score = score;
                best_child = child_idx;
            }
        }

        best_child
    }

    /// Random playout from current board state. Returns the winner, or None if draw.
    fn random_playout(&self, board: &mut SimBoard, mut current_player: PlayerId) -> Option<PlayerId> {
        let mut rng = rand::rng();

        while !board.available.is_empty() {
            let &cell_idx = board.available.choose(&mut rng).unwrap();
            let won = board.place(cell_idx, current_player);
            if won {
                return Some(current_player);
            }
            current_player = other_player(current_player);
        }

        None // Draw (shouldn't normally happen in Y, but handle gracefully)
    }

    /// Backpropagate results up the path.
    fn backpropagate(&mut self, path: &[usize], winner: PlayerId) {
        for &node_idx in path {
            self.nodes[node_idx].visits += 1;
            if winner == self.bot_player {
                self.nodes[node_idx].wins += 1.0;
            }
        }
    }

    /// Return the best move (most visited child of root).
    fn best_move(&self) -> Option<Coordinates> {
        let root = &self.nodes[0];
        if root.children.is_empty() {
            return None;
        }

        let mut best_visits = 0;
        let mut best_move = None;

        for &child_idx in &root.children {
            let child = &self.nodes[child_idx];
            if child.visits > best_visits {
                best_visits = child.visits;
                best_move = child.move_coords;
            }
        }

        best_move
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Movement, PlayerId};

    #[test]
    fn test_hard_bot_name() {
        let bot = HardBot::default();
        assert_eq!(bot.name(), "hard");
    }

    #[test]
    fn test_hard_bot_returns_move_on_empty_board() {
        let bot = HardBot::with_simulations(100);
        let game = GameY::new(5);
        let chosen_move = bot.choose_move(&game);
        assert!(chosen_move.is_some());
    }

    #[test]
    fn test_hard_bot_returns_valid_coordinates() {
        let bot = HardBot::with_simulations(100);
        let game = GameY::new(5);
        let coords = bot.choose_move(&game).unwrap();
        let index = coords.to_index(game.board_size());
        assert!(index < 15); // 5*(5+1)/2 = 15
        assert!(game.available_cells().contains(&index));
    }

    #[test]
    fn test_hard_bot_returns_none_on_full_board() {
        let bot = HardBot::default();
        let mut game = GameY::new(2);
        // Fill the board (size 2 has 3 cells)
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(1, 0, 0),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(0, 1, 0),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 1),
        }).unwrap();

        assert!(game.available_cells().is_empty());
        assert!(bot.choose_move(&game).is_none());
    }

    #[test]
    fn test_hard_bot_blocks_winning_move() {
        // Setup: size-4 board where Player 0 has a chain along side A
        // threatening immediate win at TWO cells: (0,3,0) and (1,2,0).
        // The bot (Player 1) must block one of them.
        //
        // Player 0 has: (0,0,3) A+B, (0,1,2) A, (0,2,1) A — all connected
        // Player 1 has: (3,0,0) B+C, (2,0,1) B

        let mut game = GameY::new(4);

        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 3),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(3, 0, 0),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 1, 2),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(2, 0, 1),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 2, 1),
        }).unwrap();

        // Both (1,2,0) and (0,3,0) are winning moves for P0.
        // The bot should deterministically block one of them via tactical pre-check.
        let bot = HardBot::with_simulations(100);
        let chosen = bot.choose_move(&game).unwrap();

        let p0_winning_moves = vec![
            Coordinates::new(1, 2, 0),
            Coordinates::new(0, 3, 0),
        ];
        assert!(
            p0_winning_moves.contains(&chosen),
            "Hard bot should block one of P0's winning moves, but chose {:?}",
            chosen
        );
    }

    #[test]
    fn test_hard_bot_takes_winning_move() {
        // If the bot (Player 1) can win by playing at a specific cell, it should.
        let bot = HardBot::with_simulations(500);
        let mut game = GameY::new(2);

        // Player 0 plays at top (1,0,0) — touches B and C
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(1, 0, 0),
        }).unwrap();

        // Player 1 plays at bottom-left (0,0,1) — touches A and B
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(0, 0, 1),
        }).unwrap();

        // Player 0 plays... but wait, on size 2 there are only 3 cells.
        // After 2 moves, only (0,1,0) is left. Player 0 must play there.
        // Actually let's use a larger board.
        // Let me redesign: size 3, bot is Player 1.

        let mut game2 = GameY::new(3);
        // Interleave so Player 1 gets pieces on two sides
        game2.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(2, 0, 0), // top corner, B+C
        }).unwrap();
        game2.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(0, 0, 2), // bottom-left, A+B
        }).unwrap();
        game2.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(1, 1, 0), // middle-right, C
        }).unwrap();
        game2.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(0, 2, 0), // bottom-right, A+C
        }).unwrap();

        // Player 0's turn — play somewhere
        game2.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(1, 0, 1), // left edge
        }).unwrap();

        // Player 1 can win by connecting (0,0,2) and (0,2,0) which touch A+B and A+C.
        // They need a piece at (0,1,1) to connect them — that would touch A and connect B+C.
        // The hard bot should find this.
        let chosen = bot.choose_move(&game2).unwrap();
        assert_eq!(
            chosen,
            Coordinates::new(0, 1, 1),
            "Hard bot should take the winning move at (0,1,1)"
        );
    }

    #[test]
    fn test_sim_board_from_game() {
        let game = GameY::new(3);
        let board = SimBoard::from_game(&game);
        assert_eq!(board.board_size, 3);
        assert_eq!(board.available.len(), 6);
        assert!(board.cells.is_empty());
    }

    #[test]
    fn test_sim_board_place_and_win() {
        let mut board = SimBoard {
            board_size: 2,
            cells: HashMap::new(),
            available: vec![0, 1, 2],
            uf_parent: Vec::new(),
            uf_sides: Vec::new(),
            cell_to_set: HashMap::new(),
        };

        let p0 = PlayerId::new(0);
        // (1, 0, 0) = index 0 — touches B and C
        let won1 = board.place(0, p0);
        assert!(!won1);

        // (0, 0, 1) = index 1 — touches A and B
        // Together with (1,0,0): they are NOT neighbors (different rows), so no merge
        // Actually on size-2: index 0 = (1,0,0), index 1 = (0,0,1), index 2 = (0,1,0)
        // Neighbors of (1,0,0): (0,1,0) and (0,0,1) — so they ARE neighbors!
        // Merged sides: B+C + A+B = A+B+C → WIN
        let won2 = board.place(1, p0);
        assert!(won2, "Two pieces on size-2 that are neighbors and cover all sides should win");
    }

    #[test]
    fn test_sim_board_detects_opponent_threat() {
        // Build the same game state as the blocking test
        let mut game = GameY::new(4);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 3),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(3, 0, 0),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 1, 2),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(2, 0, 1),
        }).unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 2, 1),
        }).unwrap();

        let board = SimBoard::from_game(&game);

        // Verify P0 wins at (0,3,0)
        let target1 = Coordinates::new(0, 3, 0);
        let target1_idx = target1.to_index(4);
        assert!(board.available.contains(&target1_idx), "(0,3,0) should be available");
        let mut board_copy1 = board.clone_for_sim();
        assert!(board_copy1.place(target1_idx, PlayerId::new(0)), "P0 should win at (0,3,0)");

        // Verify P0 also wins at (1,2,0)
        let target2 = Coordinates::new(1, 2, 0);
        let target2_idx = target2.to_index(4);
        assert!(board.available.contains(&target2_idx), "(1,2,0) should be available");
        let mut board_copy2 = board.clone_for_sim();
        assert!(board_copy2.place(target2_idx, PlayerId::new(0)), "P0 should win at (1,2,0)");

        // Verify the bot blocks one of the two threats
        let bot = HardBot::with_simulations(100);
        let chosen = bot.choose_move(&game).unwrap();
        assert!(
            chosen == target1 || chosen == target2,
            "Bot should block one of P0's winning moves, but chose {:?}",
            chosen
        );
    }
}
