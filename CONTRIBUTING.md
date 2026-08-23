# Contributing

Anyone can open a pull request. Nobody can merge one except the maintainer, so
a PR is a proposal, not a change.

## How a change actually lands

1. You fork the repo and push a branch to your fork.
2. You open a pull request against `main`.
3. CI runs `npm run typecheck`, `npm test`, and `npm run build` on your branch.
4. The maintainer reads it and either merges, asks for changes, or closes it.

You cannot push to `main` and you cannot merge your own PR. If a PR touches the
safety rules below it will be closed rather than negotiated.

## Before you open one

```bash
npm install
npm run typecheck
npm test
npm run build
```

All three must pass. If you changed anything visual, also run the offline
harness and say what you saw. It needs a browser once:

```bash
npx playwright install chromium
```

```bash
node harness/run.mjs default   # the class list as MyUCLA draws it
node harness/run.mjs tidy      # the same list with the optional layout switch on
node harness/run.mjs drag      # drag #14 to #1, holding at the top edge
```

The harness runs the built extension against an invented Class Planner under
headless Chromium, so you can check layout and motion without a UCLA account.

Read `README.md` first, then `HANDOFF.md` for the architecture and the traps
that have already been paid for.

## Rules a pull request cannot break

These are in `AGENTS.md` too, and they are not up for discussion:

- Never click or automate Enroll, Drop, Remove, Exchange, or Waitlist.
- Never request, inspect, log, or store passwords, cookies, tokens, UIDs,
  grades, DARS, or Duo data.
- No polling and no extra requests to MyUCLA.
- Keep the single exact Class Planner path in `manifest.json`. Do not broaden
  the match to all of MyUCLA.
- Reordering goes through MyUCLA's own up and down buttons, validated against
  the contract in `docs/MYUCLA_CONTRACT.md`, and keeps the user's confirmation.
- When the page does not match that contract, fail closed. Never replace an
  exact check with fuzzy button matching.
- Never put real course names, plans, screenshots, or account content into
  fixtures, tests, logs, or commits. The harness fixture is entirely invented;
  keep it that way.

## Two things that are easy to get wrong

**MyUCLA's own markup is opt-in.** Our injected controls are ours to design.
MyUCLA's markup is what students already have in their hands, so restyling it
lives behind the "tidy up MyUCLA's own layout" switch, off by default. This was
learned the hard way in 0.10.0 and reverted in 0.10.1. A PR that turns it on by
default will not be merged.

**Anything that touches the live page needs evidence.** If you change the
adapter, the reordering engine, or the contract, say in the PR how you verified
it and against what. A change that only passes unit tests is not verified.

## Reporting a bug

Say what you did, what the plan looked like (how many classes, expanded or
collapsed), what you expected, and what happened. Redact your own course data;
class subjects are fine, anything identifying is not. A screenshot with names
and IDs blurred out is worth more than a paragraph.

## Scope

This is a UI layer for one page. Requests to add enrollment automation, seat
watching, grade or DARS integration, or anything that needs credentials are out
of scope permanently, not "not yet".
