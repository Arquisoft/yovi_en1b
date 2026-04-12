Feature: User Session
  Validate user sign-out and session termination.

  Scenario: Authenticated user can sign out from the top bar
    Given I have a registered user
    When I click the "Sign out" button in the top bar
    Then I should be on the entry page
    And I should see "Welcome to YOVI"
