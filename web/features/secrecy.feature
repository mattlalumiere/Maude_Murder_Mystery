Feature: Secrecy of the solution
  The server holds the secrets. Truth never leaves it before the Reveal.

  Background:
    Given a started game with 4 adults and 2 kids using the sample case

  @smoke @security
  Scenario Outline: No view contains the truth before the Reveal
    When the "<view>" is read in the "<phase>" phase
    Then the view does not contain the killer
    And the view does not contain the method truth
    And the view does not contain the motive truth
    And the view does not contain the true story
    And the view does not contain any nudge or advanced hint
    And the view does not contain the override hash or salt

    Examples:
      | view   | phase        |
      | public | cards        |
      | public | act1         |
      | public | death        |
      | public | act2         |
      | public | intermission |
      | public | act3         |
      | public | act4         |
      | host   | cards        |
      | host   | act2         |
      | host   | act4         |
      | player | cards        |
      | player | act3         |
      | player | act4         |

  @security
  Scenario: A player sees only their own card
    When player "P1" reads their player view
    Then the view contains the card of the character played by "P1"
    And the view contains no other character's card

  @security
  Scenario: The big screen shows no private cards
    When the big screen reads the public view in the "act2" phase
    Then the view contains no card text for any character

  @security
  Scenario: Clues stay hidden until their round
    When the game is in the "act1" phase
    Then the public view contains no clues
    When the host advances to the "act2" phase
    Then the public view contains only round 1 clues
    And the twist is not visible
    When the host advances to the "act3" phase
    Then the public view contains the round 2 clues and the twist

  @security
  Scenario: A wrong token is refused
    When player "P1" reads the state with a wrong token
    Then the request is refused as unauthorized

  @security
  Scenario: The host cannot see the solution without the override code
    When the host reads the host view in the "act4" phase
    Then the host view does not contain the killer
    And the host view does not contain any player's card text
    And the host view does not show the content of any ballot

  @security
  Scenario: The host cannot reach the solution by any action without the override code
    When the host tries every host action except override in the "act4" phase
    Then no action response contains the killer, method or motive

  @security
  Scenario: Only the host can read the host view
    Given a second signed-in host who does not own the game
    When the second host reads the host view
    Then the request is refused as forbidden

  @security
  Scenario: Errors do not leak secrets
    When a request fails for any reason
    Then the error message contains no token, no override code, no solution text and no storage key

  @security
  Scenario: The state poll checks credentials before saying anything about the game
    When a caller without credentials polls the player view with a matching version number
    Then the request is refused as unauthorized
    And the response does not reveal the version number

  @security
  Scenario: After the Reveal only the reveal block adds truth
    When the host advances to the "reveal" phase
    Then the public view contains a reveal block with the killer, method, motive and story
    And no view contains any player's secret card text other than that player's own card
