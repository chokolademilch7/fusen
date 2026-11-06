# fusen を入れる — AI に貼るプロンプト

[English](./INSTALL.md) | 日本語

**下の枠の中身をまるごとコピーして、コーディングエージェントに貼ってください。** そのまま
導入まで終わります。人間向けの概要は [README](./README.ja.md) にあります。

貼る前に1つだけ決めてください。

|                | lite                           | サーバー版                |
| -------------- | ------------------------------ | ------------------------- |
| 付箋の保存先   | ブラウザ（IndexedDB）          | あなたのサーバー + SQLite |
| 用意するもの   | **何もいらない**               | サーバープロセスを1つ     |
| 付箋が見える人 | **自分だけ、このブラウザだけ** | ページを開いた人全員      |
| 向いている用途 | 開発中に自分用の付箋を貼る     | 他の人から意見を集める    |

迷ったら **lite**。あとからサーバー版へ移せます（ウィジェットは同じです）。

---

```
fusen を私のプロジェクトに導入してください。fusen は、ページの要素を選んで付箋を貼り、
付箋を一覧で見られるウィジェットです。custom element 1個、<fusen-widget> として、
npm パッケージ `fusen` で配られています。

## 私が選んだ構成

lite（サーバー無し、付箋はブラウザに保存）。
（サーバー版にしたい場合は、貼る前にこの行を「サーバー版でお願いします」に書き換えてください。）

## やってほしいこと

### 1. 私のプロジェクトを確認する

どんなプロジェクトか調べてください。素の HTML か、React か、Vue か、他の何かか。
静的ファイルをどこから配信しているか（public/、static/、dist/ など）も見てください。
推測せず、実際のファイルを読んで判断してください。

### 2. ウィジェットを組み込む

Bun で入れてください。

    bun add fusen

lite なら、製品の全部が自己完結した1ファイルです（約 170 KB、gzip で約 50 KB）。

    node_modules/fusen/dist/fusen-lite.js

これを私の静的ファイル置き場にコピーしてそこから読み込むか、このページが CDN から
スクリプトを読み込んでよいなら次を使ってください。

    https://cdn.jsdelivr.net/npm/fusen/dist/fusen-lite.js

ページに次の2行を足してください。

    <script type="module" src="<置いた場所>/fusen-lite.js"></script>
    <fusen-widget route="/"></fusen-widget>

フレームワークごとの注意:
- React: <fusen-widget route="/" /> とそのまま書けます。読み込みは副作用インポート
  (import "fusen/dist/fusen-lite.js") で構いません。
- Vue: Vue のコンパイラが <fusen-widget> を知らないコンポーネントとして警告します。
  vite の vue プラグインに
  template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('fusen-') } }
  を設定してください。これを飛ばすとビルド時に警告が出ます。
- ルーティングがあるなら、画面遷移のたびに route 属性を今のパスに更新してください。
  付箋がどのページのものかは、これで決まります。

lite にはビルド工程も設定ファイルもサーバーも要りません。

サーバー版を選んだ場合だけ、次もやってください。

- fusen-lite.js の代わりに node_modules/fusen/dist/fusen.js を使う（data-mode を
  付けなければサーバー版で動きます）。
- fusen のサーバーを別プロセスで起動する（Bun が要ります）。

      bunx fusen serve --db ./fusen.sqlite --port 8400

  待ち受けは既定で 127.0.0.1 です（同じマシンのプロキシからだけ届きます）。
  コンテナの中で動かすなら --host 0.0.0.0 を足してください。

- 私のサーバー（nginx など）で /api/feedback をそこへ流し、ページから「同じオリジン」で
  届くようにする。fusen のサーバーは CORS ヘッダを返さないので、別オリジンでは動きません。

      location = /api/feedback { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
      location /api/feedback/ { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }

  私のアプリが Bun で動いていて、コードを触ってよいなら、プロキシの代わりに
  fusen/server を直接マウントしても構いません（fusen の README のサーバーガイドを参照）。

### 3. AI から付箋を読めるようにする（プラグイン）

fusen には Claude Code プラグインが同梱されています。入れると、私が「コメント見て」と
言ったときに、あなたがページに残された付箋を読めるようになります。

    git clone https://github.com/chokolademilch7/fusen && (cd fusen && bun install)
    claude --plugin-dir ./fusen

サーバー版なら、クライアントを起動する環境で FUSEN_BASE_URL（例:
http://localhost:8400/api/feedback）を渡してください。MCP サーバーが実データを読みます。

プラグインが持ってくるもの:
- fusen-comments スキル — 付箋の読み方（サーバー版なら MCP、lite ならブラウザ）
- fusen-triage エージェント — 付箋を作業リストに変える
- fusen MCP サーバー — FUSEN_BASE_URL があればサーバーを読みます。lite では
  --remote-debugging-port 付きで起動したブラウザを通してページを読みます

lite でそのブラウザが動いていないと、MCP サーバーは起動のしかたを案内するエラーを返します。
これは想定どおりで、壊れているのではありません。lite は意図的にサーバーを持ちません。

### 4. 動くことを確認する

「入れました」で終わらせないでください。実際に動かして確かめてください。

a. ページを開く。右下にバッジが出ているはずです。
b. バッジを押し、ページのどこかを選び、付箋を書いて投稿する。モードが閉じます。
   もう一度バッジを押してモードに入ると、印が出ます。
c. 一覧を開いて、書いた付箋があることを確認する。
d. ページを再読み込みしてからもう一度モードに入り、印が残っていることを確認する
   （印はモード中しか描かれません。消えたと勘違いしやすいので注意）。
e. ブラウザの devtools コンソールで次を実行し、書いた付箋が返ることを確認する。

       await window.__fusen.dump()

   サーバー版では window.__fusen は出ません。代わりにページと同じオリジンで
   /api/feedback を開き、付箋が JSON で返ることを確認してください。

Playwright などで自動化できるなら、それでも構いません。ただし要素を選んでいる間は
全画面のオーバーレイが pointer events を受けるので、要素ロケーターのクリックは
"another element would receive the click" で止まります。代わりに座標でクリックしてください。

    const box = await page.locator('selector').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

### 5. 私に報告する

- 触ったファイル
- 4 で実際に確認できたこと（できなかったことがあれば、それも正直に）
- lite を選んだ場合は、付箋がこのブラウザにだけ保存されることを一言添えてください。
  別の端末や別のブラウザからは見えません。

## やらないでほしいこと

- fusen 本体（node_modules/fusen）を書き換えないでください。私の側の設定だけで足ります
- 確認していないことを「動きます」と言わないでください
```

---

## 貼ったあとに人間がやること

なし、のはずです。うまくいかなかったときは、ページに `window.__fusen` があるかを devtools で
見てください。無ければスクリプトが読み込めていません（パスか MIME タイプ）。あるのに空なら、
まだ付箋が1枚も書かれていないだけです。
