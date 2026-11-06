[← README](../../../README.ja.md) · [English](../../guide/embedding.md) | 日本語

# 埋め込み方

```html
<script type="module">
  import { configureFusenWidget, defineFusenElement } from "fusen/ui";

  configureFusenWidget({ http: myTransport });
  defineFusenElement(); // 既定タグ名は fusen-widget
</script>

<fusen-widget></fusen-widget>
```

`bun add fusen` したあと、ホストのバンドラから `fusen/ui` を import する。バンドラの無い
素のページなら、import せずに `node_modules/fusen/dist/fusen-widget.js`、
`node_modules/fusen/dist/fusen.js`、`node_modules/fusen/dist/fusen-lite.js` のどれか（CDN なら
`https://cdn.jsdelivr.net/npm/fusen/dist/fusen.js` / `.../fusen-lite.js`）を script タグで読む。

埋め込み先ごとに違うものは、要素のプロパティ（`author-key` / `authorKey`、`route`、
`labels`、`headerActions`、`renderItemMeta`、`pinColor`、`hideItem`）と
`configureFusenWidget`（`http`、`transport`、`captureContext`、`volatileDataKeys`、
`selfSelector`）で差し込む。`configureFusenWidget` が効くのは、要素を登録したのと同じ
モジュールから呼んだときだけ。つまり `fusen/ui` から `defineFusenElement` と一緒に import して、
要素の登録前に呼ぶ。script タグで読むバンドル（`fusen-widget.js` / `fusen.js` / `fusen-lite.js`）は
読み込んだ時点で要素を登録し、ランタイムもそれぞれが持つので、使えるのは要素のプロパティだけ。

画面遷移と通知はウィジェット自身はしない。
`feedback-navigate`（`detail: { route }`）と `feedback-notify`（`detail: { message }`）
のイベントを出すので、ホストのルーターとトーストで受ける。コメントが受け付けられると
モードが閉じ、`feedback-notify` に `labels.sent`（既定 "Sent"）が届く（送信中にバッジで閉じた分は
届かない）。何も渡さなければ匿名 / `location.pathname` で動く。

画面の文言は既定で英語。`labels` は一部だけ渡せばよく、渡さなかった項目は英語の既定のまま。
日本語にする対応表一式は [README の「日本語で表示する」](../../../README.ja.md#日本語で表示する) にある。
