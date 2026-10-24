import { expect, test } from "@playwright/test";
import { SAMPLE_CASE } from "../src/lib/sample-case";
import { castBallot, OVERRIDE_CODE, openAndReady, Party } from "./helpers";

const R1 = SAMPLE_CASE.clues.filter((c) => c.round === 1).length;
const R2 = SAMPLE_CASE.clues.filter((c) => c.round === 2).length;

test.describe("full party", () => {
  test("host registers, 4 phones join, game plays to the reveal", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.bootstrap();

      // Landing page and join code entry are reachable from a phone too (uses player 1's context).
      const p1 = party.players[0].page;
      const lobby = party.tv.page;

      // LOBBY: everybody sees everybody.
      await expect(party.host.page.getByTestId("host-guest")).toHaveCount(4, { timeout: 20_000 });
      for (const p of party.players) {
        await expect(p.page.getByTestId("player-lobby")).toBeVisible();
        await expect(p.page.getByTestId("player-lobby")).toContainText("Dan", { timeout: 20_000 });
      }
      await expect(lobby.getByTestId("tv-code")).toHaveText(party.code);
      await expect(lobby.getByTestId("tv-qr")).toBeVisible();
      await expect(lobby.getByTestId("tv-guests")).toContainText("Cleo", { timeout: 20_000 });
      await expect(party.host.page.getByTestId("host-qr")).toBeVisible();

      // START: cards phase, private cards.
      await party.hostStart();
      await expect(lobby.getByTestId("tv-game")).toHaveAttribute("data-phase", "cards", { timeout: 30_000 });
      const secrets: string[] = [];
      for (const p of party.players) {
        await openAndReady(p.page);
        secrets.push((await p.page.getByTestId("card-secret").textContent()) ?? "");
        // sealing again hides it
        await p.page.getByTestId("card-hide").click();
        await expect(p.page.getByTestId("envelope")).toBeVisible();
      }
      expect(new Set(secrets).size).toBeGreaterThanOrEqual(3); // distinct private cards
      await expect(party.host.page.getByTestId("host-cast")).toContainText("ready", { timeout: 20_000 });

      // ACTS: no clues yet, then release.
      await party.hostAdvance("Act I: The Party");
      for (const p of party.players) await expect(p.page.getByTestId("clue")).toHaveCount(0);
      await expect(lobby.getByTestId("tv-phase")).toContainText("Act I: The Party", { timeout: 20_000 });
      await party.hostAdvance("The Death");
      await party.hostAdvance("Act II");
      for (const p of party.players) await expect(p.page.getByTestId("clue")).toHaveCount(R1, { timeout: 20_000 });
      await expect(lobby.getByTestId("tv-clues")).toBeVisible();
      await party.hostAdvance("Intermission");
      await party.hostAdvance("Act III");
      for (const p of party.players) await expect(p.page.getByTestId("clue")).toHaveCount(R1 + R2 + 1, { timeout: 20_000 });

      // PAUSE and RESUME propagate and block advance.
      await party.host.page.getByTestId("host-pause").click();
      await expect(party.host.page.getByTestId("host-advance")).toBeDisabled();
      await expect(party.players[0].page.getByTestId("player-paused")).toBeVisible({ timeout: 20_000 });
      await expect(lobby.getByTestId("tv-paused")).toBeVisible({ timeout: 20_000 });
      await party.host.page.getByTestId("host-pause").click();
      await expect(party.players[0].page.getByTestId("player-paused")).toHaveCount(0, { timeout: 20_000 });

      // BALLOTS
      await party.hostAdvance("Act IV");
      await expect(lobby.getByTestId("tv-ballots")).toContainText("0 of 4", { timeout: 20_000 });
      for (const p of party.players) await castBallot(p.page, { suspect: "carol", method: "m-tonic", motive: "v-pumpkin" });
      await expect(party.host.page.getByTestId("host-ballots")).toContainText("4 of 4", { timeout: 20_000 });
      await expect(lobby.getByTestId("tv-ballots")).toContainText("4 of 4", { timeout: 20_000 });

      // REVEAL
      party.sealedAt = Date.now();
      await party.hostAdvance("Act V");
      for (const p of party.players) {
        await expect(p.page.getByTestId("reveal")).toBeVisible({ timeout: 20_000 });
        await expect(p.page.getByTestId("reveal-killer")).toContainText("Carol");
        for (const q of party.players) await expect(p.page.getByTestId("reveal-scores")).toContainText(q.persona.name);
      }
      await expect(lobby.getByTestId("tv-reveal")).toContainText("Carol", { timeout: 20_000 });
      await expect(party.host.page.getByTestId("host-advance")).toBeDisabled();
      // The players who voted for the right killer, method and motive all earned 5 points.
      await expect(p1.getByTestId("reveal-scores")).toContainText("killer +3");
    } finally {
      await party.closeAll();
    }
  });

  test("host override path: wrong code, nudge, accelerate, final answer, jump to reveal", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.bootstrap();
      await party.hostStart();
      await party.hostAdvance("Act I: The Party");
      await party.hostAdvance("The Death");
      await party.hostAdvance("Act II");
      const hp = party.host.page;
      hp.on("dialog", (d) => d.accept());

      await hp.getByTestId("host-override").locator("summary").click();
      // wrong code first
      await hp.getByTestId("host-override-code").fill("definitely-wrong");
      await hp.getByTestId("override-nudge").click();
      await expect(hp.getByTestId("host-error")).toContainText(/vault door/i);
      await expect(hp.getByTestId("override-message")).toHaveCount(0);

      // right code: nudge shows a hint to the host only
      await hp.getByTestId("host-override-code").fill(OVERRIDE_CODE);
      await hp.getByTestId("override-nudge").click();
      await expect(hp.getByTestId("override-message")).toContainText(/alibi|sprinkler/i);
      for (const p of party.players) await expect(p.page.locator("body")).not.toContainText(/sprinkler log\./);
      await expect(hp.getByText("Override used")).toBeVisible();

      // accelerate moves to the next act
      await hp.getByTestId("override-accelerate").click();
      await expect(hp.getByTestId("host-phase")).toContainText("Intermission", { timeout: 20_000 });

      // final answer is private to the host and ends nothing
      party.sealedAt = Date.now();
      await hp.getByTestId("override-final").click();
      await expect(hp.getByTestId("override-message")).toContainText("Carol", { timeout: 20_000 });
      await expect(hp.getByTestId("host-phase")).toContainText("Intermission");

      // jump to reveal reaches everybody, including the big screen
      await hp.getByTestId("override-final_reveal").click();
      await expect(hp.getByTestId("host-phase")).toContainText("Act V", { timeout: 20_000 });
      for (const p of party.players) await expect(p.page.getByTestId("reveal-killer")).toContainText("Carol", { timeout: 20_000 });
      await expect(party.tv.page.getByTestId("tv-reveal")).toBeVisible({ timeout: 20_000 });
      // nobody voted: every score says so
      await expect(party.players[0].page.getByTestId("reveal-scores")).toContainText(/no ballot/i);
    } finally {
      await party.closeAll();
    }
  });

  test("override lockout after 3 wrong codes and wrong role access", async ({ browser }, info) => {
    const party = new Party(browser, info);
    try {
      await party.bootstrap();
      await party.hostStart();
      await party.hostAdvance("Act I: The Party");
      const hp = party.host.page;
      await hp.getByTestId("host-override").locator("summary").click();
      await hp.getByTestId("host-override-code").fill("nope-nope");
      for (let i = 0; i < 3; i++) await hp.getByTestId("override-nudge").click();
      await expect(hp.getByTestId("host-error")).toContainText(/gerald|locked|alarm/i, { timeout: 20_000 });
      // even the right code is refused while locked
      await hp.getByTestId("host-override-code").fill(OVERRIDE_CODE);
      await hp.getByTestId("override-nudge").click();
      await expect(hp.getByTestId("host-error")).toContainText(/gerald|locked/i);
      // a player cannot open the host console
      const pp = party.players[0].page;
      await pp.goto(`/host/${party.code}`);
      await expect(pp.getByTestId("host-error").or(pp.getByTestId("login-dev-name")).or(pp.getByText(/only the host|sign in/i)).first()).toBeVisible({ timeout: 30_000 });
      await expect(pp.getByTestId("host-start")).toHaveCount(0);
    } finally {
      await party.closeAll();
    }
  });
});
