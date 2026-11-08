[← README](../../../README.ja.md) · [English](../../guide/server.md) | 日本語

# サーバー側

ウィジェットは次の5本のルートがあることを前提に喋る（`{base}` は既定で `/api/feedback`）。

| ルート                  | 用途                                                     |
| ----------------------- | -------------------------------------------------------- |
| `GET {base}/events`     | SSE。他の人の投稿・投票・削除をリアルタイムに受け取る    |
| `GET {base}/me`         | 自分は誰か。ウィジェットが自分の `author_key` を知るため |
| `GET\|POST {base}`      | 一覧の取得と、新しいコメントの作成                       |
| `POST {base}/:id/votes` | 投票                                                     |
| `DELETE {base}/:id`     | 削除。`nonce` は JSON body で送る                        |

これを手書きするのが導入コストの本体で、しかも**間違えても何も言わずに壊れる**種類の
間違いが4つある。`@chokolademilch7/fusen/server` がそれを引き受ける。

```ts
import { createFusenServer, createMemoryStore } from "@chokolademilch7/fusen/server";

const fusen = createFusenServer({ store: createMemoryStore() });

Bun.serve({
  idleTimeout: 0, // SSE を切らせない
  fetch: async (req) => (await fusen.handle(req)) ?? myOwnRoutes(req),
});
```

`handle` は担当外のパスに **`null`** を返す（404 ではない）ので、`??` で自分の
ルーターへ流せる。`Request` / `Response` は Web 標準なので、Bun / Deno / Node 18+ /
Workers / Hono は**アダプタ無しでそのまま**動く。

書くのは `FeedbackStore` の4メソッド（`list` / `create` / `vote` / `remove`）だけ。
`createMemoryStore()` を同梱しているので、何も書かない状態から動かせる。

入れるのは `bun add @chokolademilch7/fusen`。ウィジェット側は `node_modules/@chokolademilch7/fusen/dist/fusen.js` を
ページに置く（モードの選び方は [lite](./lite.md) の「両方入りの1本」）。

## 保存先を用意しない — SQLite 同梱

memory ストアの唯一の欠点は再起動で消えることで、それを消すために Postgres を立てて
テーブルを切って4メソッドを書く、というのが従来の落差だった。`@chokolademilch7/fusen/server/sqlite`
はその落差を1行にする。

```ts
import { createSqliteStore } from "@chokolademilch7/fusen/server/sqlite";

const fusen = createFusenServer({ store: createSqliteStore() }); // ./fusen.sqlite
```

`path`（既定 `fusen.sqlite`、`:memory:` 可）、`table`（既定 `fusen_feedback`）、
`db`（アプリが既に開いている `Database` に相乗りする）を渡せる。テーブルは初回に
`CREATE TABLE IF NOT EXISTS` で作られ、`journal_mode = WAL` と `busy_timeout` が
入っているので、単一プロセスのアプリなら実用に耐える。バックアップは**ファイルを
コピーする**（`-wal` / `-shm` も一緒に）。

**Bun 専用**。`bun:sqlite` を使うので依存は増えないが、その代わり root import
（`@chokolademilch7/fusen/server`）ではなく `@chokolademilch7/fusen/server/sqlite` に置いてある。他のランタイムの人は
これまで通り自分で store を書く。

## ホストのコードを触らない — 単体プロセス + プロキシ

`fusen.handle(req)` の1行が書けない場合が2つある。アプリを編集できない場合と、Bun で
動いていない場合。どちらもリバースプロキシで解ける。

```bash
bunx @chokolademilch7/fusen serve --db ./fusen.sqlite --port 8400
```

```nginx
location = /api/feedback { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
location /api/feedback/ { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
```

2行に分けるのは、`location /api/feedback` 1行だと前方一致でホストの `/api/feedback-admin`
のような別ルートまで拾ってしまうから。

アプリは無改造。ブラウザから見れば**同一オリジンのまま**なので、cookie も CORS も
マウント版と同じ話に収まる。既定の待ち受けは `127.0.0.1` で、同じ機械のプロキシからしか
届かない（コンテナの中などで全インターフェイスに出すなら `--host 0.0.0.0` と明示する）。
フラグは `--db` / `--port` / `--host` / `--base` の4つ、
`/healthz` がプロキシの死活監視用に生えている。プロトコル以外のパスは 404 を返す
（アプリのルートはプロキシの担当で、このプロセスの担当ではない）。

## 誰が書いたか — 既定は cookie の匿名

`resolveAuthor` を渡さないとき、サーバーは**ブラウザごとに安定した匿名の key** を
`HttpOnly` cookie（既定 `fusen_author`）で配る。表示名は `Guest-a3f9` のように key から
導かれるので、パネル上で別人が別人に見える。`Guest` の部分は `anonymousCookie` の
`namePrefix` オプションで変えられる（`{ namePrefix: "Visitor" }` なら `Visitor-a3f9`）。

これはログインではない。効くのは「自分の書いたものだけ消せる」という既定の権限判定で、
key が全員共通だった以前は**誰でも誰のでも消せた**。永続化する以上ここは塞いでおく。

cookie の値は秘密で、サーバーの外には出ない。行に記録され、一覧・SSE・`/me` で配られる
`author_key` はその SHA-256 で、一覧から拾っても cookie として送り返せない。サーバー自身が
発行した形（48桁の16進）でない cookie は無視して発行し直す。ただし署名はしていないので、
その形の値なら自分で選んだものでも通る。誰かのブラウザにその cookie を置ける立場
（同じサイトのサブドメインを握っているなど）なら、その人の身元を共有できてしまう。
匿名 cookie は「ログイン無しで自分の付箋を消せる」ための仕組みで、それ以上の本人確認が
要るならホストのログインを `resolveAuthor` で渡す。

- **以前のコメントは誰も消せなくなる。** この変更より前の行には cookie の値そのもの（一覧で
  公開されていた）が記録されていて、今の `author_key` と一致しない。以前の cookie（32桁）も
  受け付けず、次のリクエストで新しい cookie に置き換わる。書いた本人の画面からも
  削除ボタンが消える。消す必要があるなら、ホストが store 側で消すか、自前の `canDelete` を渡す
- ブラウザや端末を変えれば別人になる。自分の付箋は消せなくなる
- cookie に `Secure` が付くのはブラウザが https で来たときだけ。URL が `https:` か、
  プロキシの `X-Forwarded-Proto` が `https` なら付く。nginx は既定でこのヘッダを送らないので、
  TLS を終端するプロキシの後ろに置くなら `proxy_set_header X-Forwarded-Proto $scheme;` を足す
  （無いと平文 http の上でも送られる cookie になる）。`anonymousCookie: { secure: true }` で固定もできる
- **ページと同一オリジンに置くこと。** サーバーは CORS ヘッダを一切返さないので、別オリジンから
  叩くと `DELETE` や JSON の `POST` がプリフライトで止まる。本文が `Content-Type: application/json`
  でない書き込みは 415 で拒否するので、プリフライトを経ないフォームや `text/plain` の POST も通らない。直マウントか、上のリバースプロキシで
  同一オリジンにする（別オリジン構成はスコープ外。[docs/ja/adoption-map.md](../adoption-map.md) の 3.5）
- 旧挙動に戻すなら `anonymousCookie: false`。全員が同じ `anonymous` key になる。
  key を共有するので、既定の `canDelete` は削除をすべて拒否する。許すなら自前の `canDelete` を渡す

ウィジェットは自分の key を `GET {basePath}/me` から取る（`author-key` 属性が空のときだけ、
起動時に1回）。cookie は `HttpOnly` なのでページからは読めない、が正しい理由。ホストが
本物のセッションを持っているなら `resolveAuthor` を渡す — そのときは cookie を一切
発行せず、`/me` はそのセッションの著者を返す。

## 受け付ける書き込みの大きさ

書き込みは既定で匿名で、保存した行は全員の一覧と SSE にそのまま流れる。1件の巨大な行が
全員のウィジェットを重くするので、上限を置いている。

| 対象                         | 上限                     | 超えたとき |
| ---------------------------- | ------------------------ | ---------- |
| リクエスト本文               | 320 KiB                  | 413        |
| `body`（本文）               | 10,000 文字              | 400        |
| `route`                      | 2,048 文字               | 400        |
| `context`（JSON にした長さ） | 16,384 文字              | 400        |
| `anchor`（JSON にした長さ）  | 16,384 文字              | 400        |
| 投票の `delta`               | 0 以外の整数で ±100 まで | 400        |
| `nonce`（全ての書き込み）    | 128 文字                 | 400        |

`delta` が 0 か無いときも 400 を返す（以前は何もせず現在の票数を返していた）。
`delta` が 1 ではないのは、ウィジェットが連打をまとめて1回で送るから。同じ人が何度
投票しても数える（拍手であって投票箱ではない）。`nonce` は保存されないが、realtime
フレームで全員に echo されるので上限を置く。本文の 320 KiB は、文字数の上限いっぱいの
書き込みを全文字 `\uXXXX` で書いても収まる大きさで、長すぎる書き込みは 413 ではなく
理由付きの 400 になる。`fusen serve` は同じ 320 KiB を `Bun.serve` の
`maxRequestBodySize` にも渡している。

## 自分の store を確かめる — testkit

自分の store が正しいかは同梱の適合テストで確かめる。

```ts
import { runStoreContract, runWireContract } from "@chokolademilch7/fusen/server/testkit";

runStoreContract("postgres", () => makeStore());
runWireContract("postgres", () => makeStore());
```

`runWireContract` のほうが重要で、**サーバー側では一切エラーにならず、ブラウザで
だけ静かに壊れる**4つがそこに入っている。jsonb をオブジェクトで返すこと、realtime
フレームに `nonce` を echo すること、`id` を number / `created_at` を string に
すること、`DELETE` の nonce を JSON body から読むこと。
