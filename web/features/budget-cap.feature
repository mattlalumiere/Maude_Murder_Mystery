Feature: Budget cap
  Generated pictures and clips can never cost more than the host's cap.

  @smoke
  Scenario: A plan is trimmed to fit the cap
    Given I am a signed-in host
    When I create a game for 12 adults and 6 kids with a budget of 2 dollars and the "blockbuster" plan
    Then the game media plan costs no more than 85 percent of the budget

  @security
  Scenario: Spending never exceeds the cap
    Given a started game with a budget of 1 dollar and every image costing 0.30 dollars
    When the media worker runs until no jobs are left
    Then the spent amount plus the reserved amount is never above 1 dollar
    And the jobs that did not fit are marked "skipped"

  Scenario: Every generation goes through the spend check
    Given a started game with a budget of 5 dollars
    When the media worker runs one job
    Then the spend check was asked before the generation started

  Scenario: Failed jobs give their reservation back
    Given a started game with a budget of 5 dollars and an image model that fails
    When the media worker runs until no jobs are left
    Then the reserved amount is 0
    And the spent amount is 0

  Scenario: The host can pause media
    Given a started game with a budget of 5 dollars
    When the host pauses the media
    And the media worker runs one tick
    Then no new job starts

  Scenario: The cap cannot be lowered below what is spent
    Given a started game where 1.20 dollars is spent or reserved
    When the host sets the cap to 1 dollar
    Then the request is refused as a bad request
    And the cap is unchanged

  Scenario: The host can raise the cap during the game
    Given a started game with a budget of 1 dollar
    When the host sets the cap to 3 dollars
    Then the cap is 3 dollars

  Scenario: A local model is free but still counted
    Given a started game where the text and image models are local
    When the media worker runs until no jobs are left
    Then the spent amount is 0 dollars
    And the usage record shows the number of generations and tokens used

  Scenario: Players cannot change the budget
    Given a started game with a budget of 5 dollars
    When a player tries to change the media plan
    Then the request is refused

  Scenario: A game cannot spend more than its token limit
    Given a started game whose AI token limit is 1000 tokens
    When the text model reports 1200 tokens used
    Then further AI text requests for that game use the sample content
