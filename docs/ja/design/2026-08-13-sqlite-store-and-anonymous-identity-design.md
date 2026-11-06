[English](../../design/2026-08-13-sqlite-store-and-anonymous-identity-design.md) | 日本語

# SQLite ストア同梱と、匿名 cookie による本人判定

日付: 2026-08-13
対象: `@fusen/server`（`@fusen/ui` に小さな追随あり）

## なぜやるか

いまサーバー版を入れる人がやることは5つある。

1. Postgres を用意して接続文字列を配る
2. テーブルを切る
3. `FeedbackStore` の4メソッドを書く
4. ホストのサーバーに `fusen.handle(req)` を1行
5. ページに `<script>` を1本

このうち 1〜3 が「保存先は自分で持て」という設計の代償で、導入の崖になっている。
lite（IndexedDB）は崖ごと消すが、**他人から意見を集められない**ので、サーバー版の
代わりにはならない。

崖を消しつつサーバー版のままにするには、既製のストアを同梱すればいい。1〜3 が
消えて、残るのは4と5、しかも4は1行になる。

```ts
const fusen = createFusenServer({ store: createSqliteStore() });
return (await fusen.handle(req)) ?? myApp(req);
```

同時に、**永続化した瞬間に露呈する穴**を塞ぐ。既定の `resolveAuthor` は固定の匿名
（`key: "anonymous"`）なので、既定の `canDelete`（本人のものだけ消せる）が全員一致で
通ってしまう。memory ストアなら再起動で消えたが、SQLite は消えない。永続化と本人判定は
同じ変更で出す。

## やること / やらないこと

やること:

- `@fusen/server/sqlite` — Bun の `bun:sqlite` を使う `FeedbackStore` 実装
- 既定の本人判定を「cookie に紐づく匿名」へ変更
- `GET {basePath}/me` — ウィジェットが自分の `authorKey` を知るための1本
- `@fusen/ui` — `authorKey` 未設定なら `/me` から自動で埋める

やらないこと（別スペック）:

- Postgres ストアの同梱
- 複数プロセスから同じ SQLite ファイルを叩く構成（SSE の hub がプロセスを跨がない）
- ページング、保持期間、スキーマの版管理
- npm への publish、単体起動エントリ（`fusen serve` 相当）

## 1. SQLite ストア

### 置き場所

`packages/server/src/sqlite.ts` を追加し、`package.json` の `exports` に
`"./sqlite": "./src/sqlite.ts"` を生やす。root import（`@fusen/server`）は Bun 非依存の
まま保つ。`bun:sqlite` を引くのは `@fusen/server/sqlite` を import した人だけ。

Bun 専用でよい。このリポジトリのテストもビルドも Bun で回っており、`bun:sqlite` は
ランタイム内蔵なので依存が増えない。Node で動かす人はこれまで通り自前実装を書く。

### API

```ts
export type SqliteStoreOptions = {
  /** 既定 "fusen.sqlite"。":memory:" 可。 */
  path?: string;
  /** 既定 "fusen_feedback"。 */
  table?: string;
  /** 既にアプリが Database を持っているなら渡す（同じファイルに同居させる用）。 */
  db?: Database;
};

export type SqliteStore = FeedbackStore & {
  /** 全消し。プレビューのリセット用。memory ストアと同じ形。 */
  clear: () => void;
  close: () => void;
  /** 自分のテーブルを同居させたい人のために露出する。 */
  db: Database;
};

export function createSqliteStore(options?: SqliteStoreOptions): SqliteStore;
```

`db` を渡せるのと `db` を露出するのは対で、「fusen 専用のファイルを1本増やす」以外に
「アプリの既存 SQLite に相乗りする」も選べるようにするため。

`close()` は**自分で開いた接続のときだけ閉じる**。`db` を渡された場合は所有者が別なので
何もしない（借り物を閉じない）。

### スキーマ

構築時に `CREATE TABLE IF NOT EXISTS` を1回。版管理テーブルは持たない。

```sql
CREATE TABLE IF NOT EXISTS <table> (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  route          TEXT    NOT NULL,
  body           TEXT    NOT NULL,
  anchor         TEXT    NOT NULL,   -- JSON
  context        TEXT,               -- JSON or NULL
  author_name    TEXT    NOT NULL,
  author_key     TEXT    NOT NULL,
  author_picture TEXT,
  votes          INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL    -- ISO 8601 (UTC)
);
CREATE INDEX IF NOT EXISTS <table>_route ON <table>(route);
```

PRAGMA: `journal_mode = WAL`、`busy_timeout = 5000`、`synchronous = NORMAL`。
単一プロセスのアプリなら実用に耐える線を目標とする。バックアップはファイル1本
（WAL/SHM 込み）をコピーする、と README に書く。

`id` は `INTEGER` なので、プロトコルの number id にそのまま乗る。

### 振る舞い

- `list()` は id の降順。`anchor` / `context` は `JSON.parse` して**オブジェクトで返す**。
  文字列のまま返すと `normalize` が拾ってくれるが、拾わせる前提の実装を同梱物にはしない
- `create()` は `INSERT ... RETURNING *`。`created_at` は `new Date().toISOString()`
- `vote()` は `UPDATE ... SET votes = votes + ? WHERE id = ? RETURNING id, votes`。
  行が無ければ `null`（例外ではない。404 と 500 の差がここで決まる）
- `remove()` は `DELETE ... WHERE id = ? RETURNING id`。無ければ `null`
- 壊れた JSON が列に入っていた場合は行を落とさず `anchor` をそのまま文字列で返し、
  上位の正規化に委ねる。1行の破損で一覧が空になるのが最悪の壊れ方なので、それを避ける

## 2. 匿名 cookie による本人判定

### 変更点

`resolveAuthor` 未指定のときの既定を、固定の匿名から cookie 由来の匿名に変える。

- リクエストの `Cookie` に `fusen_author` があれば、その値が `key`
- 無ければ 128bit のランダム値を生成して `key` にし、**その応答に `Set-Cookie` を足す**
- 属性は `HttpOnly`、`SameSite=Lax`、`Path=/`、`Max-Age=31536000`、
  リクエスト URL が https なら `Secure`
- 表示名は key から導く（`Guest-a3f9` 相当の短い接尾辞）。パネル上で別人が別人に見える

公開シグネチャは変えない。`resolveAuthor` をホストが渡した場合はこれまで通り純関数で、
cookie の発行は起きない（自前セッションを持っている側に cookie を焼かせない）。

```ts
type FusenServerOptions = {
  // ...既存
  /** 既定の匿名 cookie。false で無効化。resolveAuthor 指定時は無視される。 */
  anonymousCookie?:
    | false
    | {
        name?: string; // 既定 "fusen_author"
        sameSite?: "Lax" | "None"; // 既定 "Lax"
        secure?: boolean; // 既定はリクエストが https かで決まる
        maxAgeSec?: number; // 既定 31536000
        namePrefix?: string; // 表示名の接頭辞（`<prefix>-abcd`）、既定 "Guest"
      };
};
```

実装上は `handle()` が応答を返す直前に `Set-Cookie` を足す。いま `json()` が
`new Response` を直接作っているので、cookie を持つ経路だけヘッダを足して返す薄い
ラッパを1つ挟む。

`GET {basePath}`（一覧）は現状 `resolveAuthor` を呼んでいない。ここは変えない。
cookie の発行は `/me` と書き込み系で起きる。

### `GET {basePath}/me`

```
GET /api/feedback/me  ->  200 { "author": { "key": "...", "name": "Guest-a3f9", "picture": null } }
```

- 匿名既定のときは、cookie が無ければここで発行して `Set-Cookie` を返す
- ホストが `resolveAuthor` を渡している場合はその結果を返す。`null` なら 401
- ホストが本物のセッションを持つ場合にも使える口になる（ウィジェットに key を
  属性で流し込む配線が要らなくなる）

`{basePath}/me` は `{basePath}/(\d+)` にも `{basePath}/events` にも当たらないので、
既存のルーティングと衝突しない。

### ウィジェット側

`authorKey` は今も昔も**表示専用**で、削除ボタンを描くかどうかにしか使わない。権限の
判定はサーバーが保存済みの行に対して行う。この位置づけは変えない。

変更は1点。`authorKey` が未設定（既定の `""`）のとき、起動時に `{basePath}/me` を
1回叩いて埋める。属性で明示された場合はネットワークに出ない（既存の使い方は不変）。
失敗しても致命ではない — key が空のままなら削除ボタンが出ないだけで、閲覧も投稿も動く。

## 3. テスト

SQLite:

- `runStoreContract("sqlite", () => createSqliteStore({ path: ":memory:" }))` —
  既存の適合キットをそのまま当てる
- ファイル永続: 書いて `close()`、同じパスで開き直して残っていること
- WAL 下の同時書き込み: 同一ファイルに2接続を開き、交互に `create` して両方残ること
- `clear()` が全消しすること

匿名 cookie:

- 初回リクエストで `Set-Cookie` が付く
- 2回目は同じ key を使い、再発行しない
- 別 cookie の利用者は他人の項目を削除できない（403）
- https のリクエストでは `Secure` が付く
- `resolveAuthor` を渡したときは cookie を発行しない
- `anonymousCookie: false` で発行しない

`/me`:

- 匿名既定で `{ author: { key, name } }` を返し、cookie を発行する
- `resolveAuthor` が `null` を返すとき 401

ウィジェット:

- `author-key` 属性が無いとき `/me` を1回叩いて、自分の項目に削除ボタンが出る
- 属性があるときは `/me` を叩かない

## 4. 破壊的変更

既定の `author_key` が全員 `"anonymous"` から個別値に変わる。既存の利用者で、
「誰でも誰のでも消せる」に（意図せず）依存していた場合は挙動が変わる。CHANGELOG に
破壊的変更として書く。`anonymousCookie: false` を渡すと旧挙動に戻る。

## 5. この変更でも残る限界

正直に README に書く。

- **cookie なので、ブラウザや端末を変えたら別人**。自分の付箋を消せなくなる。匿名の
  代償であり、直したい人は `resolveAuthor` を渡す
- **別オリジンに置くと `SameSite=Lax` の cookie は飛ばない**。その構成は
  `sameSite: "None"` + `secure` が要り、ウィジェット側も `credentials: "include"` が
  必要になる。今回の前提は同一オリジン（直マウント、またはリバースプロキシ）
- **複数プロセスで同じファイルを開くと SSE が割れる**。WAL があるので書き込みは通るが、
  hub はプロセス内にしかないので、別プロセスの更新は他プロセスの購読者に届かない
- **配り方は変わらない**。`@fusen/server` も `@fusen/ui` も `private: true` の workspace
  のままなので、「`npm install` して2行」には到達していない。publish は別スペック
