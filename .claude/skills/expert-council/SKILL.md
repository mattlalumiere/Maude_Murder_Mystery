---
name: expert-council
description: Convene a council of three domain experts, chosen dynamically for the current project, to assess progress against an objective the user states at request time. Use when the user asks for an expert review, a council, a progress assessment, a second opinion, a readiness check, or "are we on track".
---

# Expert Council

A repeatable, project-agnostic review. Three experts are picked fresh for the project in front of you, each assesses it independently against the user's objective, and a chair synthesizes one honest verdict and a prioritized plan.

## Step 1: Get the objective (always ask at request time)

If the user's request does not already state an objective, ask for it before doing anything else. One question, with these options plus free text:

- **Overall progress:** how far along are we and what is the biggest gap?
- **Launch readiness:** could we run this for real users or a real event now?
- **Security, privacy, and safety:** what could hurt people or leak data?
- **Cost and scale:** will this hold up and stay affordable?
- **Product and user experience:** will the intended audience love it?
- **Architecture and maintainability:** can we keep building on this?
- **Something else:** the user describes it.

Also ask for any constraints or audience that change the verdict (budget, deadline, who will use it), but accept "none". If you cannot ask (non-interactive run), state the objective you assumed in the first line of the report.

Never reuse a previous objective silently. Each request gets its own.

## Step 2: Survey the project (read-only)

Gather evidence before choosing experts:

- Read `README`, `AGENTS.md` or `CLAUDE.md`, docs folders, and package or build manifests.
- Check `git log` (last ~20 commits), `git status`, and the diff of uncommitted work. Note that uncommitted changes may come from someone else; assess what is on disk and say so.
- List the main directories and tests.
- Run cheap, safe verification the project already defines (typecheck, unit or smoke tests, lint). Record the exact command and result. Never deploy, push, install global tools, call paid APIs, or touch production.
- Look for a prior report in `docs/council/`. If one exists, read the latest and report the change since then.

Keep a short **evidence list** (file paths with line numbers, command outputs). Experts must cite it.

## Step 3: Choose the council

Pick exactly three experts for this project and objective. Derive them from the project's domain, technology, audience, and biggest risks. Do not use a fixed roster. Rules:

1. **Complementary lenses.** One expert for the domain or product (who it is for and whether it works for them), one for engineering (how it is built and whether it holds), and one for the biggest risk to the objective (security, safety, privacy, cost, legal, accessibility, reliability, whichever matters most here). The risk expert is the designated skeptic.
2. **Roles, not real people.** Give each a title and a one-line reason ("Family game designer, because the audience spans ages 1 to 70").
3. **Specific enough to be useful.** "Serverless cost engineer" beats "cloud expert".
4. **Objective-driven.** A launch-readiness review needs an operator; a cost review needs a FinOps voice; a product review needs a user-research voice.

Announce the roster before assessing, in a table: role, why chosen, lens, and the three questions that expert will try to answer.

Illustrative examples (not a fixed list):

| Project | Possible council |
|---|---|
| Party game with AI media and photos of kids | Family game designer, serverless and AI cost engineer, child-safety and privacy officer |
| Mobile fitness app | Behavior-change product designer, mobile engineer, health-data privacy counsel |
| Internal data pipeline | Data platform architect, SRE, data governance lead |
| Open-source CLI | Developer-experience lead, maintainer, supply-chain security reviewer |

## Step 4: Independent assessments

Each expert assesses on their own, from their lens, against the stated objective.

- **If a subagent tool is available**, spawn three read-only agents in parallel, one per expert, so opinions are independent. Give each: the objective, constraints, the role and lens, the evidence list, the repo path, and the output format below. Tell them not to modify files, deploy, or spend money.
- **If not**, reason through the experts one at a time, keeping their lenses distinct, and state that independence was simulated.

Each expert returns, in this format:

```
ROLE: <title>
SCORE vs objective: <1-5> (1 = far off, 3 = partially there, 5 = ready), with one-sentence rationale
STRENGTHS (up to 3): <point> [evidence]
RISKS (up to 5, highest first): <risk> | severity High/Med/Low | <evidence> | <consequence>
RECOMMENDATIONS (ranked): <action> | effort S/M/L | <why it moves the objective>
UNVERIFIED: <things I could not confirm and what would confirm them>
```

Hard rules for experts:

- Every claim is labeled **Verified** (seen in code or run output), **Inferred** (reasonable from evidence), or **Unknown**. Prefer Verified.
- Cite `path:line` or a command and its output. No evidence, no claim.
- Do not praise to be polite. Do not invent problems to look thorough.
- Separate what exists from what the docs say exists. Docs can be ahead of the code.
- Never report a test as passing unless it was run in this review.

## Step 5: Chair's synthesis

The chair (you) merges the three reports into one answer. Keep the main body to about one page.

1. **Objective and roster** (one line each).
2. **Verdict:** Ready / Not yet / Off track for the objective, with the three most important reasons.
3. **Scorecard:** table of each expert's score, the average, and the trend versus the last report if one exists.
4. **Where the experts agree.**
5. **Where they disagree,** stating both positions and which evidence would settle it. Do not average away a real disagreement.
6. **Prioritized plan:** Now (blocks the objective), Next (high value), Later. Each item has effort and an owner suggestion where obvious.
7. **Unverified and untested:** a plain list. If nothing was run, say so.
8. **What would change this verdict.**

Then include each expert's full report as an appendix.

## Step 6: Wrap up

- Offer to save the report to `docs/council/YYYY-MM-DD-<objective-slug>.md` so the next council can measure progress. Save only if the user agrees.
- Offer to turn the "Now" items into tasks. Do not start changing code unless asked.
- Follow the project's own conventions from `AGENTS.md` or `CLAUDE.md` for style and wording (for example, no em dashes if the project forbids them).

## Quality bar

- The objective drives everything: roster, questions, scores, and plan.
- A good council surprises the team at least once with something they had not weighed.
- Honest "Not yet" beats a comfortable "Ready".
- If the evidence is thin, say the council cannot judge that area rather than guessing.
