# Re-capturing the MyUCLA page contract

The structure and single-step reordering behaviour were verified against the
live page on 2026-08-19, and re-verified on 2026-08-22. The contract in use is
`MYUCLA_CONTRACT.md`. This file is the recipe for redoing that capture after
MyUCLA changes its markup, because when the contract stops matching the
extension fails closed and simply stops working.

Nothing here needs an account, a password, a cookie, a token, a UID, grades,
DARS, or a full page dump. It needs the minimum below and no more.

## 1. The page, and how it behaves

- The Class Planner path. Replace any query-parameter *values* with `<redacted>`.
- Whether the class list is inside an iframe. If it is, record only that
  iframe's origin and path.
- Whether one click on the native move-up button does a partial postback or a
  full navigation.

## 2. Three class cards

In the DevTools Elements panel, select the first card, one from the middle, and
the last. Copy the minimum `outerHTML` for each, keeping only:

- the list container and the card wrapper;
- whatever attribute stably identifies a class or a section;
- the move-up and move-down buttons and their nearest ancestor `form`;
- those buttons' `id`, `class`, `name`, `type`, `value`, `aria-*`, `disabled`,
  `href`;
- the form's `method` and its redacted `action`.

Delete names, UIDs, email addresses, grades, hidden identity fields, token
values, page scripts, and unrelated regions. When unsure about a value, replace
the whole value with `<redacted>` but keep the attribute name.

## 3. A summary of one manual move

Open the Network panel, tick Preserve log, then click MyUCLA's own move-up
button exactly once. Do not export a HAR and do not use "Copy as fetch". Record:

- request type: Document, XHR, fetch, WebSocket, or none;
- method, redacted path, status code, content type;
- the field *names* in the payload, with every value masked;
- whether the response is a full page, an HTML fragment, or JSON;
- the initiator type;
- whether the button was disabled at click time and whether the page showed a
  loading state.

Do not include request headers, cookies, `Authorization`, CSRF token values, or
a full response body.

## 4. Whether it really saved

Note two adjacent classes before and after the move, then check:

1. does the new order survive an ordinary refresh;
2. does it survive opening Class Planner in a new tab;
3. does it survive quitting and reopening the browser (optional).

Only when the native action produces a successful request **and** the order
survives a fresh load from MyUCLA may the extension describe an order as saved.
Otherwise it must say the write is unverified, or that only this page's display
changed.

## Template

```text
Redacted Class Planner URL:
Inside an iframe:
After clicking move up:  partial postback / full navigation / unsure

Class list container outerHTML:
First card outerHTML:
Middle card outerHTML:
Last card outerHTML:

Network type:
Method + redacted path:
Status + content type:
Payload field names (no values):
Response shape:
Order survives refresh:
Order survives a new tab:
```
