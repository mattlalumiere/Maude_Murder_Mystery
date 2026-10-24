Feature: Host Override Code
  The host can ask the Game Master for help with a private code. Wrong guesses lock the vault.

  Background:
    Given a started game in the "act2" phase with override code "hunter2"

  @smoke @security
  Scenario: The right code gives a nudge
    When the host sends the override command "NUDGE" with code "hunter2"
    Then the host receives a nudge message
    And the game records that an override was used

  @security
  Scenario: A wrong code is refused
    When the host sends the override command "NUDGE" with code "wrong"
    Then the request is refused as forbidden
    And the error code is "OVERRIDE_DENIED"
    And the game still shows no override used

  @security
  Scenario: Three wrong codes lock overrides for 10 minutes
    When the host sends the override command "NUDGE" with code "wrong" 3 times
    Then the third attempt is refused as too many requests
    And the error code is "OVERRIDE_LOCKED"
    And the host view shows overrides locked for 10 minutes

  @security
  Scenario: The right code does not work while locked
    Given overrides are locked
    When the host sends the override command "NUDGE" with code "hunter2"
    Then the request is refused as too many requests
    And the error code is "OVERRIDE_LOCKED"

  @security
  Scenario: The lock is remembered after the failure
    Given the host sent 3 wrong codes
    When the game state is read again from storage
    Then overrides are still locked

  @security
  Scenario: The lock ends after 10 minutes
    Given overrides are locked
    When 10 minutes and 1 second pass
    And the host sends the override command "NUDGE" with code "hunter2"
    Then the host receives a nudge message

  @security
  Scenario: A correct code resets the count of wrong attempts
    Given the host sent 2 wrong codes
    When the host sends the override command "NUDGE" with code "hunter2"
    And the host sends the override command "NUDGE" with code "wrong"
    Then the request is refused as forbidden
    And overrides are not locked

  @security
  Scenario: Three wrong codes sent at the same moment still lock
    When 5 wrong codes are sent at the same moment
    Then overrides are locked

  @security
  Scenario: Ending the mystery needs confirmation
    When the host sends the override command "FINAL" with code "hunter2" without confirming
    Then the host is asked to confirm
    And the host does not receive the killer
    When the host sends the override command "FINAL" with code "hunter2" and confirms
    Then the host receives the killer, method, motive and story

  Scenario: Fast forward moves to the next phase
    When the host sends the override command "ACCELERATE" with code "hunter2"
    Then the game is in the "intermission" phase

  Scenario: The advanced hint costs the host's detective license
    When the host sends the override command "ADVANCED" with code "hunter2"
    Then the message says the host forfeits the Detective of the Night award

  @security
  Scenario: The override code is never exposed
    When the host sends the override command "NUDGE" with code "hunter2"
    Then no view, response, log line or model prompt contains "hunter2"
    And the stored game does not contain "hunter2" in plain text

  Scenario: Players cannot use overrides
    When a player sends the override command "NUDGE" with code "hunter2"
    Then the request is refused as forbidden
