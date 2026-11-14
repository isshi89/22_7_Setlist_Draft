/* =========================================================
   22/7 セトリドラフト  動作
   読み込み順：data.js（EPS）→ このファイル

   目次
     1. 設定（ルールや見た目に関わる定数）
     2. 状態（ゲームの進行状況）
     3. 便利関数
     4. 描画（画面を更新する処理）
     5. 操作（ボタンなどのイベント）
     6. 画像出力
     7. 起動
   ========================================================= */
"use strict";

/* ---------------------------------------------------------
   1. 設定
   --------------------------------------------------------- */

// ルーレットの目：data.js に書いたEP番号をそのまま使う（並び順も同じ）
const KEYS = EPS.map(e => e[0]);

// セットリストのテンプレート
//   ["s", "枠ID"] = 曲の枠 / ["mc"] = MCの区切り
//   枠IDが "EN" で始まるとアンコール表記、それ以外は「M＋枠ID」で表示
//   → 曲数やMCの位置を変えたいときはここを編集
const LAYOUT = [
  ["s", "1"], ["s", "2"], ["s", "3"], ["s", "4"],
  ["mc"],
  ["s", "5"], ["s", "6"], ["s", "7"],
  ["mc"],
  ["s", "8"], ["s", "9"], ["s", "10"],
  ["s", "EN1"], ["s", "EN2"],
];
const SLOT_IDS = LAYOUT.filter(x => x[0] === "s").map(x => x[1]);

const STORAGE_KEY = "s227v2";                 // 進行状況の保存キー（ブラウザのlocalStorage）
const SITE_TITLE = "22/7セトリドラフト";     // 画像のタイトルのベース
const SPIN_FRAMES = 22;                     // ルーレットの切り替え回数
const SPIN_INTERVAL = 70;                   // 切り替え間隔（ミリ秒）。大きいほどゆっくり
const RESET_CONFIRM_MS = 3000;              // リセット確認の受付時間（ミリ秒）

// 曲データ（data.js）を「1曲=1行」の配列に変換：{ k:EP番号, ep:EPタイトル, tr:トラック番号, t:曲名 }
const ROWS = EPS.flatMap(([k, ep, songs]) =>
  songs.map((t, i) => ({ k, ep: ep || keyLabel(k), tr: i + 1, t }))
);

/* ---------------------------------------------------------
   2. 状態
   --------------------------------------------------------- */
const S = {
  theme: "",      // 入力されたテーマ
  drawn: [],      // 出た目（再び出ないように記録）
  cur: null,      // 今回出た目
  slots: {},      // 配置済みの曲  例：{ "1": { k, ep, t }, "EN1": {...} }
  sel: null,      // 選択中の曲名
  pending: false, // true = 目が出たが、まだ曲を配置していない
  skipped: false, // true = 出たEPの曲がすべて配置済みで、この目は使えなかった
};

// 進行状況をブラウザに保存・復元（失敗しても動くようtry/catchで囲む）
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (e) {}
}
function restore() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (v) Object.keys(S).forEach(k => { if (k in v) S[k] = v[k]; });
  } catch (e) {}
}

/* ---------------------------------------------------------
   3. 便利関数
   --------------------------------------------------------- */
const $ = id => document.getElementById(id);

// HTMLに文字を入れるときの安全対策（< > & " を変換）
const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 目の表示：数字は2桁（1→"01"）、それ以外はそのまま（"C"、"A1"、"3rd"）
function keyLabel(k) { return /^\d+$/.test(k) ? String(k).padStart(2, "0") : k; }

// 枠の表示名："1"→"M1"、"EN1"→"EN1"
const slotLabel = id => (id.startsWith("EN") ? id : "M" + id);

// 画像・プレビュー用のタイトル  例：22/7セトリドラフト-夏曲編-
function title() {
  const t = (S.theme || "").trim();
  return SITE_TITLE + (t ? "-" + t + "編-" : "");
}

// すでに配置された曲名の一覧（同じ曲を2回置けないようにするため）
const placedTitles = () => Object.values(S.slots).map(s => s.t);

// そのEPに、まだ配置できる曲が残っているか
const hasAvailable = k => ROWS.some(r => r.k === k && !placedTitles().includes(r.t));

/* ---------------------------------------------------------
   4. 描画
   --------------------------------------------------------- */
function render() {
  const curRows = ROWS.filter(r => r.k === S.cur);   // 今回出たEPの曲
  const full = SLOT_IDS.every(id => S.slots[id]);    // 全枠が埋まったか

  // テーマ入力欄とタイトルのプレビュー
  $("theme").value = S.theme || "";
  $("tprev").textContent = "出力タイトル：" + title();

  // 1〜16・Cの一覧
  $("chips").innerHTML = KEYS.map(k =>
    `<span class="chip ${S.drawn.includes(k) ? "used" : ""} ${S.cur === k ? "now" : ""}">${keyLabel(k)}</span>`
  ).join("");

  // ルーレット表示と「回す」ボタン（配置待ち・完成・全部出た後は押せない）
  $("num").textContent = S.cur ? keyLabel(S.cur) : "?";
  $("epn").textContent = curRows[0] ? curRows[0].ep : "";
  $("spin").disabled = S.pending || full || S.drawn.length >= KEYS.length;

  // ガイドメッセージ
  $("msg").textContent = full ? "セットリスト完成！"
    : S.pending ? "曲を選んで、枠に配置してください"
    : S.skipped ? "このEPの曲はすべて配置済みのため、この目は使えませんでした" : "";

  // 曲の選択（配置待ちのときだけ表示）
  $("songCard").hidden = !S.pending;
  if (S.pending) {
    const used = placedTitles();
    $("songs").innerHTML = curRows.map(r =>
      `<button class="song ${S.sel === r.t ? "sel" : ""}" data-t="${esc(r.t)}" ${used.includes(r.t) ? "disabled" : ""}>` +
      `<b>${r.tr}</b>${esc(r.t)}</button>`
    ).join("") || "<div class='msg'>このEPの曲データがありません</div>";
  }

  // セットリスト（配置済み／空き枠／MC）
  $("list").innerHTML = LAYOUT.map(x => {
    if (x[0] === "mc") return `<div class="mc">MC</div>`;
    const id = x[1], s = S.slots[id], lab = slotLabel(id);
    if (s) {
      return `<div class="slot fill"><span class="no">${lab}</span>${esc(s.t)}<small>${esc(s.ep)}</small></div>`;
    }
    const hot = S.pending && S.sel;   // 曲を選択中なら空き枠を強調して押せるようにする
    return `<button class="slot ${hot ? "hot" : ""}" data-i="${id}" ${hot ? "" : "disabled"}>` +
           `<span class="no">${lab}</span><span style="color:var(--mute)">—</span></button>`;
  }).join("");

  save();
}

/* ---------------------------------------------------------
   5. 操作
   --------------------------------------------------------- */

// 「回す」：まだ出ていない目からランダムに1つ選び、演出のあと確定
$("spin").onclick = () => {
  const left = KEYS.filter(k => !S.drawn.includes(k));
  if (!left.length) return;
  const pick = left[Math.floor(Math.random() * left.length)];

  $("spin").disabled = true;
  let n = 0;
  const timer = setInterval(() => {
    // 演出：全部の目からランダムに表示を切り替える
    $("num").textContent = keyLabel(KEYS[Math.floor(Math.random() * KEYS.length)]);
    if (++n > SPIN_FRAMES) {
      clearInterval(timer);
      S.cur = pick; S.drawn.push(pick);
      S.pending = hasAvailable(pick); S.skipped = !S.pending; S.sel = null;
      render();
    }
  }, SPIN_INTERVAL);
};

// 曲をタップ → 選択
$("songs").onclick = e => {
  const b = e.target.closest(".song");
  if (!b || b.disabled) return;
  S.sel = b.dataset.t;
  render();
};

// 空き枠をタップ → 選択中の曲を配置（配置後は変更不可）
$("list").onclick = e => {
  const b = e.target.closest(".slot");
  if (!b || !b.dataset.i || !S.sel || !S.pending) return;
  const r = ROWS.find(x => x.k === S.cur && x.t === S.sel);
  if (!r) return;
  S.slots[b.dataset.i] = { k: r.k, ep: r.ep, t: r.t };
  S.pending = false; S.sel = null;
  render();
};

// テーマ入力：入力のたびに保存・プレビュー更新（render()は呼ばない＝入力中にカーソルが飛ばない）
$("theme").oninput = e => {
  S.theme = e.target.value;
  $("tprev").textContent = "出力タイトル：" + title();
  save();
};

// リセット：誤操作防止のため2回押しで実行（途中でも、いつでもOK）
let resetTimer = null;
$("reset").onclick = () => {
  const btn = $("reset");
  if (!resetTimer) {   // 1回目：確認状態にする
    btn.textContent = "もう一度押すとリセット";
    resetTimer = setTimeout(() => { resetTimer = null; btn.textContent = "リセット"; }, RESET_CONFIRM_MS);
    return;
  }
  // 2回目：実行（テーマは残す）
  clearTimeout(resetTimer); resetTimer = null; btn.textContent = "リセット";
  S.drawn = []; S.cur = null; S.slots = {}; S.sel = null; S.pending = false; S.skipped = false;
  render();
};

/* ---------------------------------------------------------
   6. 画像出力（canvasに描いてPNGで保存）
   --------------------------------------------------------- */

// 文字が幅に収まるまでフォントを小さくする
function fit(g, text, size, maxW, font, weight) {
  let s = size;
  g.font = `${weight} ${s}px ${font}`;
  while (g.measureText(text).width > maxW && s > 14) {
    s -= 2;
    g.font = `${weight} ${s}px ${font}`;
  }
}

// 角丸の四角のパスを作る
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function makeImage() {
  // ---- 画像のサイズ・余白（ここを変えるとレイアウトが変わる） ----
  const W = 1080;      // 画像の幅
  const ROW_H = 76;    // 曲1行の高さ
  const MC_H = 44;     // MC区切りの高さ
  const TOP = 170;     // 見出しの高さ（リスト開始位置）
  const PAD = 60;      // 左右の余白
  const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';
  // ---- 色（画像は常に白ベース） ----
  const C = { blue: "#5aa6f0", light: "#8fe3f2", ink: "#1e2b36", mute: "#7b8b97",
              card: "#f6fbfe", line: "#dbeaf3", empty: "#b8c6d0" };

  const H = TOP + LAYOUT.reduce((a, x) => a + (x[0] === "mc" ? MC_H : ROW_H), 0) + 60;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");

  // 背景と、上下のグラデ帯
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, C.light); grad.addColorStop(1, C.blue);
  g.fillStyle = grad; g.fillRect(0, 0, W, 14); g.fillRect(0, H - 14, W, 14);

  // 見出し
  g.textBaseline = "middle"; g.textAlign = "left";
  g.fillStyle = grad; g.font = `700 28px ${FONT}`; g.fillText("22/7", PAD, 62);
  g.fillStyle = C.ink; fit(g, title(), 44, W - PAD * 2, FONT, "700"); g.fillText(title(), PAD, 112);

  // セットリスト本体
  let y = TOP;
  LAYOUT.forEach(x => {
    if (x[0] === "mc") {   // MC：線の中央に「MC」
      g.fillStyle = grad; g.fillRect(PAD, y + MC_H / 2 - 1, W - PAD * 2, 2);
      g.fillStyle = "#fff"; g.fillRect(W / 2 - 44, y + 6, 88, MC_H - 12);
      g.fillStyle = C.mute; g.font = `600 20px ${FONT}`; g.textAlign = "center";
      g.fillText("MC", W / 2, y + MC_H / 2); g.textAlign = "left";
      y += MC_H; return;
    }
    const id = x[1], s = S.slots[id];
    // 行の背景
    roundRect(g, PAD, y + 4, W - PAD * 2, ROW_H - 8, 14);
    g.fillStyle = C.card; g.fill(); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
    // 枠ラベル（M1, EN1...）
    g.fillStyle = C.blue; g.font = `700 24px ${FONT}`; g.fillText(slotLabel(id), PAD + 24, y + ROW_H / 2);
    if (s) {   // 曲名とEPタイトル
      g.fillStyle = C.ink; fit(g, s.t, 30, W - PAD * 2 - 150, FONT, "600");
      g.fillText(s.t, PAD + 110, y + ROW_H / 2 - 9);
      g.fillStyle = C.mute; fit(g, s.ep, 20, W - PAD * 2 - 150, FONT, "400");
      g.fillText(s.ep, PAD + 110, y + ROW_H / 2 + 17);
    } else {   // 未配置
      g.fillStyle = C.empty; g.font = `400 28px ${FONT}`; g.fillText("—", PAD + 110, y + ROW_H / 2);
    }
    y += ROW_H;
  });

  return new Promise(res => c.toBlob(res, "image/png"));
}

// 「画像で保存」：PNGを作り、aタグのdownloadでダウンロード
$("img").onclick = async () => {
  try {
    const blob = await makeImage();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "setlist.png";   // ← 保存されるファイル名
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    $("msg").textContent = "画像を保存しました";
  } catch (e) {
    $("msg").textContent = "画像を保存できませんでした";
  }
};

/* ---------------------------------------------------------
   7. 起動
   --------------------------------------------------------- */
restore();   // 前回の続きを復元
render();    // 画面を描画
