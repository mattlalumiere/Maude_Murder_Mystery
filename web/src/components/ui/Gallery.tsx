"use client";
import { useState } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Candle } from "./Candle";
import { Card } from "./Card";
import { Field } from "./Field";
import { Fog } from "./Fog";
import { PaperClue } from "./PaperClue";
import { Sheet } from "./Sheet";
import { Stack } from "./Stack";
import { ToastProvider, useToast } from "./Toast";
import { WaxSeal } from "./WaxSeal";

function Inner() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <main>
      <div style={{ position: "relative", padding: "var(--space-5) 0" }}>
        <Fog />
        <Stack direction="row" gap={4} style={{ position: "relative" }}>
          <Candle scale={1.4} />
          <div>
            <h1>Design gallery</h1>
            <p className="muted">Maude Murder Mystery, candle-lit noir.</p>
          </div>
        </Stack>
      </div>
      <Stack gap={5}>
        <Card title="Buttons">
          <Stack direction="row">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </Stack>
        </Card>
        <Card title="Secret role card" tone="secret"><p>Only you can see this. Do not show your screen.</p></Card>
        <PaperClue title="A torn ticket stub" label="Exhibit A" stamp="NEW" animateIn>
          <p>Found beneath the study rug. The date is smudged.</p>
        </PaperClue>
        <Stack direction="row" gap={4}>
          <WaxSeal mark="M" label="Maude seal" press />
          <WaxSeal mark="?" color="gold" onPress={() => toast.show("The seal creaks open.", "success")} label="Open seal" />
          <Badge>Neutral</Badge><Badge tone="gold">Detective</Badge><Badge tone="ghost">Ghost</Badge>
          <Badge tone="blood">Suspect</Badge><Badge tone="good">Cleared</Badge>
        </Stack>
        <Card title="Form">
          <Field label="Your name" hint="Shown on the big screen." required><input placeholder="Inspector Pickle" /></Field>
          <Field label="Room code" error="That code is not in the ledger."><input defaultValue="ABCX" /></Field>
        </Card>
        <Stack direction="row">
          <Button onClick={() => setOpen(true)}>Open sheet</Button>
          <Button variant="secondary" onClick={() => toast.show("A clue slides under the door.")}>Toast</Button>
          <Button variant="danger" onClick={() => toast.show("The lights flickered. Try again.", "error")}>Error toast</Button>
        </Stack>
      </Stack>
      <Sheet open={open} onClose={() => setOpen(false)} title="Accuse a suspect">
        <p>Choose carefully. You only get one accusation.</p>
        <Button block onClick={() => setOpen(false)}>Seal the accusation</Button>
      </Sheet>
    </main>
  );
}

export function Gallery() {
  return <ToastProvider><Inner /></ToastProvider>;
}
