#!/usr/bin/env node
/**
 * Gate de SCA para a API.
 *
 * Roda `npm audit` e FALHA o CI quando há vulnerabilidade HIGH/CRITICAL que NÃO
 * esteja explicitamente isenta em `api/.audit-allowlist.json`. Vulnerabilidades
 * novas (fora do allowlist) quebram o build — nada de `|| true` ou isenção em
 * massa. As isenções são por pacote, com justificativa e data de revisão.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const allow = JSON.parse(
  readFileSync(new URL('../.audit-allowlist.json', import.meta.url), 'utf8'),
);
const waived = allow.packages || {};

let raw = '';
try {
  // npm audit sai com código != 0 quando encontra vulnerabilidades — capturamos
  // o stdout do erro para parsear o JSON mesmo assim.
  raw = execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  raw = (e.stdout && e.stdout.toString()) || '';
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('audit-gate: não foi possível parsear a saída de `npm audit --json`.');
  process.exit(2);
}

const vulns = report.vulnerabilities || {};
const offenders = [];
let isentos = 0;

for (const [name, v] of Object.entries(vulns)) {
  if (v.severity !== 'high' && v.severity !== 'critical') continue;
  if (waived[name]) isentos += 1;
  else offenders.push(`${v.severity.toUpperCase()} ${name}`);
}

if (offenders.length) {
  console.error('SCA gate FALHOU — HIGH/CRITICAL sem waiver:');
  for (const o of offenders) console.error(`  - ${o}`);
  console.error(
    '\nCorrija a dependência (npm audit fix / override) OU registre um waiver ' +
      'justificado em api/.audit-allowlist.json.',
  );
  process.exit(1);
}

console.log(
  `SCA gate OK — ${isentos} HIGH/CRITICAL isento(s) e justificado(s); ` +
    'nenhuma vulnerabilidade nova. (revisar allowlist em ' + (allow.reviewBy || 'sem data') + ')',
);
