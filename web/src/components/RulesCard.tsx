import { Card } from "@/components/kit";

type Drinking = "adults" | "heavy" | "none";

/** The group's house rules. Shown on every phone and on the TV at the start so safety does not depend on the host remembering. */
export function rulesFor(drinking: Drinking | undefined): string[] {
  const base = [
    "Anyone can say \"Pass\" at any time. No reason needed, and nobody comments.",
    "Everything is fiction. Secrets are invented. Nobody is being roasted for real.",
  ];
  if (drinking === "none") {
    return [...base, "This is an alcohol-free game. For any drink prompt, everyone takes a snack bite or a sip of water or juice, or does a 3-second silly act (Snack or Silly)."];
  }
  if (drinking === "heavy") {
    return [
      ...base,
      "Heavy drinking night, for grown-ups who opted in. A drink prompt means a real drink, and it is your own choice every time: tap out with no penalty, no questions.",
      "Everyone has a personal limit. The game stops prompting you at it and tells you to switch to water. Mocktails count the same as drinks.",
      "Two drinks in 15 minutes is the most the game will log. There is a water and snack break in the middle, and the host can pause everything.",
      "Kids, teens, and little ones never take part. They play Snack or Silly. Nobody drives: arrange rides before the first toast.",
    ];
  }
  return [
    ...base,
    "Drinks are optional. A water sip, a mocktail, or a 10-second silly act counts just as much. Sips only, no shots.",
    "Kids and toddlers never drink. They play Snack or Silly: a snack bite, a juice sip, or a 3-second silly act.",
    "Water round every few drinks. Please plan a designated driver.",
  ];
}

export function RulesCard({ drinking, big = false }: { drinking?: Drinking; big?: boolean }) {
  return (
    <Card title="House rules" data-testid="rules-card" style={{ marginTop: "var(--space-3)" }}>
      <ul style={{ margin: 0, paddingLeft: "1.2em", fontSize: big ? "1.4rem" : undefined, lineHeight: 1.5 }}>
        {rulesFor(drinking).map((r) => <li key={r}>{r}</li>)}
      </ul>
    </Card>
  );
}
