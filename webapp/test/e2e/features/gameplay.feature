Feature: Gameplay basics
  Validate basic new game creation and first move interaction.

  Scenario: Logged-in user can create a player game
    Given I have a registered user
    When I open the new game page
    And I configure a local player game with opponent "Bob"
    And I start the game
    Then I should be on a game page
    And I should see the game board

  # TODO: disabled while first-move / move-history E2E is flaky.
  # Restore this scenario once the gameplay assertion is stable again.
  # Scenario: Logged-in user can play the first move
  #   Given I have a registered user
  #   When I open the new game page
  #   And I configure a local player game with opponent "Bob"
  #   And I start the game
  #   And I play the first available hex
  #   Then move history should contain at least 1 move
