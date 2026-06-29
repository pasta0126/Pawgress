/**
 * Converts all FBX animations in doc/pets/bytee/ into a single animated GLB.
 * Uses the bundled FBX2glTF.exe (node_modules/fbx2gltf) — no Blender required.
 *
 * Usage: node scripts/build-bytee-glb.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const FBX_DIR   = path.join(ROOT, 'doc', 'pets', 'bytee');
const OUT_FILE  = path.join(ROOT, 'public', 'bytee.glb');
const FBX2GLTF  = path.join(ROOT, 'node_modules', 'fbx2gltf', 'bin', 'Windows_NT', 'FBX2glTF.exe');
const TMP_DIR   = path.join(os.tmpdir(), 'pawgress-bytee-build');

// FBX filename stem → clip name used in the frontend
const ANIM_MAP = {
  'Breathing Idle':             'BreathingIdle',
  'Happy Idle':                 'HappyIdle',
  'Sad Idle':                   'SadIdle',
  'Sitting Dazed':              'SittingDazed',
  'Air Squat':                  'AirSquat',
  'Landing':                    'Landing',
  'Standing Up':                'StandingUp',
  'Searching Pockets':          'SearchingPockets',
  'Standing W_Briefcase Idle':  'BriefcaseIdle',
};

// ── GLB binary helpers ────────────────────────────────────────────────────────

function parseGLB(buf) {
  if (buf.readUInt32LE(0) !== 0x46546C67) throw new Error('Not a GLB file');
  let offset = 12, json, bin = Buffer.alloc(0);
  while (offset < buf.length) {
    const len  = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.slice(offset + 8, offset + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004E4942) bin = data;
    offset += 8 + len;
  }
  return { json, bin };
}

function pad4(n) { return Math.ceil(n / 4) * 4; }

function buildGLB(json, bin) {
  const jsonStr = JSON.stringify(json);
  const jsonPad = pad4(jsonStr.length);
  const jsonBuf = Buffer.alloc(jsonPad, 0x20);
  Buffer.from(jsonStr).copy(jsonBuf);

  const binPad = pad4(bin.length);
  const binBuf = Buffer.alloc(binPad, 0x00);
  bin.copy(binBuf);

  const total = 12 + 8 + jsonPad + 8 + binPad;
  const out   = Buffer.alloc(total);
  out.writeUInt32LE(0x46546C67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonPad, 12); out.writeUInt32LE(0x4E4F534A, 16);
  jsonBuf.copy(out, 20);
  const b = 20 + jsonPad;
  out.writeUInt32LE(binPad, b); out.writeUInt32LE(0x004E4942, b + 4);
  binBuf.copy(out, b + 8);
  return out;
}

// ── Animation merge (source animations → base GLB) ───────────────────────────

function mergeAnimation(base, src, animName) {
  const { json: bj, bin: bb } = base;
  const { json: sj, bin: sb } = src;

  const baseNodeByName = {};
  (bj.nodes || []).forEach((n, i) => { if (n.name) baseNodeByName[n.name] = i; });

  const srcAnim = sj.animations?.[0];
  if (!srcAnim) { console.warn(`  No animation in source — skipping ${animName}`); return base; }

  const srcNodes   = sj.nodes || [];
  const accBase    = (bj.accessors   || []).length;
  const bvBase     = (bj.bufferViews || []).length;
  let   extra      = Buffer.alloc(0);
  const accMap     = {};
  const newBVs     = [], newAccs = [];

  const usedAcc = new Set();
  srcAnim.samplers.forEach(s => { usedAcc.add(s.input); usedAcc.add(s.output); });

  for (const srcAccIdx of usedAcc) {
    const acc   = sj.accessors[srcAccIdx];
    const bv    = sj.bufferViews[acc.bufferView];
    const bvStart = bv.byteOffset || 0;
    const bvData  = sb.slice(bvStart, bvStart + bv.byteLength);

    if (extra.length % 4 !== 0) extra = Buffer.concat([extra, Buffer.alloc(4 - extra.length % 4)]);

    const newBVOffset = bb.length + extra.length;
    extra = Buffer.concat([extra, bvData]);

    const newBVIdx  = bvBase  + newBVs.length;
    const newAccIdx = accBase + newAccs.length;

    newBVs.push({ buffer: 0, byteOffset: newBVOffset, byteLength: bv.byteLength });
    newAccs.push({
      bufferView:    newBVIdx,
      byteOffset:    acc.byteOffset || 0,
      componentType: acc.componentType,
      count:         acc.count,
      type:          acc.type,
      ...(acc.min        ? { min: acc.min }               : {}),
      ...(acc.max        ? { max: acc.max }               : {}),
      ...(acc.normalized ? { normalized: acc.normalized } : {}),
    });
    accMap[srcAccIdx] = newAccIdx;
  }

  const newSamplers = srcAnim.samplers.map(s => ({
    input:         accMap[s.input],
    output:        accMap[s.output],
    interpolation: s.interpolation || 'LINEAR',
  }));

  const newChannels = srcAnim.channels.flatMap(ch => {
    const nodeName    = srcNodes[ch.target.node]?.name;
    const baseNodeIdx = nodeName !== undefined ? baseNodeByName[nodeName] : undefined;
    if (baseNodeIdx === undefined) return [];
    return [{ sampler: ch.sampler, target: { node: baseNodeIdx, path: ch.target.path } }];
  });

  const mergedBin = Buffer.concat([bb, extra]);
  return {
    json: {
      ...bj,
      buffers:     [{ byteLength: mergedBin.length }],
      bufferViews: [...(bj.bufferViews || []), ...newBVs],
      accessors:   [...(bj.accessors   || []), ...newAccs],
      animations:  [...(bj.animations  || []), { name: animName, samplers: newSamplers, channels: newChannels }],
    },
    bin: mergedBin,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

mkdirSync(TMP_DIR, { recursive: true });

const entries = Object.entries(ANIM_MAP);

// 1. Convert each FBX → GLB via native binary
console.log('Converting FBX files with FBX2glTF…');
const glbs = [];
for (const [stem, clipName] of entries) {
  const fbxPath = path.join(FBX_DIR, `${stem}.fbx`);
  const outBase = path.join(TMP_DIR, stem.replace(/\s+/g, '_'));
  process.stdout.write(`  ${stem}.fbx … `);

  execFileSync(FBX2GLTF, ['--binary', '--input', fbxPath, '--output', outBase], { stdio: 'pipe' });

  const glbBuf = readFileSync(`${outBase}.glb`);
  glbs.push({ parsed: parseGLB(glbBuf), clipName });
  console.log('OK');
}

// 2. Use first GLB as base, rename its animation, merge the rest
console.log('\nMerging animations…');
let merged = glbs[0].parsed;
if (merged.json.animations?.[0]) merged.json.animations[0].name = glbs[0].clipName;

for (let i = 1; i < glbs.length; i++) {
  process.stdout.write(`  Adding ${glbs[i].clipName} … `);
  merged = mergeAnimation(merged, glbs[i].parsed, glbs[i].clipName);
  console.log('OK');
}

// 3. Write output
merged.json.buffers = [{ byteLength: merged.bin.length }];
const output = buildGLB(merged.json, merged.bin);
writeFileSync(OUT_FILE, output);

// 4. Cleanup tmp
rmSync(TMP_DIR, { recursive: true, force: true });

console.log(`\n✓ ${OUT_FILE}`);
console.log(`  Size:       ${(output.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`  Animations: ${merged.json.animations.map(a => a.name).join(', ')}`);
