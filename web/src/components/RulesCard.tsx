import { Card } from "@/components/kit";

/** The group's house rules. Shown on every phone and on the TV at the start so safety does not depend on the host remembering. */
export function rulesFor(drinking: "adults" | "none" | undefined): string[] {
  const base = [
    "Anyone can say \"Pass\" at any time. No reason needed, and nobody comments.",
    "Everything is fiction. Secrets are invented. Nobody is being roasted for real.",
  ];
  if (drinking === "none") {
    return [...base, "This is an alcohol-free game. For any drink prompt, everyone takes a snack bite or a sip of water or juice, or does a 3-second silly act (Snack or Silly)."];
  }
  return [
    ...base,
    "Drinks are optional. A water sip, a mocktail, or a 10-second silly act counts just as much. Sips only, no shots.",
    "Kids and toddlers never drink. They play Snack or Silly: a snack bite, a juice sip, or a 3-second silly act.",
    "Water round every few drinks. Please plan a designated driver.",
  ];
}

export function RulesCard({ drinking, big = false }: { drinking?: "adults" | "none"; big?: boolean }) {
  return (
    <Card title="House rules" data-testid="rules-card" style={{ marginTop: "var(--space-3)" }}>
      <ul style={{ margin: 0, paddingLeft: "1.2em", fontSize: big ? "1.4rem" : undefined, lineHeight: 1.5 }}>
        {rulesFor(drinking).map((r) => <li key={r}>{r}</li>)}
      </ul>
    </Card>
  );
}
