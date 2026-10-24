Feature: Game creation
  A signed-in host can create a party game and receive a short join code.

  @smoke
  Scenario: A signed-in host creates a game
    Given I am a signed-in host
    When I create a game with override code "hunter2" and a budget of 5 dollars
    Then the game is created
    And the game has a join code of 4 letters
    And the game is in the "lobby" phase
    And the game has no players

  @security
  Scenario: Creating a game requires signing in
    Given I am not signed in
    When I create a game with override code "hunter2" and a budget of 5 dollars
    Then the request is refused as unauthorized
    And no game exists

  Scenario Outline: The override code must be long enough
    Given I am a signed-in host
    When I create a game with override code "<code>" and a budget of 5 dollars
    Then the request is refused as a bad request
    And no game exists

    Examples:
      | code |
      |      |
      | abc  |
      |  ab  |

  Scenario: The join code uses only unambiguous letters
    Given I am a signed-in host
    When I create 50 games
    Then every join code uses only letters from "ABCDEFGHJKMNPQRSTUVWXYZ"
    And all join codes are different

  @security
  Scenario: The join code does not reveal the internal game id
    Given I am a signed-in host
    When I create a game with override code "hunter2" and a budget of 5 dollars
    Then no response for the game contains the internal game id
    And the join code is not derived from the internal game id

  Scenario: The budget recommends a media plan the cap can pay for
    Given I am a signed-in host
    When I create a game for 12 adults and 6 kids with a budget of 1 dollar
    Then the game media plan costs no more than 85 percent of the budget

  Scenario: Host settings are stored in clean form
    Given I am a signed-in host
    When I create a game named "  The   Party  " with 100 adults expected
    Then the game name is trimmed
    And the expected adults is limited to 40

  @mobile
  Scenario: A host on a phone sees the join code and QR straight after creating
    Given I am a signed-in host on a phone with a 360 pixel wide screen
    When I create a game with override code "hunter2" and a budget of 5 dollars
    Then I see the join code and a QR code without scrolling sideways
