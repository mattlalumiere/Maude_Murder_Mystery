// Adults-only "unfiltered" mode: a room with no one under 18, where the host has confirmed that, and where the tone is dark,
// taboo and Cards Against Humanity crude. Everything stays fiction among consenting adults.
// Hard limits that never change in any mode: no sexual abuse or sexual violence, nothing involving minors, no slurs or hate,
// no real people, no pressure to drink. The chat filter and every model prompt below carry those limits.
import type { Room } from "./types";
import type { Trait } from "./traits";

export const isAdultsOnly = (room: Pick<Room, "config">) => room.config.adultsOnly === true;

export const ADULT_HARD_LIMITS = "Never include sexual abuse or sexual violence (no rape, molestation or assault), anything involving minors, slurs or hate toward real groups, real people, or pressure on anyone to drink.";

/** Added to model prompts when the room is adults only. */
export const ADULT_TONE = `ADULTS ONLY: this room has no one under 18 and the host confirmed it. Write dark, taboo, Cards Against Humanity style comedy: crude, absurd, shameless, with raunchy innuendo, profanity, scandal, vice and bad decisions played for laughs. Secrets may be about affairs, sex work, kinks, crime, addiction-adjacent vices and gross habits, all clearly fictional and cartoonish. ${ADULT_HARD_LIMITS}`;

export const TRAITS_TABOO: Trait[] = [
  { name: "Escort", angle: "is here on the clock and is far too good at reading people's secrets" },
  { name: "Dominatrix", angle: "runs a very discreet dungeon and recognizes at least two guests from it" },
  { name: "Adult film star", angle: "has a stage name that three guests have definitely searched for" },
  { name: "Brothel madam", angle: "owns a business that half the room has quietly visited" },
  { name: "Gigolo", angle: "was paid to be here by someone who is now avoiding eye contact" },
  { name: "Cam model", angle: "streams live from the bathroom whenever the party gets boring" },
  { name: "Phone-sex operator", angle: "has the most soothing voice in the room and uses it to extract secrets" },
  { name: "Swinger", angle: "has a membership card, a hot tub and an open invitation for the whole room" },
  { name: "Serial cheater", angle: "has a different excuse for each of three people who are all in this house" },
  { name: "Professional mistress", angle: "is carrying on with someone's spouse and has the receipts" },
  { name: "Drug dealer", angle: "supplied half the party and keeps a ledger of who owes what" },
  { name: "Cult leader", angle: "is quietly recruiting and has already sold a robe to a guest" },
  { name: "Arms dealer", angle: "brought samples in a violin case and a very polite smile" },
  { name: "Hitman", angle: "has a list, a day job in dentistry and a deep fear of mess" },
  { name: "Embezzler", angle: "has been skimming from the host's charity and bought a very tacky boat" },
  { name: "Sleazy landlord", angle: "has hidden cameras nobody has found yet, in a house that is not even theirs" },
  { name: "Disgraced televangelist", angle: "is doing a comeback tour and a lot of confessing to the wrong people" },
  { name: "Pyramid-scheme queen", angle: "has sold shakes to half the room and the other half owe her money" },
  { name: "Pill-popping surgeon", angle: "operates best when slightly impaired and has regrets about one nose" },
  { name: "Hoarder of compromising photos", angle: "keeps a vault of blackmail and a very unhealthy relationship with cloud storage" },
  { name: "Trust-fund degenerate", angle: "has never worked, has been banned from two countries, and owes someone here a yacht" },
  { name: "Professional mourner", angle: "cries at any event for cash and is suspiciously dry-eyed tonight" },
];

/** Adult-only template pools used when no AI is available. {N}, {they}, {their}, {has}, {lover}, {other} are filled in. */
export const EARLY_TABOO = [
  "{N} was raised in a roadside motel by a family of failed psychics and learned to tell lies from the free breakfast.",
  "{N} was expelled from three schools and a convent, and the convent was the one that hurt.",
  "{N} grew up above a bar that was technically a funeral home and learned everything about people and nothing about boundaries.",
  "At sixteen, {N} ran away with a traveling carnival and returned two years later with a tattoo, a debt and a parrot that swears.",
  "{N} was voted Most Likely to Be Arrested, and has been working hard ever since to make the yearbook proud.",
];
export const LOVE_TABOO = [
  "{N} has been married four times, twice to the same {lover}, and one ex is still on the payroll for reasons nobody will explain.",
  "{N} had a steamy affair with a {lover} that ended in a hot tub, a lawsuit and a very awkward group chat.",
  "{N} still sends flirty voice notes to an ex {lover} and, worse, sometimes gets replies. Lately {other} has been getting copied.",
  "{N} once got caught in a compromising position with a {lover} and a casserole, and blames the casserole.",
  "{N}'s dating history reads like a crime report. {other} is rumored to be entry number nine.",
];
export const HOBBY_TABOO = [
  "{N} runs a very successful, very questionable OnlyFans for feet-adjacent knitwear.",
  "Weekends are for karaoke at a bar that does not close, and leaving through the kitchen.",
  "{N} collects other people's secrets and trades them like baseball cards.",
  "{N} brews a homemade liquor that has been banned in two counties and is called, affectionately, Regret.",
  "{N} hosts a very private book club that has never once discussed a book.",
];
export const AMBITION_TABOO = [
  "{N} dreams of running a scandalous empire from a yacht and being investigated by multiple governments.",
  "{N} wants to win an award for something deeply inappropriate and accept it in a robe.",
  "{N} plans to write a tell-all that ruins at least four people in this room.",
  "{N} is saving up for a legal loophole and a very tall hat.",
  "{N} secretly hopes to be arrested, but only for something glamorous.",
];

export const DRINK_TABOO: { title: string; text: string[]; units: number; scope: "all" | "targets"; count?: number }[] = [
  { title: "Never have I ever (filthy edition)", units: 1, scope: "all", text: ["Everyone drinks if they have ever sent a text to the wrong person, and it was spicy.", "Everyone who has ever lied on a dating profile drinks. Be honest, or drink twice."] },
  { title: "Confessions", units: 1, scope: "targets", count: 2, text: ["{who}: drink, then confess your worst fictional crime to the room.", "{who}: drink, then tell us the most inappropriate thing your character has ever done."] },
];

export const adultTemplates = { early: EARLY_TABOO, love: LOVE_TABOO, hobby: HOBBY_TABOO, ambition: AMBITION_TABOO };
