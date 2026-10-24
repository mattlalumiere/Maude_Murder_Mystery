// Story traits: a private flavour each player is cast with. Players keep their own name, age and pronouns;
// the story only adds a role and a trait. The bank is deliberately free of sexual-abuse or sex-work roles:
// this game is played with children in the room.
import { getRuntime } from "./ids";
import type { Character } from "./types";

export interface Trait { name: string; angle: string }

export const TRAITS_ADULT: Trait[] = [
  { name: "Gambler", angle: "owes money to someone at the party and is betting on tonight's outcome" },
  { name: "Engineer", angle: "takes everything apart to see how it works, including alibis" },
  { name: "Con artist", angle: "sold a fake something to a guest and hopes nobody checks" },
  { name: "Smuggler", angle: "has something in the car that really should not be there" },
  { name: "Blackmailer", angle: "knows a harmless-but-embarrassing secret about a guest and drops hints" },
  { name: "Secret heir", angle: "will inherit something big, and nobody knows yet" },
  { name: "Retired spy", angle: "cannot stop noticing exits, shoes and who is lying" },
  { name: "Jilted lover", angle: "is still carrying a torch for someone in the room" },
  { name: "Whistleblower", angle: "is about to expose something at the worst possible moment" },
  { name: "Failed novelist", angle: "is secretly writing everyone in the room into a bad mystery" },
  { name: "Master chef", angle: "judges every dish and every person's taste" },
  { name: "Scandalous flirt", angle: "flirts shamelessly with everyone and means none of it" },
  { name: "Bootlegger", angle: "has a secret stash that is definitely not just punch" },
  { name: "Fortune teller", angle: "predicts doom, loudly, and is right more often than is comfortable" },
  { name: "Disgraced doctor", angle: "lost a license over something silly and wants a second chance" },
  { name: "Treasure hunter", angle: "came for a map hidden somewhere in this house" },
  { name: "Insomniac", angle: "was awake all night and saw something odd" },
  { name: "Collector", angle: "wants one particular object in this house badly enough to scheme" },
  { name: "Gossip columnist", angle: "is here for a story and will print anything" },
  { name: "Pickpocket", angle: "has quietly borrowed three things since arriving" },
  { name: "Stage magician", angle: "uses misdirection in conversation as well as on stage" },
  { name: "Bounty hunter", angle: "is quietly looking for someone in this house" },
  { name: "Aspiring politician", angle: "shakes every hand and promises everything" },
  { name: "Competitive baker", angle: "has a feud over a blue ribbon that never ended" },
];

export const TRAITS_KID: Trait[] = [
  { name: "Prankster", angle: "has hidden a rubber snake somewhere and cannot wait for it to be found" },
  { name: "Secret inventor", angle: "is building a gadget in a shoebox and tests it on grown-ups" },
  { name: "Snack bandit", angle: "knows exactly where every snack is, and where some went" },
  { name: "Treasure-map keeper", angle: "guards a hand-drawn map that leads somewhere silly" },
  { name: "Animal whisperer", angle: "talks to the house pets and claims they talk back" },
  { name: "Hide-and-seek champion", angle: "hears and sees things because nobody ever finds them" },
  { name: "Budding magician", angle: "is practicing a trick and needs a volunteer" },
  { name: "Night owl", angle: "was supposed to be in bed and saw too much" },
  { name: "Junior reporter", angle: "interviews everyone with a pretend microphone" },
  { name: "Costume collector", angle: "has a disguise for every occasion in a backpack" },
];

export const TRAIT_MURDERER: Trait = { name: "Murderer", angle: "committed the crime tonight and must not be caught" };
export const TRAIT_MURDERED: Trait = { name: "Murdered", angle: "is about to make a spectacular exit and return as the Ghost Narrator" };
export const TRAIT_MASCOT: Trait = { name: "Royal mascot", angle: "is adored by everyone and is the room's good luck charm" };

const rnd = (n: number) => getRuntime().random.int(n);
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = rnd(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/** Gives every cast character a trait. The killer is the Murderer, the victim is Murdered, the rest are drawn without repeats. */
export function assignTraits(characters: Character[], killerId: string, victimId: string): void {
  const adults = shuffle(TRAITS_ADULT), kids = shuffle(TRAITS_KID);
  for (const c of characters) {
    if (c.id === killerId) c.trait = TRAIT_MURDERER.name;
    else if (c.id === victimId) c.trait = TRAIT_MURDERED.name;
    else if (c.role === "mascot") c.trait = TRAIT_MASCOT.name;
    else {
      const pool = c.kid ? kids : adults;
      const t = pool.length ? pool.shift()! : (c.kid ? TRAITS_KID : TRAITS_ADULT)[rnd((c.kid ? TRAITS_KID : TRAITS_ADULT).length)];
      c.trait = t.name;
    }
  }
}

export const traitAngle = (name: string | undefined): string => {
  if (!name) return "";
  return [TRAIT_MURDERER, TRAIT_MURDERED, TRAIT_MASCOT, ...TRAITS_ADULT, ...TRAITS_KID].find((t) => t.name === name)?.angle ?? "";
};
