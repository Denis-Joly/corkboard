#!/usr/bin/env node
/**
 * Generate the 300-card perf fixture board (the standing performance
 * gate): mixed text notes + connections across a wide canvas.
 *
 *   node scripts/gen-fixture.mjs [name]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const name = process.argv[2] ?? 'Perf Fixture';
const dir = join(homedir(), 'CorkBoards', name);
mkdirSync(join(dir, 'assets'), { recursive: true });

const COLORS = ['paper', 'yellow', 'pink', 'blue', 'green', 'orange'];
const STYLES = ['note', 'note', 'note', 'sticky', 'heading'];
const WORDS =
  'idea thread clue witness timeline suspect lead theory motive alibi evidence pattern link source archive'.split(' ');

let seed = 42;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const now = new Date().toISOString();
const cards = Array.from({ length: 300 }, (_, i) => ({
  id: `perf-card-${i}`,
  type: 'text',
  x: Math.round((i % 20) * 300 + rand() * 120),
  y: Math.round(Math.floor(i / 20) * 220 + rand() * 80),
  w: 240,
  h: 56 + Math.floor(rand() * 60),
  color: pick(COLORS),
  z: (i + 1) * 10,
  createdAt: now,
  text: `${pick(WORDS)} ${pick(WORDS)} ${pick(WORDS)} #${i}`,
  style: pick(STYLES),
}));

const connections = Array.from({ length: 120 }, (_, i) => {
  const from = Math.floor(rand() * 300);
  let to = Math.floor(rand() * 300);
  if (to === from) to = (to + 7) % 300;
  return {
    id: `perf-conn-${i}`,
    from: `perf-card-${from}`,
    to: `perf-card-${to}`,
    label: rand() > 0.8 ? pick(WORDS) : null,
    color: null,
    kind: 'string',
    createdAt: now,
  };
});

const doc = {
  schemaVersion: 1,
  appVersion: 'fixture',
  id: 'perf-fixture-300',
  name,
  createdAt: now,
  modifiedAt: now,
  viewport: { x: 0, y: 0, zoom: 0.35 },
  cards,
  connections,
};

writeFileSync(join(dir, 'board.json'), JSON.stringify(doc, null, 2));
console.log(`wrote ${join(dir, 'board.json')} (${cards.length} cards, ${connections.length} strings)`);
