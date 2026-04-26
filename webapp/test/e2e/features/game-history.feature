Feature: Game history
  Validate the game history page displays user's played games.

  Scenario: New user sees empty game history
    Given I have a registered user
    When I open the game history page
    Then I should see the game history heading
    And the game history should show "No games yet"

  Scenario: Game history shows a finished game
    Given I have a registered user
    When I open the new game page
    And I configure a local player game with opponent "Alice"
    And I start the game
    And I play the first available hex
    And I surrender game
    And I open the game history page
    Then I should see the game history heading
    And the game history list should have at least 1 entry
    And the game history should show a "SURRENDERED" result

  Scenario: Game history entry links to the game page
    Given I have a registered user
    When I open the new game page
    And I configure a local player game with opponent "Bob"
    And I start the game
    And I play the first available hex
    And I surrender game
    And I open the game history page
    And I click the first game history entry
    Then I should be on a game page
    And I should see "SURRENDERED"
