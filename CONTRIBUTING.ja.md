[English](./CONTRIBUTING.md) | 日本語

# 開発に参加する

## 必要なもの

- [Bun](https://bun.sh) 1.4.3（CI と同じ版。`.github/workflows/ci.yml` で固定している）
- examples の受け入れテストを回すなら Chromium: `bunx playwright install chromium`

## 始め方

```sh
git clone https://github.com/chokolademilch7/fusen
cd fusen
bun install
bun run hooks:install   # 最初に一度だけ。main への直接 push を止める pre-push フック
bun run verify          # lint + format + テスト + 型 + ビルド（npm パッケージとその import 検査を含む）+ 3つのゲート（check:bundle / check:freshness / check:plugin）
```

`verify` は offline でも通る。push する前に手元で緑にしておく。

**main へ直接 push しない。** ブランチを切って PR を出し、CI の緑を見てからマージする。
`hooks:install` が入れる pre-push フックは、手元で「うっかり」main へ push するのを止めるだけで、
強制ではない（`--no-verify` で外せる）。

## PR

- 1つの PR には1つの変更。挙動を変えたら、それを確かめるテストも一緒に入れる
- 見た目やウィジェットの挙動を変えたら、examples の受け入れテストも回す。リポジトリルートで
  `bun run build` してから、react / vue はそれぞれのディレクトリで `bun install`、そのうえで
  `(cd examples/plain && bunx playwright test)`（react / vue も同様）。
  手順は [examples/README.md](./examples/README.md) の「Acceptance tests」
- `packages/lite/src/webmcp.ts` を触ったら `bun run scripts/check-webmcp.ts` を手で回し、
  使った Chrome のバージョンを PR に書く（`verify` には入っていない。理由は下の「WebMCP の手動チェック」）
- `packages/lite/dist/fusen-lite.js` を作り直したら `examples/plain/fusen-lite.js` へコピーして一緒にコミットする

## 検証

```
bun run verify        # lint + format + テスト + 型 + ビルド（npm パッケージとその import 検査を含む）+ 3つのゲート（check:bundle / check:freshness / check:plugin）
```

CI は pull_request と main への push で回る。`verify` に加えて、3 つの例
(plain / react / vue) の受け入れテストを実ブラウザで matrix 実行する。

### WebMCP の手動チェック

`verify` に入っていない手動チェックが1つある。

```
bun run scripts/check-webmcp.ts
```

WebMCP は origin trial なので、Chrome 149〜156 とフラグという**機械側の前提**が要る。
どこでも通らなければならない `verify` に入れると、正直な実行が落ちるか、意味を失うまで
skip されるかのどちらかになる（`read-via-cdp.ts` が script であるのと同じ理由）。
`webmcp.ts` を触ったら手で回して、Chrome のバージョンを PR に書く。

偽物の `ModelContext` に対する `webmcp.test.ts` では**原理的に確かめられないこと**を
これが見る: `execute` の返す `{content:[…]}` がブラウザの望む形か、API が本当に
`document.modelContext` にあるか、そして `data-webmcp` の無いページが何も出さないか。
最後の1つが本命で、既定が漏れていても他のどの角度からも正常に見える。

### manifest ゲート

**manifest ゲート**（`bun run check:plugin`）は、2枚の manifest がずれることと、
片方が仕様から外れることを止める。どちらも壊れ方が静かで、クライアントは黙って
読み込みを続ける（不明フィールドは「報告して無視」、古い `version` は古い cache）。
仕様の schema は取りに行かない — `verify` は offline でも通る必要がある。

### パリティゲート

**パリティゲート**が要。`packages/core/test/anchor-parity.test.ts` が、切り出し前の
エンジン(`packages/core/test/pre-extraction-anchor.ts` に fixture として凍結)と
現行エンジンに同じ入力を与え、許容幅ゼロで一致を要求する。切り出しが挙動を
保存したことを示す唯一の証拠なので、この fixture は消してはいけない。

空振り防止として、解決に成功した件数の下限を両側から挟んである
(全件 null でも全件成功でも落ちる)。ゲート自体に歯があることは、
両エンジンに3通りの摂動を入れて実際に赤くなることを確認済み。

## 脆弱性

脆弱性は PR や issue ではなく [SECURITY.md](./SECURITY.md) の手順で報告してください。
