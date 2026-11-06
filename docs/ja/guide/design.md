[← README](../../../README.ja.md) · [English](../../guide/design.md) | 日本語

# 設計上の約束

**重なり作法。** 全画面の透明レイヤを最前面に置くが、要素を選んでいる最中以外は
クリックを素通しする。フォーカスはパネルを開いている間だけ閉じ込め、Esc で抜ける。
公開するスタイル面は CSS カスタムプロパティのみで、内部構造は出さない
(`::part` なし)。アイコンは同梱インライン SVG なのでフォント依存が無く、
CSS は JS に内包してあるので別途スタイルシートを置く必要も無い。
SSR では何も描画せず、ブラウザで起動してから描く。

**状態名は公開契約。** custom element は自分自身(light DOM 側)に
`data-machine="feedback"` と `data-state` を出す。値は
`idle` / `mode.picking` / `mode.composing` / `mode.submitting` / `mode.error` の5つ。

外側のコードがページ状態を集めるとき `document.querySelectorAll("[data-machine]")` を
使うが、生の DOM API は shadow root を貫通しないため、host 自身に出す必要がある。

この契約から**状態機械を並行(parallel)にできない**という制約が派生する。
状態名の結合方法が内側と外側で違い(`" "` と `"."`)、今一致しているのは
非並行だからで、並行にすると外側の判定が無言で外れる。
