# Install fusen — a prompt for your AI

English | [日本語](./INSTALL.ja.md)

**Copy everything inside the box below and paste it into your coding agent.** It will
take the installation all the way through. The human-facing overview is in the
[README](./README.md).

Decide one thing before you paste:

|                 | Lite                          | Server                          |
| --------------- | ----------------------------- | ------------------------------- |
| Notes stored in | your browser (IndexedDB)      | your server + SQLite            |
| You set up      | **nothing**                   | one server process              |
| Who sees notes  | **only you, in this browser** | everyone who opens the page     |
| Good for        | your own notes while building | collecting feedback from others |

If unsure, choose **lite**. You can move to the server later (the widget is the same).

---

```
Please add fusen to my project. fusen is a widget that lets people pick an element on the
page, stick a note on it, and list the notes. It ships as one custom element,
<fusen-widget>, in the npm package `fusenjs`.

## What I chose

Lite (no server, notes stored in the browser).
(To use the server instead, replace this line with "Server, please." before pasting.)

## What to do

### 1. Look at my project

Find out what kind of project this is: plain HTML, React, Vue, something else. Find where
static files are served from (public/, static/, dist/, …). Decide by reading the actual
files, not by guessing.

### 2. Add the widget

Install with Bun:

    bun add fusenjs

For lite, the whole product is one self-contained file (about 170 KB, ~50 KB gzip):

    node_modules/fusenjs/dist/fusen-lite.js

Either copy it to my static files and load it from there, or, if this page may load
scripts from a CDN, use:

    https://cdn.jsdelivr.net/npm/fusenjs/dist/fusen-lite.js

Add these two lines to the page:

    <script type="module" src="<where the file is>/fusen-lite.js"></script>
    <fusen-widget route="/"></fusen-widget>

Framework notes:
- React: write <fusen-widget route="/" /> as is. A side-effect import
  (import "fusenjs/dist/fusen-lite.js") is fine for loading.
- Vue: the Vue compiler warns that <fusen-widget> is an unknown component. Set
  template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('fusen-') } }
  in the vite vue plugin. Skipping this gives build warnings.
- If the app has routing, update the route attribute to the current path on every
  navigation. That is what ties a note to a page.

No build step, config file or server is needed for lite.

Only if I chose the server, also do this:

- Use node_modules/fusenjs/dist/fusen.js instead of fusen-lite.js (without data-mode it
  runs in server mode).
- Start the fusen server as a separate process (needs Bun):

      bunx fusenjs serve --db ./fusen.sqlite --port 8400

  It listens on 127.0.0.1 by default (reachable only from a proxy on the same machine).
  Inside a container, add --host 0.0.0.0.

- Route /api/feedback on my server (nginx etc.) to it, so the page reaches it on the
  SAME ORIGIN. The fusen server sends no CORS headers, so a different origin will not work.

      location = /api/feedback { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
      location /api/feedback/ { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }

  If my app runs on Bun and you may edit it, you can mount fusenjs/server directly instead
  of the proxy (see the server guide in the fusen README).

### 3. Make the notes readable by AI (plugin)

fusen ships a Claude Code plugin. With it, when I say "check the comments", you can read
the notes left on the page.

    git clone https://github.com/chokolademilch7/fusen && (cd fusen && bun install)
    claude --plugin-dir ./fusen

For the server version, pass FUSEN_BASE_URL (for example
http://localhost:8400/api/feedback) in the environment that starts the client; the MCP
server then reads the real data.

What the plugin brings:
- fusen-comments skill — how to read the notes (MCP for the server, the browser for lite)
- fusen-triage agent — turns notes into a work list
- fusen MCP server — reads the server when FUSEN_BASE_URL is set; for lite it reads the
  page through a browser started with --remote-debugging-port

With lite, if no such browser is running, the MCP server answers with an error that
explains how to start one. That is expected, not broken: lite deliberately has no server.

### 4. Check that it works

Do not stop at "installed". Run it and confirm.

a. Open the page. A badge should appear in the bottom-right corner.
b. Click the badge, pick something on the page, write a note, submit. The mode closes.
   Click the badge again to enter the mode; the marker shows.
c. Open the list and confirm the note is there.
d. Reload the page, enter the mode again, and confirm the marker is still there
   (markers are drawn only while in the mode — easy to mistake for "gone").
e. In the browser devtools console, run the following and confirm it returns the note:

       await window.__fusen.dump()

   The server version does not expose window.__fusen. Instead open /api/feedback on the
   page's origin and confirm the note comes back as JSON.

If you can automate (Playwright etc.), that is fine too. But while picking, a full-screen
overlay takes pointer events, so clicking an element locator stops with "another element
would receive the click". Click by coordinates instead:

    const box = await page.locator('selector').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

### 5. Report back to me

- the files you touched
- what you actually confirmed in step 4 (and, honestly, anything you could not)
- if I chose lite, mention that notes are saved in this browser only — other devices
  and browsers will not see them

## Please do not

- modify fusen itself (node_modules/fusenjs); configuration on my side is enough
- say something works without having checked it
```

---

## What the human does after pasting

Nothing, ideally. If it does not work, check in devtools whether `window.__fusen` exists on
the page. If not, the script did not load (path or MIME type). If it exists but is empty,
no note has been written yet.
