import test from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, SPELLS, JOB_ORDER, slotsFor, CHARS, PERSONAS, LADDER } from '../config.js';

test('원소 넷, 원소마다 마법 둘, 상성 고리 물>불>바람>땅>물', () => {
  assert.deepEqual(JOB_ORDER, ['fire', 'water', 'wind', 'earth']);
  for (const k of JOB_ORDER) { assert.equal(JOBS[k].spells.length, 2); for (const s of JOBS[k].spells) assert.ok(SPELLS[s], s); }
  assert.equal(JOBS.water.beats, 'fire'); assert.equal(JOBS.fire.beats, 'wind'); assert.equal(JOBS.wind.beats, 'earth'); assert.equal(JOBS.earth.beats, 'water');
});

test('슬롯: 견습 = 마력탄, 1차 = 첫 마법, 2차 = 둘 다', () => {
  assert.deepEqual(slotsFor(null, 0), { main: 'orb', big: null });
  assert.deepEqual(slotsFor('wind', 1), { main: 'gust', big: null });
  assert.deepEqual(slotsFor('earth', 2), { main: 'wall', big: 'fissure' });
});

test('AI 원소와 돌쇠', () => {
  assert.equal(CHARS.mukjik.job, 'wind'); assert.equal(CHARS.beongae.job, 'fire'); assert.equal(CHARS.gihoe.job, 'water');
  assert.equal(CHARS.boss1.name, '마구간 대장 돌쇠'); assert.equal(CHARS.boss1.job, 'earth'); assert.equal(CHARS.boss1.jobTier, 2);
  assert.equal(CHARS.rival.job, 'mimic');
  assert.equal(LADDER[0].boss.line[0], '돌쇠');
  for (const p of ['circle', 'rush', 'swarm', 'flee']) assert.ok(PERSONAS[p].mode, p);
});
