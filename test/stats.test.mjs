// 상점·마구간의 스탯 4개
import test from 'node:test';
import assert from 'node:assert/strict';
import { statsFor } from '../stats.js';

const base = { staff: 'oak', hat: 'felt', robe: 'rags', gear: 'nogear' };
test('스탯 4개: 참나무 타격 29, 마법 100, 마력통 61, 펠트 버티기 108', () => {
  assert.deepEqual(statsFor(base, null), { hit: 29, magic: 100, mana: 61, hold: 108, bonus: { hit: 0, magic: 0, mana: 0, hold: 0 } });
});
test('전직 보너스: 바람 타격 +20%, 불 마법 +15, 물 마력통 +10%, 땅 버티기 +15%', () => {
  assert.equal(statsFor(base, 'wind').hit, 35); assert.equal(statsFor(base, 'wind').bonus.hit, 6);
  assert.equal(statsFor(base, 'fire').magic, 115);
  assert.equal(statsFor(base, 'water').mana, 68);
  assert.equal(statsFor(base, 'earth').hold, 124);
  assert.equal(statsFor({ ...base, staff: 'mace' }, 'wind').hit, 70);   // 58.7 × 1.2
});
