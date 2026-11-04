# Adding the Bonding tab to Pulse

Four small edits to the Pulse repo. Everything else is new files that are copied in.

## 1. Copy the files

```
public/bonding/basecampbonding.js   ← from this repo's public/bonding/
public/bonding/basecampbonding.css
public/bonding/shape.js
public/js/bonding.js                ← from this repo's pulse-adapter/bonding.js
```

`public/bonding/qr.js`, `mock-api.js` and `worker-api.js` are demo-only: Pulse already has `/connect/qr.js`, and the adapter uses Pulse's own API.

## 2. `public/index.html`: the fifth tab and the mount point

In the tab switch (`#dSwitch`), add a fifth button after Connect:

```html
<div class="dswitch ready" id="dSwitch" role="tablist" aria-label="Pulse" data-on="session"><span class="dind" aria-hidden="true"></span>
  <button role="tab" id="dsSession" data-dmode="session" aria-selected="true">Session</button>
  <button role="tab" id="dsDaily" data-dmode="daily" aria-selected="false">Daily<span class="dbadge" id="dBadge" hidden></span></button>
  <button role="tab" id="dsBuilds" data-dmode="builds" aria-selected="false">Builds<span class="dbadge" id="bBadge" hidden></span></button>
  <button role="tab" id="dsConnect" data-dmode="connect" aria-selected="false">Connect</button>
  <button role="tab" id="dsBonding" data-dmode="bonding" aria-selected="false">Bonding</button>
</div>
```

Next to the Connect section (`<section id="corpsconnect" …>`), add the Bonding one. It is shown only when `body[data-dmode="bonding"]`, the same way Connect is:

```html
<section id="basecampbonding" class="dpane" data-pane="bonding" aria-label="Basecamp Bonding" hidden></section>
```

(Match whatever attribute/class Pulse uses to show the Connect pane; the id `basecampbonding` is what `js/bonding.js` mounts into.)

## 3. `public/app.css`: five columns in the switch

```css
.dswitch{grid-template-columns:repeat(5,minmax(0,1fr))}
.dswitch .dind{width:calc((100% - 8px) / 5)}
.dswitch[data-on="bonding"] .dind{transform:translateX(400%)}
@media (max-width:420px){.dswitch button{font-size:14px;padding-inline:4px}}
```

## 4. `public/js/main.js` and the hash router

```js
import './connect.js';
import './bonding.js';   // ← new
```

Wherever Pulse handles `#connect-<code>` on load/hashchange (shell.js / state.js, the `hooks.scanned` path), add the same for `#bb-checkin-<code>` → `hooks.bbscanned(code)` and make `hooks.openBondingTab` switch the tab like `hooks.openConnectTab` does. The module reads `startHash` for a code that arrived before sign-in.

## 5. Worker

- Run `worker/schema.sql` against Pulse's D1, create the R2 bucket, add the bindings from `worker/wrangler.toml`.
- Merge `worker/src/bonding.js`, `inbound.js`, `util.js` and the `API` route table from `worker/src/index.js` into Pulse's router (`POST /api/bb*`, `GET /photos/:id`, `POST /hooks/slack`, `POST /hooks/twilio`).
- Replace `resolveFellow()` in `worker/src/auth.js` with Pulse's session lookup. `bb_fellows` should mirror Pulse's roster (same ids, names and the `photo_url` from CorpsConnect cards) so avatars match the Connect tab; or point the queries at the existing roster table.
- Secrets: `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `TWILIO_AUTH_TOKEN` (see `docs/INBOUND.md`).
