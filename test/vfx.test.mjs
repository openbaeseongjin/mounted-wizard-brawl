// 원소 이펙트 이벤트: 시뮬이 내는 원소 이벤트는 모두 그림이 있고, 프레임에는 복사본만 담긴다
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VFX_EVENTS, VFX_IGNORE, pickVfxEvents } from '../vfxEvents.js';

test('원소 이벤트: magic.js·zones.js가 내는 이벤트는 모두 그림이 있거나 무시 목록에 있다', () => {
  for (const f of ['magic.js', 'zones.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const types = [...src.matchAll(/type: '(\w+)'/g)].map((x) => x[1]);
    assert.ok(types.length > 0, f + ': 이벤트를 못 찾았다');
    for (const t of types) assert.ok(VFX_EVENTS.includes(t) || VFX_IGNORE.includes(t), `${f}: '${t}' 이벤트에 그림이 없다`);
  }
});

test('pickVfxEvents: 원소 이벤트만 고르고(구슬은 빼고) pos·hits를 복사한다', () => {
  const pos = { x: 1, y: 2, z: 3 };
  const evs = [
    { type: 'hit', pos }, { type: 'cast', kind: 'orb', pos }, { type: 'cast', kind: 'fireball', id: 4, pos },
    { type: 'explode', kind: 'orb', pos, hits: [] }, { type: 'explode', kind: 'fireball', pos, r: 2, hits: [{ i: 2, dmg: 9, J: 80 }] },
    { type: 'gust', i: 0, pos, r: 4 },
  ];
  const out = pickVfxEvents(evs);
  assert.deepEqual(out.map((e) => e.type), ['cast', 'explode', 'gust']);
  assert.notEqual(out[0].pos, pos);
  assert.deepEqual(out[0].pos, pos);
  assert.deepEqual(out[1].hits, [{ i: 2 }]);
  assert.equal(out[2].r, 4);
  assert.equal(pickVfxEvents([{ type: 'hit', pos }]), null);
  assert.equal(pickVfxEvents([]), null);
});
