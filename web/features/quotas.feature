Feature: Quotas
  Every game and every client has limits so that no one can crowd out the others.

  @smoke @security
  Scenario: A game has a maximum number of players
    Given a game in the lobby with the player limit of 40
    When 41 guests join one after another
    Then the first 40 joins succeed
    And the 41st join is refused with the error code "GAME_FULL"

  @security
  Scenario: Too many requests are slowed down
    Given a started game
    When one client sends 200 state requests in one minute
    Then some of the requests are refused as too many requests
    And each refusal says how many seconds to wait
    And other clients of the same game are still served

  Scenario: Rate limit information is on every response
    Given a started game
    When a client polls the state
    Then the response includes the rate limit, the remaining requests and the seconds until reset

  Scenario: A normal party never hits the limit
    Given a started game with 20 players who each poll every 2 seconds for 10 minutes
    Then no request is refused as too many requests

  @security
  Scenario: A game has a storage limit
    Given a game that has used its storage limit
    When a player uploads another photo
    Then the request is refused with the error code "QUOTA_STORAGE"
    And the game state is still readable and playable

  @security
  Scenario: A game cannot exceed its AI spend
    Given a game that has reached its spend cap
    When the media worker runs
    Then no new AI generation starts

  @security
  Scenario: A game cannot exceed its AI token limit
    Given a game that has reached its token limit
    When the host starts a regenerated case
    Then the sample case is used

  @security
  Scenario: A host has a daily limit on new games
    Given a signed-in host who created 10 games today
    When the host creates another game
    Then the request is refused with the error code "QUOTA_HOST_GAMES"

  @security
  Scenario: Oversized requests are refused
    When a client sends a request body larger than 1 megabyte to the action endpoint
    Then the request is refused as too large

  @security
  Scenario: Guessing join codes is slowed down
    When one client looks up 100 different codes in one minute
    Then the client is refused as too many requests before reaching 100

  Scenario: A cell refuses new games when full
    Given a cell that already holds its hard maximum of games
    When a host creates a game
    Then the request is refused as unavailable
    And all existing games in the cell keep working
