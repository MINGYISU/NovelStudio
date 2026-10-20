import { verifyColdBackup } from '../services/cold-backup.ts';

// `npm run verify:cold -- <file>`: checks the .sha256 sidecar, the schema and the stats. Reads only.
const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run verify:cold -- <file>');
  process.exit(2);
}
const result = verifyColdBackup(file);
console.log(`checksum: ${result.checksum}`);
if (result.stats) console.log(`contents: ${JSON.stringify(result.stats)}`);
for (const problem of result.problems) console.error(`problem: ${problem}`);
console.log(result.ok ? 'OK' : 'FAILED');
process.exit(result.ok ? 0 : 1);
