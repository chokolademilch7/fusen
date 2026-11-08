[← README](../../../README.ja.md) · [English](../../guide/lite.md) | 日本語

# lite — サーバー無し版

> [!IMPORTANT]
> **lite にできないこと**
>
> - コメントは1つのブラウザプロファイル・1台の端末に閉じる（IndexedDB に保存する）
> - 他の人には見えない
> - 別の機械と共有できない
> - サーバーには何も残らない
> - エージェントに読ませるには WebMCP か CDP が要る
> - エージェント向けの書き込みの道具は無い
>
> どれか1つでも要るなら、[サーバー版](./server.md)を使う。

```html
<script type="module" src="fusen-lite.js"></script>
<fusen-widget route="/"></fusen-widget>
```

これだけ。`fusen-lite.js`（約170KB、gzip 50KB、依存同梱）を置いて読むと、
タグが生えて IndexedDB に保存されるようになる。ファイルは `bun add fusenjs` で入る
`node_modules/fusenjs/dist/fusen-lite.js` か、CDN の
`https://cdn.jsdelivr.net/npm/fusenjs/dist/fusen-lite.js`。ページ側には
ビルド工程もサーバーも DB も要らない。

## 保存先は差し替えられる

ウィジェットは「どこに保存するか」を知らない。保存先とリアルタイム経路は差し込み口
（`configureFusenWidget({ http, transport })`）で、サーバー版はそこに HTTP と SSE を、
lite は IndexedDB と BroadcastChannel の実装を挿しているだけ。ウィジェット側は**1行も
変えていない**。cross-tab の更新も本物として動く。

**引き換え**: コメントは1つのブラウザプロファイル・1台の端末に閉じる。他の人には見えない。

## 外から読む

サーバーが無いので叩く先も無い。代わりにページが読み取り口を出している。

```js
await window.__fusen.dump(); // 全部、新しい順
await window.__fusen.routes(); // route ごとの件数
```

CDP でも Playwright でも devtools コンソールでも、同じ1行で読める。同梱スクリプト
（fusen のリポジトリを clone した中で実行する）:

```bash
chromium --remote-debugging-port=9222 --user-data-dir=/tmp/fusen-profile
bun run scripts/read-via-cdp.ts
```

**IndexedDB を直接開く実装にはしていない。** そうすると保存レイアウトに全ツールが結合し、
変えたときに空配列が返って「コメント0件」と区別がつかなくなる。

ブラウザに繋がった AI エージェントに渡す方法（WebMCP、MCP の CDP 経路）は
[AI エージェントに読ませる](./agents.md)にまとめてある。

## どちらを使うか

|              | lite                       | サーバー版             |
| ------------ | -------------------------- | ---------------------- |
| 保存先       | ブラウザ（IndexedDB）      | 自分のサーバー + DB    |
| 用意するもの | **無し**                   | サーバー1つ            |
| 見える範囲   | **自分のブラウザだけ**     | 見た人全員             |
| 用途         | 開発中に自分用のメモを貼る | 他の人から意見を集める |

ウィジェットのコードは同じなので、あとから移れる。

## 両方入りの1本 — `fusen.js`

決めきれない、あるいはページによって変えたいなら、両方を含んだバンドルがある
（`node_modules/fusenjs/dist/fusen.js`、CDN なら `https://cdn.jsdelivr.net/npm/fusenjs/dist/fusen.js`）。

```html
<!-- サーバー版 -->
<script type="module" src="fusen.js"></script>

<!-- lite -->
<script type="module" src="fusen.js" data-mode="client"></script>
```

`client` は「コメントがこのブラウザに残る」、`server` は「みんなが見えるところに残る」。
**データがどこにあるか**で呼び分けている（`lite` はビルドの名前で、`data-mode="lite"` を
読んだ人には何が変わるのか分からなかった）。`fusenjs/lite` という名前から `lite` と
書かれることは避けられないので、それも `client` として受ける。

`data-mode` が無ければ**サーバー版**。client は「1つのブラウザに閉じる」という選択なので、
黙って選ばれるのではなく書いてもらう。`<fusen-widget mode="client">` でも指定できるが、
見るのは**読み込み時の最初の1個だけ**。

重い部分（SolidJS）は元々どちらにも入っているので、両方入れても増えるのは数 KB
（`fusen-lite.js` 170KB → `fusen.js` 171KB、gzip 50.0KB → 50.2KB）。

モードは**読み込み時に1回だけ**読む。あとから属性を書き換えても切り替わらない — 保存先と
リアルタイム経路はページ全体で1組だからで、途中で変えれば同じページの中で2つの保存先が
食い違う。devtools で書き換えても権限は増えない（何を書けて何を消せるかはサーバーが
判定する）。壊れるのはいじった人の手元だけ。

保存済みのコメントは移らない。lite の中身は IndexedDB、サーバー版の中身は DB にあり、
切り替えても混ざらない。
