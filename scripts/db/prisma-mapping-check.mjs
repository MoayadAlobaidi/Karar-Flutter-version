// Prisma mapping drift check (one-directional, deliberately):
// every model declared in packages/platform/prisma/schema/*.prisma must match
// the live database's shape for its mapped table. Tables that exist in the
// database but are NOT mapped (the Phase 2 platform/audit tables, reached via
// the raw adapter) are not drift — Prisma maps what domain repositories use.
// Field-level comparison is normalized on (column name, scalar type, nullability).
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const platform = join(root, 'packages', 'platform');
const schemaDir = join(platform, 'prisma', 'schema');

function parseModels(source) {
  const models = new Map();
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(source))) {
    const [, name, body] = m;
    const mapMatch = body.match(/@@map\("([^"]+)"\)/);
    const table = mapMatch ? mapMatch[1] : name;
    const fields = new Map();
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const f = line.match(/^(\w+)\s+(\w+)(\??)/);
      if (!f) continue;
      const [, fname, ftype, opt] = f;
      const col = (line.match(/@map\("([^"]+)"\)/) ?? [])[1] ?? fname;
      // Relation fields (non-scalar types referencing other models) are skipped.
      fields.set(col, {
        type: ftype,
        optional: opt === '?',
        relation:
          /^[A-Z]/.test(ftype) &&
          ![
            'String',
            'Int',
            'BigInt',
            'Boolean',
            'DateTime',
            'Json',
            'Decimal',
            'Bytes',
            'Float',
          ].includes(ftype),
      });
    }
    models.set(table, { name, fields });
  }
  return models;
}

const declared = new Map();
for (const file of readdirSync(schemaDir).filter((f) => f.endsWith('.prisma'))) {
  for (const [table, model] of parseModels(readFileSync(join(schemaDir, file), 'utf8'))) {
    declared.set(table, { ...model, file });
  }
}

const pulled = execFileSync('pnpm', ['exec', 'prisma', 'db', 'pull', '--print'], {
  cwd: platform,
  encoding: 'utf8',
  env: process.env,
});
const live = parseModels(pulled);

const problems = [];
for (const [table, model] of declared) {
  const liveModel = live.get(table);
  if (!liveModel) {
    problems.push(
      `${model.file}: model ${model.name} maps table '${table}' which does not exist in the database`,
    );
    continue;
  }
  for (const [col, spec] of model.fields) {
    if (spec.relation) continue;
    const liveSpec = liveModel.fields.get(col);
    if (!liveSpec) {
      problems.push(`${table}.${col}: declared in ${model.file} but absent in the database`);
      continue;
    }
    if (liveSpec.type !== spec.type || liveSpec.optional !== spec.optional) {
      problems.push(
        `${table}.${col}: mapping ${spec.type}${spec.optional ? '?' : ''} vs live ${liveSpec.type}${liveSpec.optional ? '?' : ''}`,
      );
    }
  }
  for (const [col, liveSpec] of liveModel.fields) {
    if (liveSpec.relation) continue;
    if (!model.fields.has(col))
      problems.push(`${table}.${col}: exists in the database but is unmapped in ${model.file}`);
  }
}

if (problems.length) {
  console.error(`prisma-mapping-check: ${problems.length} drift problem(s)`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`prisma-mapping-check: ${declared.size} mapped tables match the live database`);
