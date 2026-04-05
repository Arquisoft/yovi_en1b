Feature: Route guards
  Validate protected route redirect behavior.

  Scenario: Unauthenticated user is redirected from profile to entry
    Given I am not signed in
    When I navigate directly to "/profile"
    Then I should be on the entry page
    And I should see "Welcome to YOVI"

