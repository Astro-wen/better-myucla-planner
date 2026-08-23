## What this changes

<!-- One or two sentences. What is different for a student using the page? -->

## Why

<!-- The problem, not the solution. If it is a bug, what did the page do? -->

## How it was checked

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Ran the harness if anything visual changed, and said what I saw
- [ ] Verified against the live Class Planner (say how), if the adapter,
      reordering engine, or DOM contract changed

## Safety

- [ ] Does not click or automate Enroll, Drop, Remove, Exchange, or Waitlist
- [ ] Reads no credentials, cookies, tokens, UIDs, grades, DARS, or Duo data
- [ ] Adds no polling and no extra requests to MyUCLA
- [ ] Keeps the single exact Class Planner path in `manifest.json`
- [ ] Fails closed when the page does not match `docs/MYUCLA_CONTRACT.md`
- [ ] Contains no real course data, plans, or account content
