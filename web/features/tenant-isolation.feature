Feature: Tenant isolation
  One game can never read or change another game.

  Background:
    Given a started game "A" with host "Hana" and player "Ann"
    And a started game "B" with host "Hugo" and player "Bob"

  @smoke @security
  Scenario: A player of game A cannot read game B
    When "Ann" reads the player view of game "B" with her own token
    Then the request is refused as unauthorized or not found
    And the response contains nothing from game "B"

  @security
  Scenario: A player token only works in its own game
    When "Ann" sends a ballot to game "B" with her own token
    Then the request is refused
    And game "B" is unchanged

  @security
  Scenario: The host of game A cannot act on game B
    When "Hana" tries to advance game "B"
    Then the request is refused as forbidden
    And game "B" is unchanged

  @security
  Scenario: The host of game A cannot read the host view of game B
    When "Hana" reads the host view of game "B"
    Then the request is refused as forbidden

  @security
  Scenario: The host of game A cannot delete or export game B
    When "Hana" deletes game "B"
    Then the request is refused as forbidden
    When "Hana" exports game "B"
    Then the request is refused as forbidden
    And game "B" still exists

  @security
  Scenario: The media of game A is not served under game B
    Given game "A" has a generated picture
    When anyone requests that picture under the code of game "B"
    Then the response is not found

  @security
  Scenario: Photos of game A are not reachable from game B
    Given "Ann" has a stored photo
    When "Bob" requests the photo path of "Ann" under game "B"
    Then the request is refused

  @security
  Scenario: Other games are indistinguishable from missing games
    When "Ann" reads the state of game "B" with a wrong token
    And "Ann" reads the state of a code that does not exist with a wrong token
    Then both responses have the same status and the same body

  @security
  Scenario: Every stored object is under its own game's prefix
    Then every stored object of game "A" has a key starting with the tenant prefix of game "A"
    And no object of game "A" has a key starting with the tenant prefix of game "B"

  @security
  Scenario: A malicious game identifier cannot escape its prefix
    When a request uses a code or id containing "../" or a slash
    Then the request is refused as not found
    And nothing outside the game's prefix is read

  Scenario: Deleting game A leaves game B intact
    When the host of game "A" deletes the game
    Then game "A" no longer exists
    And game "B" is unchanged and still playable

  @security
  Scenario: Two games can never share a join code
    When 1000 games are created in one region
    Then every live join code is different
    And each code resolves to exactly one game

  Scenario: One game under heavy load does not slow another
    Given player "Ann" polls game "A" 20 times a second
    When "Bob" polls game "B" normally
    Then "Bob" is still served within the target time
