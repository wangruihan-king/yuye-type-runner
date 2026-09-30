import { readFileSync, writeFileSync } from 'fs';

const r = f => readFileSync(new URL(f, import.meta.url), 'utf8');
let html = r('./template.html');
const three = r('./lib/three.min.js');
const exprB64 = 'data:image/png;base64,' + readFileSync(new URL('./assets/expr.png', import.meta.url)).toString('base64');
const game = [
  './src/words.js', './src/core.js', './lib/refworld.js', './src/env.js', './src/city.js',
  './src/character.js', './src/actors.js', './src/learning.js', './src/quest-rules.js', './src/quest.js', './src/typing.js', './src/main.js',
].map(r).join('\n;\n').replace('__EXPR_DATA__', () => exprB64);
const css = r('./src/style.css');

const safe = s => s.includes('</script') ? s.replace(/<\/script/gi, '<\\/script') : s;
html = html.replace('/*__STYLE__*/', () => css)
           .replace('/*__THREE__*/', () => safe(three))
           .replace('/*__GAME__*/', () => safe(game));
writeFileSync(new URL('./index.html', import.meta.url), html);
console.log('built index.html:', (html.length / 1024).toFixed(0) + ' KB');
