Feature: Leaderboard
  Validate the leaderboard page displays correctly.

  Scenario: New user sees empty leaderboard
    Given I have a registered user
    When I open the leaderboard page
    Then I should see the leaderboard heading
    And the leaderboard table should show empty or loading state

  Scenario: Leaderboard updates after a player wins a game
    Given I have a registered user
    When I open the new game page
    And I configure a local player game with opponent "Rival"
    And I set the board size to 3
    And I start the game
    And I play a full game until Blue wins
    Then the game result should show "YOU WIN"
    When I open the leaderboard page
    Then I should see the leaderboard heading
    And the leaderboard should show my username with 1 win and 1 game
