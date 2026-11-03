// Builds index.html (the game) and agenda-artifact.html (the claude.ai artifact) into the repo root.
// Run from the repo root:  node src/build.js
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const FILES = ['camera3d.js', 'floor.js', 'room.js', 'match.js', 'furniture.js', 'characters.js', 'pies.js', 'movement.js', 'social.js', 'world.js'];
for (const f of FILES) new Function(src(f)); // each file must parse
const code = FILES.map(src).join('\n');
const page = (threeUrl, extra = '') => src('template.html').replace('/*THREE_URL*/', () => threeUrl).replace('/*CODE*/', () => extra + code);
// the game: three.js from the repo
fs.writeFileSync('index.html', page('./vendor/three.module.min.js'));
// the artifact: three.js from jsDelivr (same version as vendor/)
// (the artifact host wraps the page in its own document: keep the title, style and body only)
const art = page('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js');
fs.writeFileSync('agenda-artifact.html', art.slice(art.indexOf('<title>'), art.indexOf('</head>')) + '\n' + art.slice(art.indexOf('<body>') + 6, art.lastIndexOf('</body>')));
console.log('built index.html and agenda-artifact.html');
