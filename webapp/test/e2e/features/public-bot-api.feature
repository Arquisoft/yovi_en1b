Feature: Public Bot API
  As a player
  I want to challenge the YOVI bot via the public API
  So that I can play games against a high-quality MCTS opponent.

  Scenario: A player requests a move for a specific game state
    Given the public bot API is reachable
    When a player sends a game state with layout "B/RB/R.."
    Then the bot should suggest a valid move on an empty cell
