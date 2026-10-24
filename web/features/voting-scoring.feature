Feature: Voting and scoring
  Players accuse a killer, a method and a motive in Act IV. Points are awarded at the Reveal.

  Background:
    Given a started game with 4 adults and 2 kids using the sample case

  @smoke
  Scenario: Ballots open only in Act IV
    When the game is in the "act3" phase
    Then ballots are closed
    When the host advances to the "act4" phase
    Then ballots are open
    And the ballot options list suspects, methods and motives

  Scenario: A player casts a valid ballot
    Given the game is in the "act4" phase
    When player "P1" votes for the correct killer, method and motive
    Then the ballot is accepted
    And the public ballots-in count is 1
    And no view shows what player "P1" voted for to anyone else

  Scenario: A ballot outside Act IV is refused
    Given the game is in the "act2" phase
    When player "P1" votes for any suspect
    Then the request is refused as a conflict
    And the error code is "BALLOTS_CLOSED"

  Scenario: A ballot with an unknown option is refused
    Given the game is in the "act4" phase
    When player "P1" votes with a killer id that does not exist
    Then the request is refused as a bad request
    And the error code is "INVALID_BALLOT"

  Scenario: Kid characters and the victim are not suspects
    Given the game is in the "act4" phase
    Then the ballot suspects contain no kid character
    And the ballot suspects do not contain the victim

  Scenario: A player can change their ballot until voting closes
    Given the game is in the "act4" phase
    And player "P1" has voted for a wrong killer
    When player "P1" votes for the correct killer, method and motive
    Then player "P1" has exactly one ballot
    And that ballot names the correct killer

  Scenario: Voting needs the player's own token
    Given the game is in the "act4" phase
    When someone votes as player "P1" with the token of player "P2"
    Then the request is refused as unauthorized

  Scenario Outline: Points for each correct part of the accusation
    Given the game is in the "act4" phase
    And player "P1" votes with killer <killer>, method <method> and motive <motive>
    When the host advances to the "reveal" phase
    Then player "P1" scores <points> points

    Examples:
      | killer  | method  | motive  | points |
      | correct | correct | correct | 5      |
      | correct | wrong   | wrong   | 3      |
      | correct | correct | wrong   | 4      |
      | wrong   | correct | correct | 2      |
      | wrong   | wrong   | wrong   | 0      |

  Scenario: Not voting scores nothing
    Given the game is in the "act4" phase
    When the host advances to the "reveal" phase
    Then every player without a ballot scores 0 points
    And their score detail says "no ballot"

  Scenario: The killer earns a bonus for getting away with it
    Given the game is in the "act4" phase
    And fewer than half of the ballots name the killer
    When the host advances to the "reveal" phase
    Then the player who played the killer scores 5 bonus points

  Scenario: No bonus when most players found the killer
    Given the game is in the "act4" phase
    And at least half of the ballots name the killer
    When the host advances to the "reveal" phase
    Then the player who played the killer scores no bonus points

  Scenario: Scores are listed from highest to lowest
    Given the game is in the "act4" phase
    And several players have voted differently
    When the host advances to the "reveal" phase
    Then the scores are sorted from highest to lowest
