Feature: The Reveal
  The final phase shows the truth to everyone at once.

  Background:
    Given a started game with 4 adults and 2 kids using the sample case

  @smoke
  Scenario: The Reveal shows the whole solution to everyone
    Given the game is in the "act4" phase
    When the host advances to the "reveal" phase
    Then the public view shows the killer's character name
    And the public view shows the method, the motive and the true story
    And the public view shows the scores and the awards
    And the player view and the host view show the same reveal

  @security
  Scenario: The truth is not available one step before the Reveal
    When the game is in the "act4" phase
    Then no view contains the reveal block

  Scenario: Ballots close at the Reveal
    Given the game is in the "act4" phase
    When the host advances to the "reveal" phase
    Then ballots are closed
    And a late ballot is refused

  Scenario: Nothing follows the Reveal
    Given the game is in the "reveal" phase
    When the host advances the game
    Then the request is refused as a conflict

  Scenario: Awards are given
    Given the game is in the "reveal" phase
    Then the awards include "Detective of the Night", "Best Liar" and "Most Dramatic Death"
    And every award names a player who is in the game

  Scenario: The host can jump to the Reveal with the override code
    Given a host override code "hunter2"
    When the host sends the override command "FINAL_REVEAL" with code "hunter2" and confirms
    Then the game is in the "reveal" phase

  Scenario: A paused game cannot advance
    Given the game is paused in the "act2" phase
    When the host advances the game
    Then the request is refused as a conflict
    And the error code is "PAUSED"

  Scenario: Raw photos are gone by the Reveal
    Given every player uploaded a consented photo before the game started
    When the host advances to the "reveal" phase
    Then no raw photo remains in storage

  @mobile
  Scenario: The big screen is readable from across the room
    Given the big screen is 1920 by 1080 pixels
    When the game reaches the "reveal" phase
    Then the killer's name is shown in text at least 48 pixels tall
