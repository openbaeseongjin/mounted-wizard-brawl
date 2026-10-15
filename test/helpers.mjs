import RAPIER from '@dimforge/rapier3d-compat';
import { createMatch } from '../match.js';
import { idleInput } from '../fighter.js';

let ready = null;
export async function rapier() { if (!ready) ready = RAPIER.init().then(() => RAPIER); return ready; }

// roster: [{char, isPlayer?, loadout?}]; countdown 0이 기본
export async function makeMatch(opts) {
  const R = await rapier();
  return createMatch(R, { seed: 1, mode: 'duel', countdown: 0, ...opts });
}
// secs 동안 돌린다. inputsFn(m) → {i: input} (없으면 AI/빈 입력)
export function run(m, secs, inputsFn) {
  const n = Math.round(secs * 60), all = [];
  for (let s = 0; s < n; s++) { const ev = m.step(inputsFn ? inputsFn(m, s) : undefined); for (const e of ev) all.push(e); }
  return all;
}
export function input(patch) { return { ...idleInput(), ...patch }; }
export const speedOf = (m, k) => { const v = m.horses[k].body.linvel(); return Math.hypot(v.x, v.z); };
