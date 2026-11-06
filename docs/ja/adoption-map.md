[English](../adoption-map.md) | 日本語

# 導入経路の地図

このリポジトリが「どこまで来ていて、どこへ行けるか」を1枚にしたもの。
2026-08-13 時点。判断の履歴も含めて残す。

> 当時の判断記録。導入手順は README を正とする。

## 1. いまあるもの

| パッケージ      | 役割                                                                                       | 状態                       |
| --------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| `@fusen/core`   | アンカリング、ページ状況スナップショット、`FeedbackHttp` / `FeedbackTransport` の型        | 依存ゼロ                   |
| `@fusen/ui`     | `<fusen-widget>`（Shadow DOM、SolidJS は内部実装）                                         | dist を持つ                |
| `@fusen/server` | プロトコル本体（`Request` → `Response`）、memory / **SQLite** ストア、匿名 cookie 本人判定 | Bun 前提の同梱ストアあり   |
| `@fusen/lite`   | サーバー無し版。IndexedDB + BroadcastChannel                                               | 単一ブラウザに閉じる       |
| `@fusen/mcp`    | 集まった意見を AI の道具として読ませる                                                     | HTTP 経由と CDP 経由の両方 |

道具の中身（`list` / `get` / `summarize`）は `@fusen/core` にある。stdio・CDP・
ページ内 WebMCP の3経路が同じ関数を呼ぶので、payload は経路によって変わらない。

補助: `examples/`（plain / react / vue の受け入れテスト）、`skills/fusen-comments`、
`agents/fusen-triage.md`、`INSTALL.md`（AI に貼る導入プロンプト）。

### 2026-08-13 に入れたもの

- `@fusen/server/sqlite` — `createSqliteStore({ path?, table?, db? })`。WAL、`busy_timeout`、
  `CREATE TABLE IF NOT EXISTS`。**Bun 専用**（`bun:sqlite`）
- 既定の本人判定を「`HttpOnly` cookie の匿名」へ。`anonymousCookie` で調整、`false` で旧挙動
- `GET {basePath}/me` — ウィジェットが自分の `authorKey` を取る口
- `@fusen/ui` — `FeedbackHttp.me?()`（任意）、`author-key` 未設定なら起動時に1回だけ取得

破壊的変更: `author_key` が全員 `"anonymous"` から個別値へ。これにより既定の
`canDelete`（本人のものだけ）が**初めて実際に機能する**。

- `@fusen/lite` に WebMCP — `data-webmcp` / `<fusen-widget webmcp>` で、ページ自身が
  `document.modelContext` に `fusen_list_feedback` / `fusen_get_feedback` /
  `fusen_summarize_routes` を出す。**既定は off、読み取り専用、`untrustedContentHint` 付き**
- 3つの道具の中身を `@fusen/mcp` から `@fusen/core` へ移した（`FeedbackReader` は
  `{ list() }` だけの構造型）。ブラウザは MCP SDK に依存する package を import できず、
  複製すると「どの経路でも同じ payload」という約束が片方の編集で崩れるため
- 検証は `bun run scripts/check-webmcp.ts`（Chrome 149〜156 が要るので `verify` の外）。
  Chrome 151 で通過確認済み

これで lite のコメントを外から読む経路は2本になった。CDP（外のプロセスが読む、どの
エージェントからでも）と WebMCP（ページが渡す、ブラウザ内のエージェントだけ）。
**CDP は消していない** — stdio の Claude Code から読めるのは今も CDP だけ。

### 2026-08-14 に入れたもの

[Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec)（ベンダー中立の
plugin 形式）対応。**同じディレクトリを2つの形式で名乗る**という形にした。

- `plugin.json`（root）— Agent Plugins の manifest。schema は**閉じている**
  (`additionalProperties: false`) ので、Claude Code 側の `displayName` / `skills` /
  `agents` / `mcpServers` は入れられない。入れても落ちず「不明フィールドとして無視」
  されるだけなので、壊れたことに気づけない
- `mcp.json`（root）— `${PLUGIN_ROOT}` で `packages/mcp/src/bin.ts` を起こす stdio 1本
- `.claude-plugin/plugin.json` と `.mcp.json` は**そのまま**。Claude Code 経路は無変更
- `scripts/check-plugin-manifests.ts` を `verify` に追加。仕様の schema は取りに行かない
  （§5.2 が「読み込み時に schema を fetch するな」と言っており、`verify` も offline で
  通る必要がある）

なぜ manifest を2枚にしたか。1枚に寄せる道は無い — Claude Code は `.claude-plugin/`
の下しか見ず、Agent Plugins は root の `plugin.json` しか見ない、と両方が固定位置を
決めている。手で2枚書けば `version` は必ずいつかずれ、しかもずれても誰も落ちない
（クライアントは `version` を cache 判定に使うので、古い中身が黙って出る）。
そのずれだけを機械に見張らせている。

`mcp.json` に `env` を書いていないのは意図。展開されるのは `${PLUGIN_ROOT}` と
`${PLUGIN_DATA}` の2つだけで、`${FUSEN_BASE_URL}` は**その文字列のまま**プロセスに届く
（§9.2）。`bin.ts` は FUSEN_BASE_URL の有無で HTTP / CDP を分けるため、リテラルが入ると
「壊れた URL の HTTP 読み」に倒れ、lite のブラウザ経由へ落ちなくなる。未設定より悪い。

仕様が定める component は**スキルと MCP サーバーの2つだけ**。`agents/fusen-triage.md`
は Agent Plugins のクライアントからは見えない（v1 の範囲外で、無視が正しい挙動）。
`command` が `bun` なので plugin root で `bun install` 済みであることも前提のまま
（依存を `${PLUGIN_DATA}` へ置く形にはしていない）。

## 2. 導入コストの現在地

サーバー版を入れる人がやることは、以前は5つだった。

1. Postgres を用意する → **消えた**（SQLite 同梱）
2. テーブルを切る → **消えた**（自動作成）
3. `FeedbackStore` を書く → **消えた**（同梱ストア）
4. `fusen.handle(req)` を1行 → 残る
5. ページに `<script>` を1本 → 残る

いま実際に打つ手順（publish していないため）:

```bash
git submodule add https://github.com/chokolademilch7/fusen vendor/fusen
bun install --cwd vendor/fusen
bun run --cwd vendor/fusen build:ui
cp vendor/fusen/packages/ui/dist/*.js public/vendor/   # 2本ともコピーする
```

さらに `tsconfig.json` にパス別名（`@fusen/server` と `@fusen/server/sqlite`）。
**コードは2行に到達しているが、セットアップは4手のまま**。ここが次の摩擦。

publish すればパッケージの追加1手になり、素の HTML なら CDN の
script タグ1本で `./index.js` の同梱問題も自動的に消える。publish の前提作業は
`private: true` の解除、`workspace:*` の実バージョン化、`@fusen/server` のビルド
（いま `exports` が `.ts` を直接指している）。

## 3. 配置の選択肢

「ホストのサーバーをどこまで触るか」で6通りある。

| #   | 形                                 | ホスト側の変更              | 保存先                | 複数人                    | 未実装                                 |
| --- | ---------------------------------- | --------------------------- | --------------------- | ------------------------- | -------------------------------------- |
| A   | 直マウント                         | コード1行                   | 自分の DB（相乗り可） | ○                         | 無し（今日から可）                     |
| B   | リバースプロキシ                   | 設定1ブロック               | fusen 側の SQLite     | ○                         | 無し（`fusen-serve` 実装済み）         |
| C   | 別オリジンの自前サービス           | **ゼロ**（script タグのみ） | fusen 側              | ○                         | **スコープ外**（3.5 を見よ）           |
| D   | BaaS 直叩き（Supabase / Firebase） | ゼロ                        | BaaS                  | ○                         | クライアント seam のアダプタ、RLS 設計 |
| E   | GitHub Discussions                 | ゼロ                        | GitHub                | ○（要 GitHub アカウント） | **却下**（3.5 を見よ）                 |
| F   | lite                               | ゼロ                        | IndexedDB             | **×**                     | 無し（既存）                           |

### A. 直マウント

いまの本線。`(await fusen.handle(req)) ?? myApp(req)`。同一オリジンなので cookie も
CORS も考えなくていい。コメントをアプリの DB に相乗りさせられる（`createSqliteStore({ db })`
か自前ストア）ので、アプリの SQL から参照できるのはこの形だけ。

### B. リバースプロキシ

`/api/feedback/*` だけ別プロセスへ流す。アプリのコードは無改造、同一オリジンのまま。
起動エントリは `packages/server/src/bin.ts`（clone した中で `bun run packages/server/src/bin.ts --db ./fusen.sqlite --port 8400`）。
**非 Bun のアプリに fusen を入れる現実的な唯一の道**でもある。

### C. 別オリジン

サーバー設定にも触れない場合、これしかない。`basePath` に絶対 URL を入れるだけで
fetch も EventSource も動くが、以下が要る。

- `@fusen/server` に CORS（Origin 許可リスト、プリフライト、`Allow-Credentials`）
- cookie が使えない（Safari の ITP / サードパーティ cookie 制限）ため、匿名キーを
  **ヘッダで送る方式**（`X-Fusen-Author`）を追加する
- `EventSource` はカスタムヘッダを送れないので、SSE クライアントを fetch +
  `ReadableStream` に差し替える
- 1つの fusen が複数サイトを持つので**サイト分離**が要る。`site` 列 + 複合インデックス
  （`FeedbackStore.list()` の署名が変わる）か、サイトごとに SQLite ファイルを分ける

失うもの: コメントがアプリの DB から出るので `JOIN` できない。バックアップと保持期間が
別運用になる。ホスト側には script タグと（絞っているなら）CSP の緩和が残る。

### D. BaaS 直叩き

ブラウザから直接叩けるのは anon key + 行レベル権限を持つ BaaS だけ（Supabase、Firebase）。
Neon / Turso / D1 / Upstash は手前に関数が要るので「サーバー0」にはならない。
`@fusen/lite` と同じくクライアント seam（`FeedbackHttp` + `FeedbackTransport`）に実装する形。
realtime も BaaS 側の購読に乗る。代償は権限設計が RLS に移ること — 書き損ねると全公開・全削除。

### E. GitHub Discussions

giscus / utterances と同じ発想。**構造を参考にするだけで、依存はしない**（あれらは
コメント欄ウィジェットで汎用 API を出していない）。

| fusen          | GitHub                                                              |
| -------------- | ------------------------------------------------------------------- |
| route 1つ      | Discussion 1本（title = route、category = `fusen`）                 |
| コメント       | Discussion comment。`anchor` は本文末尾に `<!-- fusen:{...} -->`    |
| votes          | 👍 リアクション                                                     |
| 著者・削除権限 | GitHub アカウントと GitHub の権限（匿名 cookie の話が要らなくなる） |
| realtime       | **無い**。ポーリング                                                |

`api.github.com` は CORS を返すので、**トークンさえあれば実行は全部ブラウザで完結する**。
制約は、参加者全員に GitHub アカウントが要ること（エンドユーザーの意見収集には使えない、
チーム内レビュー向け）、public repo なら中身が公開されること、realtime が落ちること。

トークンの置き場所は3段階。

1. ホストページの localStorage — 最短。ページ上のあらゆるスクリプトが読めるので、
   自分たちが管理するステージング/社内ページ限定。fine-grained PAT を1リポジトリ・
   Discussions の read+write・短い有効期限で発行する
2. **自分のオリジンの iframe に隔離**（推奨）— 静的ホスティング（GitHub Pages で足りる）に
   小さなページを置き、トークンはそのオリジンの localStorage へ。ホストページからは
   同一オリジンポリシーで読めない。postMessage の受け口は fusen の5操作だけに絞る
3. OAuth ブローカ — 「GitHub でログイン」になる。ただし**ブラウザだけでは OAuth を
   完結できない**（トークン発行エンドポイントに CORS が無く、`client_secret` も要る）ので、
   Worker を1つ運営することになる

ブローカの負担: 実装150行・状態なし・Workers 無料枠、落ちても新規ログインだけ止まる。
技術的な負荷は無視できるが、**他人の GitHub トークンの発行経路になる責任**を引き受ける
（戻し先オリジンの許可リスト必須、ログを残さない、秘密の更新）。内輪の間は不要で、
2 の PAT + iframe で同じことができる。違いはログイン体験だけ。

## 3.5 スコープ外・却下した案（2026-08-13）

**C（別オリジンに fusen を立てる）— スコープ外**。「ホストのコードを触らない」は B（単体プロセス +
プロキシ）で足りており、C が追加で買うのは「ホストのサーバー設定にも触らない」だけ。その対価が重い。

- 技術的に4点セットで、どれか1つでは動かない。CORS / cookie が飛ばないためヘッダ方式の本人判定 /
  `EventSource` がヘッダを送れないため SSE クライアントの書き換え / 複数サイトを1つが持つための分離
- 分離は DB の設計変更でもある。`site` 列を足すなら `FeedbackStore.list()` の署名が変わり、
  ファイル分割なら接続管理が増える。どちらでも `site` はサーバーが Origin から埋める（クライアント申告は信じない）
- さらに「誰がその fusen を運用するか」が残る。導入者が立てるなら**アプリ無改造であってサーバー無しではない**。
  こちらが1つ動かして配るなら、全サイトぶんのバックアップ・削除要求・荒らし対応を引き受けることになる
- 失うもの: コメントがアプリの DB から出るので `JOIN` できない。`createSqliteStore({ db })` の相乗りが意味を失う

**GitHub Discussions を保存先にする / ミラーする** — 却下。理由は**二重管理**。
SQLite と GitHub のどちらが正かが決まらず、削除・編集の整合を片方向に割り切る前提が要る。
「選んだ付箋だけ Issue に起こす」案（正は SQLite のまま、GitHub は昇格先）も同じ判断で見送った。
将来やるなら、正が1つであることを崩さない形（一方向・冪等・GitHub 側の変更は無視）に限る。

**サーバー側 GitHub OAuth（認証だけ、保存は SQLite）** — 見送り。二重管理は起きない案だったが、
認証はホストの責務に置く方針を採った。ホストが自分のセッションを持っているなら
`resolveAuthor` を渡せば済み、持っていないなら匿名 cookie の既定で足りる。
この判断により、`createGithubAuth` / `loginUrl` / ウィジェットのログイン導線は作らない。

設計の副産物として残っている事実は変わらない。`resolveAuthor` が `null` を返せば
「読みは匿名・書きは要認証」が追加実装ゼロで成立し（一覧と SSE は `resolveAuthor` を
呼ばない、書き込み3経路は `null` で 401）、`/me` があるおかげで認証方式を変えても
**ホストのページは無変更**で済む。ホストが後から認証を足す余地は開いている。

## 4. 順序

1. **B の起動エントリ**（`fusen-serve`）— 小さく、非 Bun ホストと「コード0行」を同時に開ける
2. **publish**（npm + CDN）— セットアップ4手を1手にする。どの配置を選んでも効く
3. **`mode` の1本化** — lite とサーバー版を1バンドルに入れ、ページ単位で選べるようにする。
   seam は既に分離済みなので、増えるのは数 KB とモード判定の数行。`mode` は最初のマウント時に
   1回だけ読む（devtools で書き換えても切り替わらない。壊れるのはいじった人の手元だけで、
   権限はサーバーが判定するので影響は無い）
4. D の Supabase アダプタ — 外部ユーザーからの収集で、かつサーバーを持ちたくないときに。
   まだ着手しない

C（別オリジン）はスコープ外、E（GitHub）は却下。3.5 を見よ。

### 済み（2026-08-13）

1 と 3 は実装済み。`bun run packages/server/src/bin.ts --db ./fusen.sqlite --port 8400` と、両方の保存先を
含む `packages/lite/dist/fusen.js`（`data-mode="client"` で切り替え、既定はサーバー版、
読み込み時に1回だけ解決）。残る未着手は 2（publish）と 4。

## 5. 未決

- publish のパッケージ境界（`@fusen/server` をビルドして配るのか、Bun 前提で `.ts` のまま配るのか）。
  npm の `@fusen` スコープは別の利用者が持っているので、publish するなら名前から決め直す
- lite ⇄ サーバー版のデータ移送（`window.__fusen.dump()` からの流し込み）を道具にするのか、手作業のままにするのか
