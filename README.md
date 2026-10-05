# 那個陶瓷工作室 That Studio.

## 怎麼打開
直接雙擊 `index.html`（要有網路，3D 用的 three.js 是從網路載入的）。

## 互動
- 底部跑馬燈自動捲動，滑鼠移上去會暫停
- 中間陶罐會自己轉；左右拖曳可以轉它，上下拖曳可以換角度
- 點一下陶罐：新釉從罐口往下流，整站主題色跟著換（素燒陶 → 青瓷 → 霽藍 → 郎窯紅 → 黃釉 → 天目）
- 第 4、5 下開始出現裂痕，第 6 下陶罐碎掉；按「再捏一個」碎片會飛回去，變回素燒陶
- 右上角喇叭可以關音效（音效是程式即時合成的，沒有音檔）

## 想改東西去哪裡改
| 想改的 | 檔案 |
|---|---|
| 跑馬燈文字 | `index.html` 裡 `marquee-track` 的那一段 `<p>`（程式會自動複製到夠長） |
| 跑馬燈速度 | `js/ui.js` 最上面的 `MARQUEE_SPEED`（每秒幾 px，越大越快） |
| 釉色／主題色 | `js/themes.js` |
| 點幾下會破 | `js/themes.js` 最下面的 `BREAK_AFTER` |
| 陶罐形狀 | `js/pot-geometry.js` 最上面的 `PROFILE`（半徑, 高度）座標 |
| 標題字大小 | `css/style.css` 最上面的 `--title-l`、`--title-r`、`--pot-size` |

## 檔案結構
```
index.html          頁面
css/style.css       樣式（主題色都是 CSS 變數）
js/themes.js        六組釉色
js/pot-geometry.js  陶罐形狀、陶土貼圖、裂痕、釉色往下流的效果
js/shards.js        碎片切割與物理
js/sound.js         音效
js/ui.js            網頁上的文字、按鈕
js/app.js           3D 場景與互動（主程式）
```
