Feature: Leaderboard
  Validate the display of top ranking players.

  Scenario: Authenticated user can view the leaderboard
    Given I have a registered user
    When I navigate directly to "/leaderboard"
    Then I should see a heading with text "Leaderboard"
    And I should see a subtitle "Top YOVI players"
    And I should see a table with "Rank", "Player", and "Wins"
