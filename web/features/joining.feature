Feature: Joining a game
  Guests join with a short code and a name, with no account.

  Background:
    Given a game in the lobby

  @smoke @mobile
  Scenario: A guest joins with the code and a name
    When a guest named "Ada" with age group "adult" joins using the code
    Then the join succeeds
    And the guest receives a player id and a private token
    And the lobby lists "Ada"

  Scenario: The join code is not case sensitive
    When a guest named "Ben" joins using the code in lower case
    Then the join succeeds

  Scenario: A name is required
    When a guest named "   " with age group "adult" joins using the code
    Then the request is refused as a bad request

  Scenario: Names are limited to 24 characters
    When a guest named "A name that is far longer than twenty four characters" joins using the code
    Then the join succeeds
    And the guest name is 24 characters long

  Scenario: Two guests cannot share a name
    Given a guest named "Cleo" has joined
    When a guest named "cleo" with age group "kid" joins using the code
    Then the request is refused as a conflict
    And the error code is "NAME_TAKEN"

  Scenario: An unknown code is refused
    When a guest named "Dan" joins using the code "ZZZZ"
    Then the request is refused as not found

  Scenario: An invalid age group is refused
    When a guest named "Eve" with age group "wizard" joins using the code
    Then the request is refused as a bad request

  Scenario: A full game refuses more guests
    Given the game already has 40 players
    When a guest named "Latecomer" joins using the code
    Then the request is refused as a conflict
    And the error code is "GAME_FULL"

  Scenario: Nobody can join after the game starts
    Given the game has 4 players including 2 adults
    And the host has started the game
    When a guest named "Fay" joins using the code
    Then the request is refused as a conflict
    And the error code is "GAME_STARTED"

  @security
  Scenario: A token is shown once and never appears in any view
    Given a guest named "Gus" has joined
    When anyone reads the public, player and host views
    Then no view contains the token of "Gus"

  @security
  Scenario: Backstory text is treated as plain text
    When a guest named "Hal" joins with the backstory "<script>alert(1)</script>"
    Then the join succeeds
    And the backstory is stored as the same plain text
    And the backstory is limited to 600 characters

  Scenario: The host can add a guest who has no device
    When the host adds a guest named "Grandma" with age group "adult"
    Then the lobby lists "Grandma"
    And "Grandma" is marked as having no device

  @mobile
  Scenario: A guest on a small phone can join with thumb-sized controls
    Given a guest on a phone with a 360 pixel wide screen
    When the guest opens the join page for the code
    Then every control on the page is at least 44 pixels tall
    And the page does not scroll sideways
