import fs from 'fs';
import path from 'path';

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- 背景円 -->
  <circle cx="256" cy="256" r="256" fill="#4A90E2"/>
  
  <!-- カレンダーの背景 -->
  <rect x="106" y="96" width="300" height="320" rx="20" fill="white"/>
  
  <!-- カレンダーのヘッダー部分 -->
  <rect x="106" y="96" width="300" height="80" rx="20" fill="#2C3E50"/>
  
  <!-- カレンダーの日付ライン -->
  <line x1="156" y1="226" x2="356" y2="226" stroke="#E0E0E0" stroke-width="2"/>
  <line x1="156" y1="276" x2="356" y2="276" stroke="#E0E0E0" stroke-width="2"/>
  <line x1="156" y1="326" x2="356" y2="326" stroke="#E0E0E0" stroke-width="2"/>
  
  <!-- カレンダーの縦線 -->
  <line x1="206" y1="196" x2="206" y2="356" stroke="#E0E0E0" stroke-width="2"/>
  <line x1="256" y1="196" x2="256" y2="356" stroke="#E0E0E0" stroke-width="2"/>
  <line x1="306" y1="196" x2="306" y2="356" stroke="#E0E0E0" stroke-width="2"/>
  
  <!-- 強調表示された日付 -->
  <rect x="206" y="276" width="50" height="50" fill="#4A90E2" opacity="0.3"/>
  <text x="221" y="308" font-family="Arial" font-size="24" fill="#2C3E50">15</text>
</svg>
`;

const sizes = [192, 256, 384, 512];

// アイコンディレクトリの作成
const iconDir = path.join(process.cwd(), 'public', 'icons');
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// SVGファイルの保存
fs.writeFileSync(path.join(iconDir, 'icon.svg'), iconSvg);

// manifest.jsonの作成
const manifest = {
  "name": "勤務調整アプリ",
  "short_name": "勤務調整",
  "description": "勤務調整システム",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4A90E2",
  "icons": sizes.map(size => ({
    "src": `/icons/icon-${size}x${size}.png`,
    "sizes": `${size}x${size}`,
    "type": "image/png",
    "purpose": "any maskable"
  }))
};

fs.writeFileSync(
  path.join(process.cwd(), 'public', 'manifest.json'),
  JSON.stringify(manifest, null, 2)
); 