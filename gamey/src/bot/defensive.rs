//! A defensive strategy bot implementation.
//!
//! This module provides [`DefensiveBot`], a bot that tries to play near the opponent's last move
//! to block their progress or respond to their placement.

use crate::{Coordinates, GameY, Movement, YBot};
use rand::prelude::IndexedRandom;

/// A bot that chooses moves defensively based on the opponent's last move.
///
/// The DefensiveBot looks at the very last move made in the game. If it was a placement
/// by the opponent, the bot attempts to pick a random empty neighboring cell to block it.
/// If no neighbors are available or if it's the first move, it falls back to
/// picking a random empty cell.
pub struct DefensiveBot;

impl YBot for DefensiveBot {
    fn name(&self) -> &str {
        "medium-defensive"
    }

    fn choose_move(&self, game: &GameY) -> Option<Coordinates> {
        let board_size = game.board_size();
        let history = game.history();

        // 1. Try to find the opponent's last placement
        if let Some(Movement::Placement { coords, .. }) = history.last() {
            let neighbors = coords.neighbors(board_size);
            let mut empty_neighbors = Vec::new();

            for neighbor in neighbors {
                if game.board().is_empty_at(&neighbor) {
                    empty_neighbors.push(neighbor);
                }
            }

            // If we found empty neighbors, pick one randomly to "defend" or block
            if !empty_neighbors.is_empty() {
                return empty_neighbors.choose(&mut rand::rng()).copied();
            }
        }

        // 2. Fallback: pick a random empty cell
        let available_cells = game.available_cells();
        let cell = available_cells.choose(&mut rand::rng())?;
        Some(Coordinates::from_index(*cell, board_size))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PlayerId;

    #[test]
    fn test_defensive_bot_name() {
        let bot = DefensiveBot;
        assert_eq!(bot.name(), "medium-defensive");
    }

    #[test]
    fn test_defensive_bot_fallback_on_empty_board() {
        let bot = DefensiveBot;
        let game = GameY::new(5);

        let chosen_move = bot.choose_move(&game);
        assert!(chosen_move.is_some());
    }

    #[test]
    fn test_defensive_bot_chooses_neighbor() {
        let bot = DefensiveBot;
        let mut game = GameY::new(5);

        // Opponent (Player 0) places at (2, 2, 0)
        let opponent_move = Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(2, 2, 0),
        };
        game.add_move(opponent_move).unwrap();

        // Bot (Player 1) should pick a neighbor of (2, 2, 0)
        let chosen_move = bot.choose_move(&game).unwrap();
        let neighbors = Coordinates::new(2, 2, 0).neighbors(5);
        
        assert!(neighbors.contains(&chosen_move), "Bot should have picked a neighbor of the opponent's move");
    }
}
