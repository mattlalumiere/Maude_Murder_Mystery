Feature: Scale
  Many parties at once stay within the published targets.

  @scale @smoke
  Scenario: 1000 games at once stay within targets
    Given 1000 games each with 12 players are running in one simulated cell
    When every player polls every 2 seconds while the games advance through all phases
    Then every game reaches the Reveal
    And the 95th percentile of state poll time is within the target
    And no request returns a server error
    And no view of any game contains data from another game

  @scale
  Scenario: Unchanged polls are cheap
    Given 1000 games each with 12 players are running in one simulated cell
    When a player polls with the current version number
    Then the response is smaller than 100 bytes
    And the poll caused 1 storage read and no storage write

  @scale
  Scenario: Joining stays fast during a rush
    Given 100 games are open in the lobby
    When 12 guests join each game within one minute
    Then the 95th percentile of join time is within the target
    And every join succeeds

  @scale
  Scenario: Players act at the same time without losing votes
    Given a game in Act IV with 40 players
    When all 40 players cast a ballot at the same moment
    Then 40 ballots are recorded
    And the version number went up by at least 40

  @scale
  Scenario: One failing game does not affect the others
    Given 1000 games are running
    And one game's stored state is damaged
    When all players keep polling
    Then the damaged game returns a clean error
    And the other 999 games are unaffected

  @scale
  Scenario: The AI being down at scale still lets every game start
    Given 1000 lobbies each with 12 players
    And the text model is unreachable
    When every host starts the game
    Then all 1000 games start with the sample case
    And the starts finish within the target time

  @scale
  Scenario: Many slow local model requests are queued
    Given 50 hosts start a game at the same moment with a slow local model
    Then at most 3 model requests are in progress
    And the rest are queued or use the sample case
    And no host waits longer than the AI time limit

  @scale
  Scenario: A cell restart loses no confirmed action
    Given 200 games are running with the file store
    When the web process restarts
    Then every confirmed action is still in effect
    And the service is ready again within the target time

  @scale
  Scenario: Cleanup keeps up with expiry
    Given 2000 games expire in the same hour
    When the cleanup runs every 10 minutes
    Then no expired game remains after 30 minutes
    And no single cleanup run handles more than 500 games

  @scale @mobile
  Scenario: A phone on a slow connection keeps working
    Given a player on a phone with a slow connection
    When the connection drops for 20 seconds and returns
    Then the phone shows the last known state meanwhile
    And the phone catches up without the player doing anything
