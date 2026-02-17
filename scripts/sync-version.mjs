import { readFileSync, writeFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const v = pkg.version;

// Sync dashboard/package.json
const dashPkg = JSON.parse(readFileSync('dashboard/package.json', 'utf8'));
dashPkg.version = v;
writeFileSync('dashboard/package.json', JSON.stringify(dashPkg, null, 2) + '\n');

// Sync src/cli.ts
const cli = readFileSync('src/cli.ts', 'utf8');
writeFileSync('src/cli.ts', cli.replace(/\.version\('[^']+'\)/, `.version('${v}')`));

console.log(`Synced version ${v} to dashboard/package.json and src/cli.ts`);
