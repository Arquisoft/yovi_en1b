Feature: User Profile
  Validate profile information and statistics display.

  Scenario: Authenticated user can see their own profile
    Given I have a registered user
    When I navigate directly to "/profile"
    Then I should see a heading with text "Profile"
    And I should see my current username in the profile card
