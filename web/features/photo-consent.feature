Feature: Photo consent and deletion
  Photos are optional, consented, checked, short lived and private.

  Background:
    Given a game in the lobby with an adult player "Ada" and a kid player "Kit"

  @smoke @security
  Scenario: An adult uploads their own photo with consent
    When "Ada" uploads a valid JPEG with consent "self"
    Then the upload is accepted
    And "Ada" can view their own photo
    And the host view shows that "Ada" has a photo

  @security
  Scenario: Consent is required
    When "Ada" uploads a valid JPEG without a consent statement
    Then the request is refused as a bad request
    And the error code is "CONSENT_REQUIRED"
    And no photo is stored

  @security
  Scenario: A guardian must consent for anyone under 18
    When "Kit" uploads a valid JPEG with consent "self"
    Then the request is refused as a bad request
    When "Kit" uploads a valid JPEG with consent "guardian"
    Then the upload is accepted

  @security
  Scenario: A photo never appears in any view
    Given "Ada" has uploaded a valid JPEG with consent "self"
    When anyone reads the public, player and host views
    Then no view contains a photo key, a photo URL or photo bytes

  @security
  Scenario: Other players cannot fetch a photo
    Given "Ada" has uploaded a valid JPEG with consent "self"
    When "Kit" requests the photo of "Ada"
    Then the request is refused

  @security
  Scenario: The big screen cannot fetch a photo
    Given "Ada" has uploaded a valid JPEG with consent "self"
    When the big screen requests any photo
    Then the request is refused

  @security
  Scenario: Photos are not served by the generated media route
    Given "Ada" has uploaded a valid JPEG with consent "self"
    When anyone requests the media route with a photo's storage key
    Then the response is not found

  @security
  Scenario: Only JPEG files within the size limit are accepted
    When "Ada" uploads a PNG with consent "self"
    Then the request is refused as an unsupported media type
    When "Ada" uploads a JPEG larger than 2 megabytes with consent "self"
    Then the request is refused as too large

  @security
  Scenario: A photo that fails the safety check is not stored
    Given the photo safety check will reject the next photo
    When "Ada" uploads a valid JPEG with consent "self"
    Then the request is refused as unprocessable
    And no photo is stored

  Scenario: A player can delete their photo
    Given "Ada" has uploaded a valid JPEG with consent "self"
    When "Ada" removes their photo
    Then no photo remains for "Ada"
    And the consent of "Ada" is "none"

  Scenario: The host can delete every photo
    Given "Ada" and "Kit" have uploaded photos
    When the host purges all photos
    Then no photo remains in storage for the game
    And no player has a photo

  Scenario: Photos can only be added before the party starts
    Given the game has started
    When "Ada" uploads a valid JPEG with consent "self"
    Then the request is refused as a conflict

  Scenario: Photos expire after one day
    Given "Ada" has uploaded a valid JPEG with consent "self"
    When 24 hours and 1 minute pass
    Then no photo remains in storage for the game

  Scenario: Deleting the game deletes the photos
    Given "Ada" has uploaded a valid JPEG with consent "self"
    When the host deletes the game
    Then no object remains in storage for the game
