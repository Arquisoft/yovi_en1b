use std::fmt::Display;

use serde::{Deserialize, Serialize};

/// Game variants that modify the standard rules of Y.
///
/// Variants can be combined — selecting both creates the "CHAOS" mode.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GameVariant {
    /// Explosions (Bomb mode): a random bomb appears on the board at the start.
    /// When a player captures the bomb cell, the cell is placed normally,
    /// then all occupied neighbor cells are cleared. Board must be ≥ 7×7.
    Explosions,

    /// Double Turn: both players play 2 moves at a time instead of 1.
    DoubleTurn,
}

impl Display for GameVariant {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GameVariant::Explosions => write!(f, "Explosions"),
            GameVariant::DoubleTurn => write!(f, "Double turn"),
        }
    }
}

impl GameVariant {
    /// Parses a variant from its string name (case-insensitive).
    pub fn from_name(name: &str) -> Option<Self> {
        match name.to_lowercase().as_str() {
            "explosions" => Some(GameVariant::Explosions),
            "double turn" | "doubleturn" | "double_turn" => Some(GameVariant::DoubleTurn),
            _ => None,
        }
    }

    /// Returns the allowed bot strategies for this variant.
    pub fn allowed_strategies(&self) -> Vec<String> {
        match self {
            GameVariant::Explosions => vec!["random".to_string(), "ai".to_string()],
            GameVariant::DoubleTurn => vec!["random".to_string(), "ai".to_string()],
        }
    }

    /// Returns a human-readable description of this variant.
    pub fn description(&self) -> &str {
        match self {
            GameVariant::Explosions => {
                "A random bomb appears on the board at the start. Capturing it clears all neighboring pieces."
            }
            GameVariant::DoubleTurn => "Both players play 2 moves at a time instead of 1.",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_display() {
        assert_eq!(format!("{}", GameVariant::Explosions), "Explosions");
        assert_eq!(format!("{}", GameVariant::DoubleTurn), "Double turn");
    }

    #[test]
    fn test_from_name() {
        assert_eq!(GameVariant::from_name("Explosions"), Some(GameVariant::Explosions));
        assert_eq!(GameVariant::from_name("explosions"), Some(GameVariant::Explosions));
        assert_eq!(GameVariant::from_name("Double turn"), Some(GameVariant::DoubleTurn));
        assert_eq!(GameVariant::from_name("doubleturn"), Some(GameVariant::DoubleTurn));
        assert_eq!(GameVariant::from_name("double_turn"), Some(GameVariant::DoubleTurn));
        assert_eq!(GameVariant::from_name("unknown"), None);
    }

    #[test]
    fn test_serialize_deserialize() {
        let variant = GameVariant::Explosions;
        let json = serde_json::to_string(&variant).unwrap();
        let restored: GameVariant = serde_json::from_str(&json).unwrap();
        assert_eq!(variant, restored);
    }

    #[test]
    fn test_allowed_strategies() {
        assert!(GameVariant::Explosions.allowed_strategies().contains(&"random".to_string()));
        assert!(GameVariant::DoubleTurn.allowed_strategies().contains(&"ai".to_string()));
    }

    #[test]
    fn test_equality_and_hash() {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        set.insert(GameVariant::Explosions);
        set.insert(GameVariant::DoubleTurn);
        set.insert(GameVariant::Explosions); // duplicate
        assert_eq!(set.len(), 2);
    }
}
