# Privacy

Better MyUCLA is an unofficial, browser-only enhancement for the MyUCLA Class
Planner. It has no server, no account, no analytics, and no telemetry.

## What page it can touch

The extension requests exactly one page:

```
https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx
```

On that page it reads only what MyUCLA has already rendered: the term code, the
plan's numeric id, each class's numeric id and display name, the current order,
the seat / waitlist / conflict text already on screen, and the structure and
enabled state of MyUCLA's own ordering buttons.

It does not read or store passwords, cookies, tokens, your UID, grades, DARS, or
anything about Duo, and it does not visit any other MyUCLA page.

## What is stored, and where

Everything below lives in this browser only.

- **Your notes.** Up to 24 characters per class, in `chrome.storage.local`, keyed
  by term, plan, and class id.
- **View preferences.** Which classes you collapsed, and whether the optional
  "tidy up MyUCLA's own layout" switch is on. Only class identifiers, never any
  page content.
- **An unsaved arrangement.** While you have rearranged a plan but not saved it,
  the order is kept so a timeout or a stray navigation does not cost you the
  work. Class identifiers only. It expires after 24 hours and is deleted as soon
  as it is saved, discarded, or found to be stale.
- **One random operation id** in the page's `sessionStorage`, so a reordering run
  only ever continues in the tab that started it.

There is no `fetch`, no `XHR`, no WebSocket, and no polling for open seats. The
extension never constructs a network request of its own.

## What you control

- Every action that could change the order MyUCLA has stored asks first, states
  how many steps it will take, and can be stopped part-way.
- **Delete all my notes** in the overflow menu removes only what this extension
  saved. It does not touch MyUCLA's own colours, plans, or order.
- The switch in the popup turns the whole thing off; the page then looks exactly
  as MyUCLA made it.
- Uninstalling stops it entirely, and the browser's extension settings clear its
  local data.

## The page-world bridge

To show how long a MyUCLA session has left, the extension injects one small
script that runs in the page's own JavaScript context. It does two things and
nothing else.

**It reads two numbers.** MyUCLA already maintains two global variables holding
the minutes remaining. The bridge range-checks them and forwards them over a
same-origin `postMessage`. The extension side accepts a message only from the
same window and origin, carrying this extension's own channel marker, and takes
only two bounded integers from it.

**It can count reading as presence.** On by default, switchable off in the popup.
MyUCLA's own `Timeout.js` extends your session on `mousedown`, `keydown` and
`click`, but not on scrolling, so reading your plan for fifteen minutes signs you
out. When the tab is visible **and** focused, scrolling or moving the mouse calls
MyUCLA's own `ExtendSession(false)`, at most once a minute, stopping after a cap
you choose (60 minutes by default). The request is MyUCLA's, not ours.

It reads no other page variable and no page content, never shortens a session,
never bypasses sign-in or Duo, and sends nothing anywhere outside MyUCLA. Walk
away and the session still expires on its original schedule; MyUCLA's roughly
four-hour hard limit is untouched.
