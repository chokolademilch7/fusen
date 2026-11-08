[← README](../../../README.ja.md) · [English](../../guide/agents.md) | 日本語

# AI エージェントに読ませる

## 読み取り経路の一覧

| 経路                                                            | 要るもの                                                                                        | 読み / 書き                                                         | 向いている場面                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| WebMCP（ページの中、実験的）                                    | ポート不要。lite で `data-webmcp` を付け、Chrome のフラグか origin trial トークン。サーバー不要 | 読みのみ                                                            | ブラウザに繋がったエージェントに、開いているページから渡す |
| CDP 越しの `window.__fusen`（`scripts/read-via-cdp.ts` を含む） | デバッグポート（既定 9222）を開けたブラウザと専用プロファイル。サーバー不要                     | 読みのみ（`dump` / `routes`）                                       | lite のメモをスクリプトや Playwright から読む              |
| MCP stdio — `bunx @chokolademilch7/fusen mcp`                   | サーバー版なら `FUSEN_BASE_URL`（HTTP）。無ければ lite 向けに CDP ポートへ落ちる                | 既定は読みのみ。書きはサーバー版で `FUSEN_ALLOW_WRITE=1` のときだけ | Claude Code など stdio で MCP を話すクライアント           |
| サーバーの HTTP API                                             | 動いている fusen サーバー                                                                       | 読み書き                                                            | 自前のスクリプトや連携                                     |
| Claude Code プラグイン / Agent Plugins                          | fusen の clone で `bun install`。中身は上の MCP とスキル                                        | MCP と同じ                                                          | 読み方の手順（スキル）ごとクライアントに入れる             |

## どれがいちばん安全か

WebMCP はポートを開けない。CDP は 9222 でブラウザの操作権を丸ごと晒す。ただし WebMCP
でも、そのブラウザに繋がったエージェントなら誰でも道具を列挙して呼べる。Claude Code の
ような stdio のエージェントは WebMCP を使えない。そういうクライアントにとって最も狭い
経路は、サーバー版 + `bunx @chokolademilch7/fusen mcp` を HTTP 越しに使うこと。既定で読み取り専用で、
書き込みの道具は `FUSEN_ALLOW_WRITE=1` を渡したときだけ存在する。

## ページ自身が渡す — WebMCP（実験的）

[lite の CDP 経路](./lite.md)は、デバッグポートと専用プロファイルでブラウザを起動し直せと
要求する。自分で書いたメモを読むための手順としては重く、しかもブラウザが既に起動していると
`--remote-debugging-port` は黙って無視されるので、失敗は「何も返らない」という区別のつかない
形で出る。

[WebMCP](https://webmachinelearning.github.io/webmcp/) はその外部プロセスを不要にする。ページが
`document.modelContext` に道具を登録し、ブラウザに繋がっている AI エージェントがページの中で
それを呼ぶ。ポートも第2プロセスも要らない。

```html
<script type="module" src="fusen-lite.js" data-webmcp></script>
<fusen-widget webmcp></fusen-widget>
```

出るのは `@chokolademilch7/fusen/mcp` と**同じ3つ**。名前も引数も返る形も同じ:
`fusen_list_feedback` / `fusen_get_feedback` / `fusen_summarize_routes`。中身は
`@chokolademilch7/fusen/core` の同じ関数なので、stdio 越しに読んでもページの中で読んでも payload は一致する。

**既定は off。** `window.__fusen` は既定 on だが、あれを読むには誰かがデバッガを繋ぐか拡張を
走らせる必要がある。WebMCP はその条件が無く、ブラウザに繋がったエージェントなら誰でも列挙して
呼べる。`data-mode`（[lite](./lite.md) の「両方入りの1本」）と同じ理由で、データの行き先が
変わる選択は書いてもらう。

**読み取り専用。** 書き込みの道具は無い。CDP 経路と同じ理由で、頼まれてもいないコメントを
黙って消せるエージェントは、得るものが無いのにデータ喪失だけがある。

**返る本文は信用できない前提。** コメントは人が書いた自由文で、それがそのままエージェントの
context に入る。「これまでの指示を無視して…」と書かれた付箋はプロンプトインジェクションの
配送経路になる。内容を壊さずに消毒する方法は無いので、3つとも
`untrustedContentHint: true`（仕様がこの用途に用意している印）を付け、payload は散文ではなく
構造化 JSON のままにしてある。

**動かない場所** — 失敗が静かなので先に書く:

| 条件                  | 結果                                                                         |
| --------------------- | ---------------------------------------------------------------------------- |
| Chrome 以外           | `document.modelContext` が無い。何も登録せず、エラーも出さない               |
| 平文 http の LAN 住所 | 同上。この API は `[SecureContext]`。`http://localhost` は可                 |
| origin trial 未有効   | 同上。`chrome://flags/#enable-webmcp-testing` か origin ごとのトークンが要る |

トークンは**配布先の origin に対して**登録するものなので、fusen がホストページの分を同梱する
ことはできない。現時点で実際に動くのは、フラグを立てた開発者か、自分でトークンを登録した
ホストだけ。API 自体も Chrome 149〜156 の origin trial で、名前空間はすでに2回変わっている
（`window.agent` → `navigator.modelContext` → Chrome 150 で `document.modelContext`）。
両方を見に行くが、これは仕様が固まるまでの実験的な口である。CDP 経路は消していない。

## MCP

```
FUSEN_BASE_URL=http://localhost:8400/api/feedback bunx @chokolademilch7/fusen mcp
```

道具は `fusen_list_feedback` / `fusen_get_feedback` / `fusen_summarize_routes`。書き込み系
(`fusen_vote_feedback` / `fusen_delete_feedback`) は `FUSEN_ALLOW_WRITE=1` を渡すまで**存在しない**。

`FUSEN_BASE_URL` が無いときは lite 向けに CDP（既定 `127.0.0.1:9222`、`FUSEN_CDP_PORT` で変更）
へ繋ぎ、デバッグ用ブラウザで開いている**すべてのタブ**でスクリプトを評価して
`window.__fusen` を探す。`window.__fusen` を置いたページなら、どのサイトの返す中身でも
エージェントに渡る。`FUSEN_URL_FILTER` を渡すと、URL にその文字列を含むタブだけに絞れる。
デバッグ用ブラウザは専用プロファイルで起こし、関係ないサイトを開いたままにしない。

名前を `fusen_` で揃えてあるのは見た目の問題ではない。Claude Code は MCP のツール定義を
**既定で遅延**させ、起動時に載せるのは**ツール名とサーバーの instructions だけ**にする。
接頭辞があると検索1回でまとめて見つかり、数百個の名前の中でも持ち主が分かる。
同じ理由でこのサーバーは `instructions` を**置いていない** — 常駐する数少ないものの1つなので、
説明はすべてスキル側（呼ばれたときだけ読まれる）に寄せてある。

プロトコル越しに読むので、デモにも本番にも同じものを向けられる。DB のスキーマには
依存しない。アプリに同居させるなら `createFusenMcpServer({ store })` に自分の store を
そのまま渡せばよく、その場合 HTTP も経由しない。

## プラグイン — AI クライアントに読ませる

fusen のリポジトリ自体がプラグイン1つ。**2つの形式で名乗っている**ので、Claude Code でも、
ベンダー中立の [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec)
に対応したクライアントでも、同じ中身が読める。

### Claude Code

```bash
claude --plugin-dir <fusen を clone した場所>
```

clone した場所で `bun install` を済ませておく。

- `fusen-comments` スキル — コメントの読み方。サーバー版なら MCP、lite ならブラウザ経由を自動で選ぶ
- `fusen-triage` エージェント — コメントを、場所付きの作業リストに変える
- `fusen` MCP サーバー — `FUSEN_BASE_URL` があればサーバーを読み、無ければ CDP 越しにページを読む（lite）

**lite で MCP が「デバッグポートでブラウザが待っていない」と答えるのは正常。** 落とすと
クライアント側で毎回壊れた MCP に見えるので、意図的に起動してブラウザの起こし方を案内している。

AI に貼るだけで導入まで終わるプロンプトは [INSTALL.ja.md](../../../INSTALL.ja.md)。

### Agent Plugins 1.0.0

Claude Code 以外のクライアント向け。読み込ませ方はクライアント側の作法に従う
（仕様が決めているのは**パッケージの形**だけで、入れ方も見せ方も定めていない）。

manifest を2枚置いているのは、1枚で足りないから。Claude Code は `.claude-plugin/` の下しか
見ず、component の位置を manifest から受け取る。Agent Plugins は root の `plugin.json` しか
見ず、位置は固定（`skills/`、`mcp.json`）で manifest からの上書きを**禁じている**。
互いに相手のファイルを読まないので、両方を満たす1枚は存在しない。

| ファイル                     | 読む人              |
| ---------------------------- | ------------------- |
| `.claude-plugin/plugin.json` | Claude Code         |
| `.mcp.json`                  | Claude Code         |
| `plugin.json`                | Agent Plugins 1.0.0 |
| `mcp.json`                   | Agent Plugins 1.0.0 |

`skills/` と `packages/mcp` は共有で、増えたのは manifest 2枚だけ。
中身がずれないよう `bun run check:plugin` が両者を突き合わせる（`verify` に入っている）。

仕様が定めるのは**スキルと MCP サーバーの2つだけ**なので、Agent Plugins 側の
クライアントに見えるのは `fusen-comments` スキルと `fusen` MCP サーバー。
`fusen-triage` エージェントは Claude Code だけのものになる。

`mcp.json` は `env` を持たない。展開されるのは `${PLUGIN_ROOT}` と `${PLUGIN_DATA}` の
2つだけで、`${FUSEN_BASE_URL}` と書いてもその文字列のまま渡る。それは「未設定」より
悪い — MCP サーバーは FUSEN_BASE_URL が**在るかどうか**で分岐するので、壊れた URL の
HTTP 読みに倒れてブラウザ経由へ落ちなくなる。サーバー版を読ませたい人は、
クライアントを起こす環境で `FUSEN_BASE_URL` を渡す。

`command` は `bun` なので、plugin root で `bun install` が済んでいることが前提。
