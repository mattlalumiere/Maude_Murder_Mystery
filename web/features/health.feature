Feature: Health checks
  Operators can tell whether a pod is alive and whether it can serve games.

  @smoke
  Scenario: Liveness is always ok
    When I request the liveness endpoint
    Then the response is successful
    And the response says the status is "ok"

  @smoke
  Scenario: Readiness is ok when storage works
    When I request the readiness endpoint
    Then the response is successful
    And the response says the status is "ready"

  Scenario: Readiness fails when storage is down
    Given the state store is unreachable
    When I request the readiness endpoint
    Then the response is "service unavailable"
    And the response says the status is "not_ready"

  Scenario: Readiness does not depend on the AI
    Given the text model is unreachable
    When I request the readiness endpoint
    Then the response is successful

  @security
  Scenario: Health endpoints reveal nothing about games
    When I request the liveness and readiness endpoints
    Then neither response contains a join code, a player name or a game identifier
