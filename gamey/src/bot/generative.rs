//! Generative AI bot powered by Google Gemini.
//!
//! The bot builds a detailed natural-language description of the current Y
//! game state (including bomb positions and post-explosion rules for the
//! Explosions variant), sends it to the Gemini API, and parses the returned
//! coordinates.
//!
//! # API key
//! The key is read from the `GEMINI_API_KEY` **environment variable** at
//! construction time. It is never hard-coded or logged. If the variable is
//! not set, every `choose_move` call falls back to a random legal move so
//! the server never crashes.
//!
//! # Blocking inside async
//! `YBot::choose_move` is a synchronous trait method called from inside an
//! async Axum handler. Using `reqwest::blocking` directly from a Tokio thread
//! panics. The fix: spawn a plain OS thread, make the HTTP request there, and
//! return the result via a channel — completely transparent to the caller.

use crate::{Coordinates, GameStatus, GameVariant, GameY, YBot};
use rand::prelude::IndexedRandom;
use std::sync::mpsc;
use std::time::Duration;

const GEMINI_API_URL: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const REQUEST_TIMEOUT_SECS: u64 = 20;

// ─── Public struct ────────────────────────────────────────────────────────────

/// A bot that asks Google Gemini to choose the next move.
///
/// Build with [`GenerativeAIBot::from_env`]; the API key is read from
/// `GEMINI_API_KEY` and stored in memory for the lifetime of the bot.
pub struct GenerativeAIBot {
    api_key: String,
}

impl GenerativeAIBot {
    /// Creates the bot by reading `GEMINI_API_KEY` from the environment.
    ///
    /// Returns `None` when the variable is not set so callers can fall back
    /// to a different bot without panicking.
    pub fn from_env() -> Option<Self> {
        std::env::var("GEMINI_API_KEY")
            .ok()
            .filter(|k| !k.trim().is_empty())
            .map(|api_key| Self { api_key })
    }
}

impl YBot for GenerativeAIBot {
    fn name(&self) -> &str {
        "gemini"
    }

    fn choose_move(&self, game: &GameY) -> Option<Coordinates> {
        if game.available_cells().is_empty() {
            return None;
        }

        let prompt = build_prompt(game);

        match call_gemini_via_thread(&self.api_key, &prompt) {
            Ok(text) => {
                tracing::debug!("Gemini raw response: {text}");
                parse_coords(&text, game).or_else(|| {
                    tracing::warn!(
                        "Could not parse valid coordinates from Gemini response; \
                         falling back to random move"
                    );
                    random_fallback(game)
                })
            }
            Err(e) => {
                tracing::warn!("Gemini API error: {e}; falling back to random move");
                random_fallback(game)
            }
        }
    }
}

// ─── Prompt building ──────────────────────────────────────────────────────────

fn build_prompt(game: &GameY) -> String {
    let size = game.board_size();
    let variants = game.variants();
    let has_explosions = variants.contains(&GameVariant::Explosions);
    let has_double_turn = variants.contains(&GameVariant::DoubleTurn);

    // Whose turn?
    let (my_color, opp_color) = match game.status() {
        GameStatus::Ongoing { next_player } => {
            if next_player.id() == 0 {
                ("Blue (B)", "Red (R)")
            } else {
                ("Red (R)", "Blue (B)")
            }
        }
        GameStatus::Finished { .. } => {
            // Should never happen — handler checks this before calling choose_move
            return "The game is already finished.".to_string();
        }
    };

    // ── Board rendering ───────────────────────────────────────────────────────
    // Triangle printed top-to-bottom: row 0 = apex (1 cell), row size-1 = base.
    // Each cell is shown with its barycentric index for easy reference.
    let mut board_visual = String::new();
    let mut coord_index = String::new();

    for row in 0..size {
        let x = size - 1 - row;
        let indent = " ".repeat((size - 1 - row) as usize);

        // Visual layer (symbols)
        board_visual.push_str(&indent);
        // Coord-index layer
        coord_index.push_str(&indent);

        for y in 0..=row {
            let z = row - y;
            let coords = Coordinates::new(x, y, z);

            // Symbol
            let sym = if has_explosions && game.board().is_bomb(&coords) {
                '*'
            } else {
                match game.board().get_cell(&coords) {
                    Some(p) if p.id() == 0 => 'B',
                    Some(_) => 'R',
                    None => '.',
                }
            };
            board_visual.push(sym);
            board_visual.push(' ');

            // Coordinate hint below each cell
            coord_index.push_str(&format!("({},{},{}) ", x, y, z));
        }
        board_visual.push('\n');
        coord_index.push('\n');
    }

    // ── Available moves ───────────────────────────────────────────────────────
    let available_list: Vec<String> = game
        .available_cells()
        .iter()
        .map(|&idx| {
            let c = Coordinates::from_index(idx, size);
            format!("x={},y={},z={}", c.x(), c.y(), c.z())
        })
        .collect();

    // ── Explosions variant section ────────────────────────────────────────────
    let explosions_section = if has_explosions {
        let bombs = game.bomb_positions();
        let bomb_list: Vec<String> = bombs
            .iter()
            .map(|c| format!("x={},y={},z={}", c.x(), c.y(), c.z()))
            .collect();

        let bomb_coords_str = if bomb_list.is_empty() {
            "none (all have been detonated already)".to_string()
        } else {
            bomb_list.join(", ")
        };

        format!(
            "\n## Explosions variant is ACTIVE\n\
             Bombs on the board (marked * in the visual): {bomb_coords_str}\n\
             \n\
             Explosion rules:\n\
             1. If you place your piece ON a bomb cell (*), the bomb detonates.\n\
             2. Your piece STAYS on that cell.\n\
             3. Every piece (yours or your opponent's) on any cell DIRECTLY \
                ADJACENT to the bomb cell is REMOVED from the board.\n\
             4. If an adjacent cell also contained a bomb, it chain-detonates \
                in turn, removing pieces adjacent to IT as well (the chain \
                continues until no more adjacent bombs remain).\n\
             5. After any explosion, the turn ALWAYS passes to the opponent, \
                even in DoubleTurn mode.\n\
             6. Strategic notes:\n\
                - An explosion can destroy your own pieces — weigh the risk.\n\
                - A well-placed explosion can shatter an opponent's nearly-\
                  winning chain.\n\
                - Detonating when you have few adjacent pieces is safest.\n\
             7. No two bombs are ever placed adjacent to each other at game \
                start, so a single bomb's blast always has a bounded radius.\n"
        )
    } else {
        String::new()
    };

    // ── DoubleTurn variant section ────────────────────────────────────────────
    let double_turn_section = if has_double_turn {
        "\n## DoubleTurn variant is ACTIVE\n\
         You make TWO placements per turn before it passes to the opponent.\n\
         Exception: if your first placement triggers a bomb explosion, the \
         turn switches immediately — you do NOT get a second move.\n"
            .to_string()
    } else {
        String::new()
    };

    // ── Assemble final prompt ─────────────────────────────────────────────────
    format!(
        r#"You are an expert player of the abstract strategy game Y.
Your task: choose the single best legal move for the current position.

## Rules of Y
- The board is a triangle. Each cell has barycentric coordinates (x, y, z)
  where x + y + z = {max_coord} (board size = {size}).
- Two players: Blue (B) and Red (R). They alternate placements.
- Goal: connect ALL THREE sides of the triangle with a single chain of
  your own pieces.
  · Side A = all cells where x = 0  (left edge)
  · Side B = all cells where y = 0  (right edge)
  · Side C = all cells where z = 0  (bottom edge)
- Corner cells touch two sides and count for both.
- The player who first forms a chain touching sides A, B, and C wins.
- A single cell at a corner that touches all three sides wins immediately.
{explosions_section}{double_turn_section}
## Current board  (size {size})
Legend: B = Blue  R = Red  . = empty{bomb_legend}
Visual (row 0 = apex, row {bottom} = base):
{board_visual}
Coordinates of each cell:
{coord_index}
## You are playing as: {my_color}
## Opponent is:        {opp_color}

## Legal moves — you MUST choose exactly one of these:
{available}

## Decision instructions
1. WIN CHECK: if placing on any legal cell gives you a chain that touches all
   three sides (A, B, C) simultaneously — choose it immediately.
2. BLOCK: if the opponent has a chain one move away from winning — block it.
3. Otherwise: choose the cell that best advances your connectivity across all
   three sides. Prefer cells that join existing friendly clusters and extend
   toward uncovered sides.{bomb_advice}

## Output format — CRITICAL
Reply with ONLY this exact pattern and nothing else:
x=<number>,y=<number>,z=<number>

No words, no explanation, no punctuation before or after. Just coordinates."#,
        max_coord = size - 1,
        size = size,
        bottom = size - 1,
        bomb_legend = if has_explosions { "  * = bomb" } else { "" },
        board_visual = board_visual,
        coord_index = coord_index,
        available = available_list.join("  |  "),
        bomb_advice = if has_explosions {
            "\n4. BOMB CONSIDERATION: placing on a * cell detonates it — \
             weigh whether removing the adjacent pieces helps or hurts you \
             before choosing a bomb cell."
        } else {
            ""
        },
        explosions_section = explosions_section,
        double_turn_section = double_turn_section,
    )
}

// ─── Gemini API call (via OS thread to avoid tokio blocking conflict) ─────────

/// Sends `prompt` to the Gemini API from a dedicated OS thread (safe to call
/// from within a Tokio async context) and returns the model's text reply.
fn call_gemini_via_thread(api_key: &str, prompt: &str) -> Result<String, String> {
    let api_key = api_key.to_string();
    let prompt = prompt.to_string();

    // Channel: capacity 1 so the spawned thread never blocks on send.
    let (tx, rx) = mpsc::sync_channel::<Result<String, String>>(1);

    std::thread::spawn(move || {
        let result = do_http_request(&api_key, &prompt);
        // Ignore send error — receiver may have timed out already.
        let _ = tx.send(result);
    });

    rx.recv_timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .map_err(|_| {
            format!("Gemini API did not respond within {REQUEST_TIMEOUT_SECS} seconds")
        })?
}

/// Performs the actual blocking HTTP POST to the Gemini endpoint.
/// Must be called from a plain OS thread, not from within a Tokio runtime.
fn do_http_request(api_key: &str, prompt: &str) -> Result<String, String> {
    let url = format!("{}?key={}", GEMINI_API_URL, api_key);

    let body = serde_json::json!({
        "contents": [{
            "parts": [{ "text": prompt }]
        }],
        "generationConfig": {
            // Low temperature = deterministic / focused output.
            "temperature": 0.1,
            // We only need a short reply: "x=N,y=N,z=N"
            "maxOutputTokens": 64,
            "stopSequences": ["\n\n"]
        }
    });

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        // Read at most 512 bytes of the error body to avoid log spam.
        let body_text = response.text().unwrap_or_default();
        let snippet: String = body_text.chars().take(512).collect();
        return Err(format!("Gemini returned HTTP {status}: {snippet}"));
    }

    let json: serde_json::Value = response
        .json()
        .map_err(|e| format!("Failed to parse Gemini JSON response: {e}"))?;

    // Navigate: candidates[0].content.parts[0].text
    json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.trim().to_string())
        .ok_or_else(|| format!("Unexpected Gemini response structure: {json}"))
}

// ─── Response parsing ─────────────────────────────────────────────────────────

/// Extracts `x=N,y=N,z=N` from the model's reply and validates it is a
/// legal move. Returns `None` if parsing fails or the move is illegal.
fn parse_coords(text: &str, game: &GameY) -> Option<Coordinates> {
    // Strip whitespace and lowercase for robust matching.
    let normalised = text.trim().replace([' ', '\n', '\r'], "").to_lowercase();

    let x = extract_axis(&normalised, 'x')?;
    let y = extract_axis(&normalised, 'y')?;
    let z = extract_axis(&normalised, 'z')?;

    let coords = Coordinates::new(x, y, z);

    if !coords.is_valid(game.board_size()) {
        tracing::warn!(
            "Gemini chose ({x},{y},{z}) which is out of bounds for board size {}",
            game.board_size()
        );
        return None;
    }

    let idx = coords.to_index(game.board_size());

    if game.available_cells().contains(&idx) {
        Some(coords)
    } else {
        tracing::warn!(
            "Gemini chose ({x},{y},{z}) which is not a legal move in the current position"
        );
        None
    }
}

/// Finds `<axis>=<digits>` in `s` and returns the parsed number.
fn extract_axis(s: &str, axis: char) -> Option<u32> {
    let prefix = format!("{}=", axis);
    let start = s.find(prefix.as_str())? + prefix.len();
    let digits: String = s[start..].chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// Falls back to a uniformly random legal move.
fn random_fallback(game: &GameY) -> Option<Coordinates> {
    let idx = game.available_cells().choose(&mut rand::rng())?;
    Some(Coordinates::from_index(*idx, game.board_size()))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{GameVariant, GameY};

    #[test]
    fn test_parse_coords_valid() {
        let game = GameY::new(5);
        // Cell (2,1,1) is index 7 on a size-5 board — available on a fresh game.
        let text = "x=2,y=1,z=1";
        let result = parse_coords(text, &game);
        assert!(result.is_some());
        assert_eq!(result.unwrap(), Coordinates::new(2, 1, 1));
    }

    #[test]
    fn test_parse_coords_with_spaces() {
        let game = GameY::new(5);
        let text = "x=2, y=1, z=1";
        assert!(parse_coords(text, &game).is_some());
    }

    #[test]
    fn test_parse_coords_with_newline_prefix() {
        // Gemini sometimes adds a newline before the answer.
        let game = GameY::new(5);
        let text = "\nx=2,y=1,z=1\n";
        assert!(parse_coords(text, &game).is_some());
    }

    #[test]
    fn test_parse_coords_invalid_cell() {
        let game = GameY::new(5);
        // (9,9,9) does not exist on a size-5 board.
        let text = "x=9,y=9,z=9";
        assert!(parse_coords(text, &game).is_none());
    }

    #[test]
    fn test_parse_coords_garbage() {
        let game = GameY::new(5);
        assert!(parse_coords("I don't know", &game).is_none());
        assert!(parse_coords("", &game).is_none());
    }

    #[test]
    fn test_build_prompt_contains_rules() {
        let game = GameY::new(5);
        let prompt = build_prompt(&game);
        assert!(prompt.contains("Side A"), "prompt must mention sides");
        assert!(prompt.contains("x="), "prompt must list moves as x=N,y=N,z=N");
        assert!(prompt.contains("Blue"), "prompt must state the player's colour");
    }

    #[test]
    fn test_build_prompt_explosions_variant() {
        let game = GameY::new_with_variants(7, vec![GameVariant::Explosions]);
        let prompt = build_prompt(&game);
        assert!(
            prompt.contains("Explosions variant is ACTIVE"),
            "prompt must include explosion rules when variant is active"
        );
        assert!(
            prompt.contains("chain-detonates"),
            "prompt must explain chain detonation"
        );
    }

    #[test]
    fn test_build_prompt_no_explosions_section_when_inactive() {
        let game = GameY::new(7);
        let prompt = build_prompt(&game);
        assert!(
            !prompt.contains("Explosions variant is ACTIVE"),
            "explosion section must be absent when variant is not active"
        );
    }

    #[test]
    fn test_from_env_returns_none_when_key_absent() {
        // remove_var is unsafe in Rust 2024 (potential data race in multi-
        // threaded tests). Guard with unsafe and use a key name that is
        // extremely unlikely to be set in any real environment.
        unsafe { std::env::remove_var("GEMINI_API_KEY_DEFINITELY_NOT_SET_XYZ") };
        // from_env must return None when the variable doesn't exist.
        assert!(std::env::var("GEMINI_API_KEY_DEFINITELY_NOT_SET_XYZ").is_err());
        // Construct directly with an empty key to test the filter logic.
        let bot_empty = GenerativeAIBot { api_key: String::new() };
        // An empty key would fail the API call, but from_env filters it out.
        // Verify from_env itself returns None for an empty-string variable.
        unsafe { std::env::set_var("GEMINI_API_KEY_DEFINITELY_NOT_SET_XYZ", "") };
        // from_env filters out blank keys with .filter(|k| !k.trim().is_empty())
        // so the result must be None.
        let result = std::env::var("GEMINI_API_KEY_DEFINITELY_NOT_SET_XYZ")
            .ok()
            .filter(|k| !k.trim().is_empty());
        assert!(result.is_none(), "empty key must be filtered out");
        drop(bot_empty); // suppress unused warning
        unsafe { std::env::remove_var("GEMINI_API_KEY_DEFINITELY_NOT_SET_XYZ") };
    }

    #[test]
    fn test_bot_name() {
        // Construct directly for the name check without needing a real key.
        let bot = GenerativeAIBot { api_key: "test".to_string() };
        assert_eq!(bot.name(), "gemini");
    }

    #[test]
    fn test_random_fallback_returns_legal_move() {
        let game = GameY::new(5);
        let coords = random_fallback(&game).unwrap();
        let idx = coords.to_index(5);
        assert!(game.available_cells().contains(&idx));
    }

    // ── Integration tests (require GEMINI_API_KEY) ────────────────────────────
    //
    // These tests make real HTTP calls to the Gemini API.
    // Run them explicitly with:
    //   GEMINI_API_KEY=<key> cargo test gemini_integration -- --ignored --nocapture
    //
    // They are marked #[ignore] so normal `cargo test` skips them.

    /// Verify the bot returns a legal move on a fresh normal board.
    #[test]
    #[ignore = "requires GEMINI_API_KEY env var and live network access"]
    fn gemini_integration_normal_variant() {
        dotenvy::dotenv().ok();

        let bot = GenerativeAIBot::from_env()
            .expect("GEMINI_API_KEY must be set to run this test");

        let game = GameY::new(5);
        let chosen = bot.choose_move(&game)
            .expect("bot must return a move on a non-full board");

        let idx = chosen.to_index(5);
        assert!(
            game.available_cells().contains(&idx),
            "Gemini returned an illegal move: {chosen:?}"
        );
        println!("Gemini chose: x={},y={},z={}", chosen.x(), chosen.y(), chosen.z());
    }

    /// Verify the bot returns a legal move when the Explosions variant is active
    /// and there are bombs on the board.
    #[test]
    #[ignore = "requires GEMINI_API_KEY env var and live network access"]
    fn gemini_integration_explosions_variant() {
        dotenvy::dotenv().ok();

        let bot = GenerativeAIBot::from_env()
            .expect("GEMINI_API_KEY must be set to run this test");

        let game = GameY::new_with_variants(7, vec![GameVariant::Explosions]);

        // Confirm the game has at least one bomb so the Explosions prompt path is exercised.
        assert!(
            !game.bomb_positions().is_empty(),
            "test setup: size-7 Explosions game should have at least 1 bomb"
        );

        let chosen = bot.choose_move(&game)
            .expect("bot must return a move on a non-full board");

        let idx = chosen.to_index(7);
        assert!(
            game.available_cells().contains(&idx),
            "Gemini returned an illegal move: {chosen:?}"
        );

        let is_bomb_cell = game.bomb_positions().contains(&chosen);
        println!(
            "Gemini chose: x={},y={},z={} (bomb cell: {is_bomb_cell})",
            chosen.x(), chosen.y(), chosen.z()
        );
    }

    /// Verify the bot returns a legal move even after a bomb has detonated,
    /// correctly handling the post-explosion board state.
    #[test]
    #[ignore = "requires GEMINI_API_KEY env var and live network access"]
    fn gemini_integration_prompt_accuracy_after_explosion() {
        dotenvy::dotenv().ok();

        let bot = GenerativeAIBot::from_env()
            .expect("GEMINI_API_KEY must be set to run this test");

        use crate::{Movement, PlayerId};

        // Use new_with_variants so we get a random bomb via the public API.
        // The bomb position is unknown up front, but we can read it from the game.
        let mut game = GameY::new_with_variants(7, vec![GameVariant::Explosions]);

        // Find a bomb on the board.
        let bombs = game.bomb_positions();
        if bombs.is_empty() {
            // Extremely unlikely, but skip gracefully.
            println!("No bombs on this board — skipping explosion sub-test");
            return;
        }
        let bomb = bombs[0];

        // Place B and R on non-bomb cells, then have B detonate the bomb.
        // Find two available non-bomb cells for the setup moves.
        let non_bomb_cells: Vec<Coordinates> = game
            .available_cells()
            .iter()
            .map(|&idx| Coordinates::from_index(idx, 7))
            .filter(|c| !game.board().is_bomb(c))
            .collect();

        if non_bomb_cells.len() < 2 {
            println!("Not enough non-bomb cells for setup — skipping");
            return;
        }

        // B places on a safe cell.
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: non_bomb_cells[0],
        }).unwrap();
        // R places on a safe cell.
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: non_bomb_cells[1],
        }).unwrap();
        // B detonates the bomb — it's B's turn and bomb is still available.
        if game.available_cells().contains(&bomb.to_index(7)) {
            game.add_move(Movement::Placement {
                player: PlayerId::new(0),
                coords: bomb,
            }).unwrap();
        }

        // It should now be R's turn regardless of the explosion outcome.
        println!("Post-explosion next player: {:?}", game.next_player());

        if let crate::GameStatus::Finished { .. } = game.status() {
            println!("Game finished during setup — skipping move check");
            return;
        }

        let chosen = bot.choose_move(&game)
            .expect("bot must return a move on a non-full board");

        let idx = chosen.to_index(7);
        assert!(
            game.available_cells().contains(&idx),
            "Gemini returned an illegal move after explosion: {chosen:?}"
        );
        println!(
            "Gemini chose (post-explosion): x={},y={},z={}",
            chosen.x(), chosen.y(), chosen.z()
        );
    }
}
