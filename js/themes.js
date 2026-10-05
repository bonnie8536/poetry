/* ============================================================
   釉色主題
   每點一下陶罐就換下一組：整站主題色（導覽列、跑馬燈、虛線）
   ＋ 陶罐本體的釉色，一起換。
   ============================================================ */
window.Pottery = window.Pottery || {};

Pottery.THEMES = [
  // 第 0 組＝原稿配色：綠色主題＋素燒陶（沒上釉，霧面）
  { name: '素燒陶', en: 'Terracotta',      site: '#67C85C', accent: '#F6B732', pot: '#B86F4F', roughness: 0.92, clearcoat: 0, bump: 1.0 },
  { name: '青瓷',   en: 'Celadon',         site: '#4E9E8A', accent: '#F2C55C', pot: '#9CC5AE', roughness: 0.34, clearcoat: 1, bump: 0.35 },
  { name: '霽藍',   en: 'Cobalt Blue',     site: '#2D5DB3', accent: '#F6C445', pot: '#1F4C9E', roughness: 0.30, clearcoat: 1, bump: 0.3 },
  { name: '郎窯紅', en: 'Oxblood Red',     site: '#B32C37', accent: '#F7C948', pot: '#9A1A26', roughness: 0.28, clearcoat: 1, bump: 0.3 },
  { name: '黃釉',   en: 'Imperial Yellow', site: '#D89A12', accent: '#8A4B12', pot: '#E0AA22', roughness: 0.30, clearcoat: 1, bump: 0.3 },
  { name: '天目',   en: 'Tenmoku',         site: '#3A2B23', accent: '#D98A3A', pot: '#2A1C16', roughness: 0.22, clearcoat: 1, bump: 0.25 },
];

// 點超過這個次數，陶罐就會破掉（第 6 下）
Pottery.BREAK_AFTER = 5;
