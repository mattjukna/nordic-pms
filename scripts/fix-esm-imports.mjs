#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const e of entries) {
    const res = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...await walk(res));
    } else if (e.isFile() && res.endsWith('.js')) {
      results.push(res);
    }
  }
  return results;
}

function hasExtension(spec) {
  // treat query/hash as part of extension-less (rare); simple ext check
  return path.extname(spec) !== '';
}

async function fileExists(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch (e) {
    return false;
  }
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

async function fixFile(filePath, baseDir) {
  let text = await fs.readFile(filePath, 'utf8');
  let changed = false;
  let replacements = 0;
  const dir = path.dirname(filePath);

  // helper to resolve and maybe rewrite a specifier
  async function rewriteSpecifier(spec) {
    if (!spec.startsWith('./') && !spec.startsWith('../')) return spec;
    if (hasExtension(spec)) return spec;

    // Resolve absolute path of the specifier from file's directory
    const abs = path.resolve(dir, spec);
    const tryJs = abs + '.js';
    const tryIndex = path.join(abs, 'index.js');
    if (await fileExists(tryJs)) {
      let rel = path.relative(dir, tryJs);
      rel = toPosix(rel);
      if (!rel.startsWith('.')) rel = './' + rel;
      return rel;
    }
    if (await fileExists(tryIndex)) {
      let rel = path.relative(dir, tryIndex);
      rel = toPosix(rel);
      if (!rel.startsWith('.')) rel = './' + rel;
      return rel;
    }
    return spec;
  }

  // Patterns: import ... from '...'; export ... from '...'; dynamic import('...')
  const importFromRe = /(import\s+[\s\S]*?\sfrom\s*)['"]([^'"\r\n]+)['"]/gm;
  const exportFromRe = /(export\s+[\s\S]*?\sfrom\s*)['"]([^'"\r\n]+)['"]/gm;
  const dynamicImportRe = /import\(\s*['"]([^'"\r\n]+)['"]\s*\)/gm;

  // Process import ... from
  text = await replaceAsync(text, importFromRe, async (match, p1, spec) => {
    const orig = spec;
    const newSpec = await rewriteSpecifier(spec);
    if (newSpec !== orig) {
      changed = true; replacements++;
      return p1 + '"' + newSpec + '"';
    }
    return match;
  });

  // Process export ... from
  text = await replaceAsync(text, exportFromRe, async (match, p1, spec) => {
    const orig = spec;
    const newSpec = await rewriteSpecifier(spec);
    if (newSpec !== orig) {
      changed = true; replacements++;
      return p1 + '"' + newSpec + '"';
    }
    return match;
  });

  // Process dynamic imports
  text = await replaceAsync(text, dynamicImportRe, async (match, spec) => {
    const orig = spec;
    const newSpec = await rewriteSpecifier(spec);
    if (newSpec !== orig) {
      changed = true; replacements++;
      return `import("${newSpec}")`;
    }
    return match;
  });

  if (changed) {
    await fs.writeFile(filePath, text, 'utf8');
  }
  return { changed, replacements };
}

// utility to allow async replacer with regex
async function replaceAsync(str, re, asyncFn) {
  const parts = [];
  let lastIndex = 0;
  let m;
  while ((m = re.exec(str)) !== null) {
    parts.push(str.slice(lastIndex, m.index));
    parts.push(await asyncFn(...m));
    lastIndex = re.lastIndex;
  }
  parts.push(str.slice(lastIndex));
  return parts.join('');
}

async function main() {
  const arg = process.argv[2] || path.join(process.cwd(), 'dist-server');
  const base = path.resolve(arg);
  try {
    await fs.access(base);
  } catch (e) {
    console.error('[fix-esm] target directory does not exist:', base);
    process.exitCode = 2;
    return;
  }

  const files = await walk(base);
  let filesChanged = 0;
  let totalReplacements = 0;
  for (const f of files) {
    const { changed, replacements } = await fixFile(f, base);
    if (changed) filesChanged++;
    totalReplacements += replacements;
  }

  console.log(`[fix-esm] processed ${files.length} .js files, ${filesChanged} files changed, ${totalReplacements} replacements`);
}

if (process.argv[1].endsWith('fix-esm-imports.mjs') || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exitCode = 1; });
}
