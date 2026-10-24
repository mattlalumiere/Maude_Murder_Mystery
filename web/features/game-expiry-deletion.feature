Feature: Game expiry and deletion
  Games disappear on their own, and a host can delete one at any time.

  @smoke
  Scenario: A game expires after its time to live
    Given a started game that expires after 24 hours
    When 24 hours and 1 minute pass
    And the cleanup runs
    Then the game cannot be read
    And the join code no longer resolves
    And no object remains in storage for the game

  Scenario: A game is still playable just before it expires
    Given a started game that expires after 24 hours
    When 23 hours pass
    Then the game can be read
    And players can still poll their state

  @smoke @security
  Scenario: The host can delete a game
    Given a started game with a photo and generated pictures
    When the host deletes the game
    Then the response is successful
    And every endpoint for the game returns not found
    And no object remains in storage for the game
    And the join code no longer resolves

  @security
  Scenario: Only the host can delete a game
    Given a started game
    When a player tries to delete the game
    Then the request is refused
    And the game still exists

  Scenario: Deleting twice is harmless
    Given a started game
    When the host deletes the game
    And the host deletes the game again
    Then neither response is a server error

  Scenario: A deleted join code is not reused straight away
    Given a deleted game
    When 100 new games are created within the next hour
    Then none of them uses the deleted game's join code

  Scenario: The host can export a game before deleting it
    Given a game in the "act4" phase
    When the host exports the game
    Then the export contains the configuration, the roster and the public clues
    And the export contains no truth
    And the export contains no tokens, no override data and no raw photos

  Scenario: An export after the Reveal includes the result
    Given a game in the "reveal" phase
    When the host exports the game
    Then the export contains the scores and the awards

  Scenario: Cleanup is bounded
    Given 5000 expired games in one cell
    When the cleanup runs once
    Then it removes at most 500 games
    And the rest are removed by later runs

  Scenario: A pause does not extend the lifetime
    Given a started game that expires after 24 hours
    And the game is paused
    When 24 hours and 1 minute pass
    And the cleanup runs
    Then the game cannot be read

  Scenario: Players are told when a game has ended
    Given a player has the game open on their phone
    When the game is deleted
    Then the player sees a friendly message that the game has ended
