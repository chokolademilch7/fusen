[← README](../../README.md) · English | [日本語](../ja/guide/embedding.md)

# Embedding in your app

```html
<script type="module">
  import { configureFusenWidget, defineFusenElement } from "fusenjs/ui";

  configureFusenWidget({ http: myTransport });
  defineFusenElement(); // default tag name is fusen-widget
</script>

<fusen-widget></fusen-widget>
```

After `bun add fusenjs`, import `fusenjs/ui` from your host's bundler. On a plain page with no
bundler, skip the import and load `node_modules/fusenjs/dist/fusen-widget.js`,
`node_modules/fusenjs/dist/fusen.js` or `node_modules/fusenjs/dist/fusen-lite.js` (from the CDN:
`https://cdn.jsdelivr.net/npm/fusenjs/dist/fusen.js` / `.../fusen-lite.js`) with a script tag.

What differs per host goes in through element properties (`author-key` / `authorKey`, `route`,
`labels`, `headerActions`, `renderItemMeta`, `pinColor`, `hideItem`) and through
`configureFusenWidget` (`http`, `transport`, `captureContext`, `volatileDataKeys`,
`selfSelector`). `configureFusenWidget` takes effect only when called from the same module that
registered the element. In other words, import it from `fusenjs/ui` together with
`defineFusenElement`, and call it before the element is registered. The script-tag bundles
(`fusen-widget.js` / `fusen.js` / `fusen-lite.js`) register the element as soon as they load and each carries its
own runtime, so with them only the element properties are available.

The widget does not navigate or show notifications itself. It emits `feedback-navigate`
(`detail: { route }`) and `feedback-notify` (`detail: { message }`) events for your router and
toasts to handle. When a comment is accepted the mode closes and `feedback-notify` receives
`labels.sent` (default "Sent") (not when the mode was closed with the badge
while sending). With nothing passed in, it runs anonymously with `location.pathname`.

The on-screen copy is English by default. `labels` takes a partial map; anything you leave out
keeps the English default. A complete Japanese map is in
[README.ja.md](../../README.ja.md).
