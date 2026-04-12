Feature: Entry authentication flow
  Validate sign-up and sign-in behavior from the unified Entry page.

  Scenario: New user can create account and reach home
    Given the app is open on the entry page
    When I continue with a new unique username
    And I submit registration with password "Secret123"
    Then I should be on the home page
    And I should see "Create New Game"

  Scenario: Existing user can sign in after sign out
    Given I have a registered user
    And I am signed out
    When I continue with the existing username
    And I sign in with password "Secret123"
    Then I should be on the home page

  Scenario: Registration blocks mismatched passwords
    Given the app is open on the entry page
    When I continue with a new unique username
    And I submit registration with mismatched passwords
    Then I should see auth error "Passwords do not match"

  Scenario: Empty username shows validation message on Enter
    Given the app is open on the entry page
    When I press Enter in the username field
    Then I should see auth error "Username is required"
