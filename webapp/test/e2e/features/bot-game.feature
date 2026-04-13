Feature: Bot gameplay
  Validate that the Gamey bot engine is reachable and functional.

  Scenario: Logged-in user can create a game against the bot
    Given I have a registered user
    When I open the new game page
    And I select "Play vs Bot" mode
    And I start the game
    Then I should be on a game page
    And I should see the game board

  Scenario: Bot responds after user plays the first move
    Given I have a registered user
    When I open the new game page
    And I select "Play vs Bot" mode
    And I start the game
    And I play the first available hex
    Then the bot should play a move
