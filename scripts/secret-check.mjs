import { execFileSync } from 'node:child_process';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const patterns = [
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /postgres(?:ql)?:\/\/[^\s:]+:[a-f0-9]{32,}@/,
];
const bad = [];
for (const file of files) {
  if (file.startsWith('.env') && file !== '.env.example') bad.push(file);
  if (file.startsWith('.local/')) bad.push(file);
  if (/\.(png|jpg|zip)$/.test(file)) continue;
  const text = execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' });
  if (patterns.some((p) => p.test(text))) bad.push(file);
}
if (bad.length) {
  console.error(`Potential secrets in tracked files: ${[...new Set(bad)].join(', ')}`);
  process.exit(1);
}
console.log(`Checked ${files.length} tracked files; no matching credential patterns.`);
