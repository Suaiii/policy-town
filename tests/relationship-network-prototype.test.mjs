import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = new URL('../.superpowers/brainstorm/21166-1786465322/content/relationship-network-prototype.html', import.meta.url);
const html = await readFile(file, 'utf8');

assert.match(html, /基础 System Prompt/);
assert.match(html, /推演增量信息/);
assert.match(html, /长期记忆/);
assert.match(html, /事件与立场更新/);
assert.match(html, /agent-portraits\/zhang-hua\.png/);
assert.match(html, /agent-portraits\/li-chen\.png/);
assert.match(html, /agent-portraits\/wang-shan\.png/);
