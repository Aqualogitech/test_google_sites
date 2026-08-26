import { createHash } from "node:crypto";
import { cp, readdir, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { minify } from "terser";
import JavaScriptObfuscator from "javascript-obfuscator";
import chalk from "chalk";

const OBFUSCATOR_PROMO_PATTERN = /\[javascript-obfuscator\]|JavaScript Obfuscator Pro|obfuscator\.io/i;

for (const method of ["log", "info", "warn"]) {
  const original = console[method].bind(console);
  console[method] = (...args) => {
    if (args.some(arg => OBFUSCATOR_PROMO_PATTERN.test(String(arg)))) return;
    original(...args);
  };
}

const OBFUSCATE = true;
const OBFUSCATE_HTML = true;

const SRC_DIR = path.join(process.cwd(), "static");
const DIST_DIR = path.join(process.cwd(), "dist");
const JS_DIR = path.join(DIST_DIR, "assets", "js");
const UV_DIR = path.join(DIST_DIR, "assets", "ultraviolet");
const DYNAMIC_DIR = path.join(DIST_DIR, "assets", "dynamic");

const UV_PREFIX = "ultraviolet.";
const DYNAMIC_PREFIX = "dynamic.";

const KEEP_IN_PLACE = new Set();

// scramjet.*: already-built vendor bundles.
// sj-tp.js / ultraviolet.config.js: hold codec functions the proxies eval in another
// realm, where the obfuscator's string-array helpers do not exist.
const SKIP_OBFUSCATE = new Set([
  "scramjet.all.js",
  "scramjet.sync.js",
  "sj-tp.js",
  "ultraviolet.config.js",
  // Dynamic's rewriter (acorn parser + AST transform + codegen) runs in the service
  // worker for every proxied JS file. Obfuscating it multiplies that cost per request,
  // same reason scramjet.* is skipped above.
  "dynamic.worker.js",
  "dynamic.client.js",
  "dynamic.handler.js",
  "dynamic.html.js",
  // Ultraviolet's bundle is the largest emitted file when obfuscated
  // (784 KB -> 4.2 MB) and the service worker imports it on every load.
  "ultraviolet.bundle.js",
]);

const OLD_DYNAMIC_PREFIX = "/assets/dynamic/";
const OLD_UV_PREFIX = "/assets/ultraviolet/";

const OLD_UV_SCOPE = "/uv/";
const OLD_SCRAMJET_SCOPE = "/uv/scramjet/";
const OLD_DYNAMIC_SCOPE = "/uv/dynamic/";

const WORDS = [
  "api",
  "lib",
  "src",
  "net",
  "sys",
  "io",
  "pkg",
  "app",
  "mod",
  "ext",
  "math",
  "calc",
  "units",
  "matrix",
  "vector",
  "scalar",
  "ratio",
  "delta",
  "sigma",
  "alpha",
  "beta",
  "gamma",
  "omega",
  "phi",
  "theta",
  "core",
  "util",
  "data",
  "base",
  "node",
  "tree",
  "heap",
  "stack",
  "queue",
  "graph",
  "hash",
  "map",
  "set",
  "list",
  "ring",
  "chain",
  "parse",
  "fmt",
  "log",
  "proc",
  "exec",
  "init",
  "boot",
  "load",
  "sync",
  "async",
  "fetch",
  "emit",
  "bind",
  "wrap",
  "pool",
  "fork",
  "dictionary",
  "mapping",
  "resolver",
  "adapter",
  "encoder",
  "decoder",
  "scheduler",
  "dispatcher",
  "observer",
  "registry",
  "factory",
  "builder",
  "transform",
  "pipeline",
  "middleware",
  "handler",
  "router",
  "broker",
  "storage",
  "cache",
  "buffer",
  "stream",
  "channel",
  "socket",
  "bridge",
  "monitor",
  "profiler",
  "tracer",
  "validator",
  "sanitizer",
  "1",
  "2",
  "3",
  "v1",
  "v2",
  "v3",
  "that",
  "was",
  "my",
  "part",
  "of",
  "the",
  "deal",
  "honest",
  "we",
  "got",
  "so",
  "familiar",
  "spending",
  "each",
  "day",
  "of",
  "the",
  "year",
  "white",
  "ferrari",
  "good",
  "times",
];

const FILENAMES = [
  "x",
  "y",
  "z",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "1",
  "2",
  "3",
  "10",
  "11",
  "100",
  "mod",
  "lib",
  "api",
  "run",
  "cli",
  "app",
  "env",
  "cfg",
  "index",
  "main",
  "core",
  "init",
  "loader",
  "worker",
  "runtime",
  "parser",
  "formatter",
  "handler",
  "manager",
  "client",
  "server",
  "config",
  "schema",
  "mapper",
  "adapter",
  "resolver",
  "encoder",
  "decoder",
  "sync",
  "fetch",
  "stream",
  "buffer",
  "queue",
  "cache",
  "router",
  "dispatcher",
  "emitter",
  "observer",
  "builder",
  "factory",
  "transform",
  "pipeline",
  "registry",
  "validator",
  "scheduler",
  "monitor",
  "tracer",
  "bridge",
  "channel",
  "storage",
  "profiler",
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomSegment() {
  if (Math.random() < 0.1) return `${randomItem(WORDS)}-${randomItem(WORDS)}`;
  return randomItem(WORDS);
}

function randomWord() {
  return randomItem(WORDS);
}

function randomDir() {
  const depth = randomInt(1, 2);
  return Array.from({ length: depth }, randomSegment).join("/");
}

function randomFilename() {
  if (Math.random() < 0.1) return `${randomItem(FILENAMES)}-${randomItem(FILENAMES)}`;
  return randomItem(FILENAMES);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyRenameMap(content, renameMap, protectedPrefixes) {
  let result = content;
  for (const [original, newPublicPath] of renameMap) {
    const q = `['"\`]`;
    const pattern = new RegExp(`(${q})([^'"\`]*${escapeRegex(original)})(${q})`, "g");
    result = result.replace(pattern, (_m, open, inner, close) => {
      if (protectedPrefixes.some(p => inner.includes(p))) return `${open}${inner}${close}`;
      return `${open}${newPublicPath}${close}`;
    });
  }
  return result;
}

function replaceAll(content, oldStr, newStr) {
  return content.split(oldStr).join(newStr);
}

const URL_CODEC_NAMES = ["xor"];

const URL_CODEC_FUNCTIONS = {
  xor: {
    encode: 'url => url && encodeURIComponent(url.split("").map((char, index) => (index % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 2) : char)).join(""))',
    decode:
      'url => { if (!url) return url; const index = url.search(/[?#]/); const value = index < 0 ? url : url.slice(0, index); const tail = index < 0 ? "" : url.slice(index); return decodeURIComponent(value).split("").map((char, index) => (index % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 2) : char)).join("") + tail; }',
  },
};

function randomXorKey() {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const firstChars = "23456789abcdefghijklmnopqrstuvwxyz";
  const length = randomInt(1, 2);
  let key = randomItem(firstChars);
  for (let index = 1; index < length; index++) key += randomItem(chars);
  return key;
}

function xorKeyValue(key) {
  const value = /^\d+$/.test(key) ? Number(key) : parseInt(key, 36);
  return Number.isFinite(value) && value > 1 ? (value % 30) + 2 : 2;
}

function randomCodecSpec(names = URL_CODEC_NAMES, keyed = true) {
  const codec = randomItem(names);
  return keyed && codec === "xor" ? `${codec}:${randomXorKey()}` : codec;
}

function parseCodecSpec(spec) {
  const [codec, ...keyParts] = String(spec).split(":");
  return { codec, key: keyParts.join(":") };
}

function createXorCodec(key) {
  if (!key) return URL_CODEC_FUNCTIONS.xor;

  const encodedKey = xorKeyValue(key);
  const encodeValue = `(url => encodeURIComponent(url.split("").map((char, index) => (index % ${encodedKey} ? String.fromCharCode(char.charCodeAt(0) ^ ${encodedKey}) : char)).join("")))`;
  const decodeValue = `(url => decodeURIComponent(url).split("").map((char, index) => (index % ${encodedKey} ? String.fromCharCode(char.charCodeAt(0) ^ ${encodedKey}) : char)).join(""))`;
  return {
    encode: `url => url && ${encodeValue}(url)`,
    decode: `url => { if (!url) return url; const index = url.search(/[?#]/); const value = index < 0 ? url : url.slice(0, index); const tail = index < 0 ? "" : url.slice(index); return ${decodeValue}(value) + tail; }`,
  };
}

function getUrlCodecFunctions(codec, key) {
  if (codec === "xor") return createXorCodec(key);
  return URL_CODEC_FUNCTIONS[codec];
}

function createProxyCodecs() {
  return {
    uv: randomCodecSpec(URL_CODEC_NAMES),
    dynamic: randomCodecSpec(URL_CODEC_NAMES),
    scramjet: randomCodecSpec(URL_CODEC_NAMES),
  };
}

// Fatal: a half-patched build encodes and decodes with different keys, silently breaking
// every proxied URL.
class CodecPatchError extends Error {
  constructor(message) {
    super(message);
    this.name = "CodecPatchError";
  }
}

// Optional patches cover patterns that exist in only some files sharing a branch below.
function patchOrFail(content, pattern, replacement, label, required = true) {
  if (!pattern.test(content)) {
    if (!required) return content;
    throw new CodecPatchError(`${label}: pattern no longer matches. Upstream file changed - update the pattern in patchProxyCodecs().`);
  }
  pattern.lastIndex = 0;
  return content.replace(pattern, replacement);
}

// Local patches on the vendored Dynamic bundles. A vendor drop or a formatter reflow
// aborts the build instead of shipping a half-patched proxy. See dynamic-changes.md.
const FIX2_GUARD = `("PropertyDefinition"!=t.type||t.key!=e||t.computed)`;
const FIX3_GUARD = `"MetaProperty"==e.object.type`;
const FIX4_GUARD = `"null"===e.origin?e.href:`;
const FIX5_GUARD = `m.set(i,v.bind(e))`;
const LOCAL_PATCH_ASSERTIONS = {
  "dynamic.worker.js": [
    ["Fix 1 html module filename", `[["html","dynamic.html.js"]]`, 1],
    ["Fix 2 PropertyDefinition.key guard", FIX2_GUARD, 1],
    ["Fix 3 import.meta.url base", FIX3_GUARD, 1],
    ["Fix 4 opaque-origin guard", FIX4_GUARD, 1],
  ],
  "dynamic.client.js": [
    ["Fix 5 proxy bind", FIX5_GUARD, 1],
    ["Fix 2 PropertyDefinition.key guard", FIX2_GUARD, 1],
    ["Fix 3 import.meta.url base", FIX3_GUARD, 1],
    ["Fix 4 opaque-origin guard", FIX4_GUARD, 1],
  ],
  "dynamic.handler.js": [
    ["Fix 5 proxy bind", FIX5_GUARD, 1],
    ["Fix 2 PropertyDefinition.key guard", FIX2_GUARD, 1],
    ["Fix 3 import.meta.url base", FIX3_GUARD, 1],
    ["Fix 4 opaque-origin guard", FIX4_GUARD, 1],
  ],
};

function assertLocalPatches(content, basename) {
  const checks = LOCAL_PATCH_ASSERTIONS[basename];
  if (!checks) return content;
  for (const [label, needle, expected] of checks) {
    const found = content.split(needle).length - 1;
    if (found !== expected) {
      throw new CodecPatchError(
        `${basename}: local patch "${label}" expected ${expected} occurrence(s) in the minified source, found ${found}. The vendor bundle or the minifier changed - re-apply the patch (see static/assets/dynamic/dynamic-changes.md).`,
      );
    }
  }
  return content;
}

function patchProxyCodecs(content, basename, proxyCodecs) {
  if (basename === "ultraviolet.config.js") {
    const { codec, key } = parseCodecSpec(proxyCodecs.uv);
    const uvCodec = getUrlCodecFunctions(codec, key);
    content = patchOrFail(content, /encodeUrl:\s*Ultraviolet\.codec\.\w+\.encode,/, `encodeUrl: ${uvCodec.encode},`, "ultraviolet.config.js encodeUrl");
    content = patchOrFail(content, /decodeUrl:\s*Ultraviolet\.codec\.\w+\.decode,/, `decodeUrl: ${uvCodec.decode},`, "ultraviolet.config.js decodeUrl");
  }

  if (basename === "dynamic.config.js") {
    content = patchOrFail(content, /encoding:\s*["']\w+["']/, 'encoding: "xor"', "dynamic.config.js encoding");
  }

  // All three bundles inline the same codec, and the client and handler rewrite in-page
  // links, so patching only the worker breaks every navigation after the first.
  if (basename === "dynamic.worker.js" || basename === "dynamic.client.js" || basename === "dynamic.handler.js") {
    const { key } = parseCodecSpec(proxyCodecs.dynamic);
    const dynamicKey = xorKeyValue(key);
    content = patchOrFail(
      content,
      /\{encode:\(e,t=2\)=>e&&encodeURIComponent\(e\.split\(""\)\.map\(\(e,i\)=>i%t\?String\.fromCharCode\(e\.charCodeAt\(0\)\^t\):e\)\.join\(""\)\),decode:\(e,t=2\)=>e&&decodeURIComponent\(e\)\.split\(""\)\.map\(\(e,i\)=>i%t\?String\.fromCharCode\(e\.charCodeAt\(0\)\^t\):e\)\.join\(""\)\}/g,
      `{encode:e=>e&&encodeURIComponent(e.split("").map((e,i)=>i%${dynamicKey}?String.fromCharCode(e.charCodeAt(0)^${dynamicKey}):e).join("")),decode:e=>e&&decodeURIComponent(e).split("").map((e,i)=>i%${dynamicKey}?String.fromCharCode(e.charCodeAt(0)^${dynamicKey}):e).join("")}`,
      `${basename} xor codec`,
    );
  }

  if (basename === "search.js" || basename === "tabs.js") {
    const { key } = parseCodecSpec(proxyCodecs.dynamic);
    const dynamicKey = JSON.stringify(key || "2");
    content = patchOrFail(content, /\/uv\/dynamic\/\$\{window\.encode\.xor\(url\)\}/g, `/uv/dynamic/\${window.encode.xor(url, ${dynamicKey})}`, `${basename} dynamic encode(url)`);
    content = patchOrFail(content, /\/uv\/dynamic\/\$\{window\.encode\.xor\(value\)\}/g, `/uv/dynamic/\${window.encode.xor(value, ${dynamicKey})}`, `${basename} dynamic encode(value)`, basename === "search.js");
    content = patchOrFail(content, /return window\.decode\.xor\(str\) \+ \(search\.length/g, `return window.decode.xor(str, ${dynamicKey}) + (search.length`, `${basename} dynamic decode`, basename === "tabs.js");
  }

  if (basename === "sj-tp.js") {
    const { codec, key } = parseCodecSpec(proxyCodecs.scramjet);
    const sjCodec = getUrlCodecFunctions(codec, key);
    content = patchOrFail(content, /codec:\s*\{[\s\S]*?\n\s*\},\n\s*files:/, `codec: {\n      encode: ${sjCodec.encode},\n      decode: ${sjCodec.decode},\n    },\n    files:`, "sj-tp.js codec");
  }

  return content;
}

// sw.js importScripts six files into one scope and inline scripts share window, so the
// obfuscator's hex identifiers collide. Give each file its own prefix.
function identifiersPrefixFor(scopeKey) {
  return `_${createHash("sha1").update(scopeKey).digest("hex").slice(0, 8)}_`;
}

async function runObfuscator(source, scopeKey) {
  const minified = await minify(source, {
    compress: { drop_console: false, passes: 2 },
    mangle: true,
    format: { comments: false },
  });
  if (!minified.code) throw new Error("Terser returned empty output");

  const obfuscated = JavaScriptObfuscator.obfuscate(minified.code, {
    identifiersPrefix: identifiersPrefixFor(scopeKey),
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    selfDefending: false,
    splitStrings: true,
    splitStringsChunkLength: 5,
    stringArray: true,
    stringArrayEncoding: ["rc4"],
    stringArrayThreshold: 1,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,
  });
  return obfuscated.getObfuscatedCode();
}

function shouldProcessInlineScript(attrs) {
  if (/\bsrc\s*=/i.test(attrs)) return false;

  const typeMatch = attrs.match(/\btype\s*=\s*(["']?)([^"'\s>]+)\1/i);
  if (!typeMatch) return true;

  const type = typeMatch[2].toLowerCase();
  return ["text/javascript", "application/javascript", "module"].includes(type);
}

async function obfuscateInlineScripts(html, htmlName) {
  const scripts = [];
  let index = 0;

  const protectedHtml = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, source) => {
    const token = `___HTML_SCRIPT_${index++}___`;
    scripts.push({ token, match, attrs, source });
    return token;
  });

  const processedScripts = await Promise.all(
    scripts.map(async script => {
      if (!script.source.trim() || !shouldProcessInlineScript(script.attrs)) return [script.token, script.match];

      try {
        const obfuscated = await runObfuscator(script.source, `${htmlName}#${script.token}`);
        return [script.token, `<script${script.attrs}>${obfuscated}</script>`];
      } catch (err) {
        console.warn(chalk.yellow(`  ! inline script skipped: ${err.message}`));
        return [script.token, script.match];
      }
    }),
  );

  let output = protectedHtml;
  // Function replacement, never a string: obfuscated code contains `$&`/`$\``/`$'`, which
  // String.replace would expand.
  for (const [token, script] of processedScripts) output = output.replace(token, () => script);
  return output;
}

function minifyHtml(html) {
  const blocks = [];
  let index = 0;

  const protectBlock = block => {
    const token = `___HTML_BLOCK_${index++}___`;
    blocks.push([token, block]);
    return token;
  };

  let output = html
    .replace(/<(script|style|pre|textarea)\b[\s\S]*?<\/\1>/gi, protectBlock)
    .replace(/<!--(?!\[if\b)[\s\S]*?-->/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .replace(/\s+\/>/g, "/>")
    .trim();

  for (const [token, block] of blocks) output = output.replace(token, () => block);
  return output;
}

function encodeHtmlText(text) {
  return text.replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);|./gis, match => {
    if (match.startsWith("&") && match.endsWith(";")) return match;
    return `&#${match.codePointAt(0)};`;
  });
}

function obfuscateTextNodes(html) {
  return html.replace(/>([^<>]+)</g, (_match, text) => {
    if (!text.trim()) return `>${text}<`;
    return `>${encodeHtmlText(text)}<`;
  });
}

function obfuscateAttributeValues(html) {
  const valueAttrs = "alt|aria-label|class|content|crossorigin|href|id|method|name|onclick|onchange|onkeyup|placeholder|rel|src|style|title|type|value";
  const attrPattern = new RegExp(`\\s(${valueAttrs})=(["'])(.*?)\\2`, "gis");

  return html.replace(/<([a-z][\w:-]*)([^<>]*)>/gi, (tag, name, attrs) => {
    if (/^style$/i.test(name)) return tag;

    const encodedAttrs = attrs.replace(attrPattern, (_match, attrName, quote, value) => {
      if (!value) return ` ${attrName}=${quote}${value}${quote}`;
      return ` ${attrName}=${quote}${encodeHtmlText(value)}${quote}`;
    });

    return `<${name}${encodedAttrs}>`;
  });
}

function obfuscateHtmlMarkup(html) {
  const blocks = [];
  let index = 0;

  const protectBlock = block => {
    const token = `<html-obfuscation-block data-index="${index++}"></html-obfuscation-block>`;
    blocks.push([token, block]);
    return token;
  };

  let output = html.replace(/<(script|style|pre|textarea)\b[\s\S]*?<\/\1>/gi, protectBlock);
  output = obfuscateAttributeValues(output);
  output = obfuscateTextNodes(output);

  for (const [token, block] of blocks) output = output.replace(token, () => block);
  return output;
}

async function obfuscateHtml(html, htmlName) {
  return obfuscateHtmlMarkup(minifyHtml(await obfuscateInlineScripts(html, htmlName)));
}

async function getJsFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await getJsFiles(full)));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

async function getHtmlFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await getHtmlFiles(full)));
    else if (entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

async function updateServerRoutes(uvScope, scramjetScope, dynamicScope) {
  const indexPath = path.join(process.cwd(), "index.js");
  try {
    let content = await readFile(indexPath, "utf8");
    content = replaceAll(content, OLD_UV_SCOPE, uvScope);
    content = replaceAll(content, OLD_SCRAMJET_SCOPE, scramjetScope);
    content = replaceAll(content, OLD_DYNAMIC_SCOPE, dynamicScope);
    await writeFile(indexPath, content, "utf8");
    console.log(chalk.green("  + index.js (scope routes updated)"));
  } catch {}
}

async function build() {
  console.log("Cleaning dist/...");
  await rm(DIST_DIR, { recursive: true, force: true });

  console.log("Copying static/ -> dist/...");
  await cp(SRC_DIR, DIST_DIR, { recursive: true });

  console.log(OBFUSCATE ? chalk.yellow("Obfuscation: ON") : chalk.yellow("Obfuscation: OFF (rename + rewrite only)"));

  const uvBase = randomWord();
  const scramjetSub = randomWord();
  const dynamicSub = randomWord();

  const NEW_UV_SCOPE = `/${uvBase}/`;
  const NEW_SCRAMJET_SCOPE = `/${uvBase}/${scramjetSub}/`;
  const NEW_DYNAMIC_SCOPE = `/${uvBase}/${dynamicSub}/`;
  const proxyCodecs = createProxyCodecs();

  console.log(`\nScope paths:`);
  console.log(`  ${OLD_UV_SCOPE} -> ${NEW_UV_SCOPE}`);
  console.log(`  ${OLD_SCRAMJET_SCOPE} -> ${NEW_SCRAMJET_SCOPE}`);
  console.log(`  ${OLD_DYNAMIC_SCOPE} -> ${NEW_DYNAMIC_SCOPE}`);
  console.log(`\nURL codecs:`);
  console.log(`  ultraviolet: ${proxyCodecs.uv}`);
  console.log(`  scramjet:    ${proxyCodecs.scramjet}`);
  console.log(`  dynamic:     ${proxyCodecs.dynamic}`);

  let jsPublicDir, dynPublicDir;
  do {
    jsPublicDir = randomDir();
    dynPublicDir = randomDir();
  } while (jsPublicDir === dynPublicDir);

  const jsDirFull = path.join(DIST_DIR, jsPublicDir);
  const dynDirFull = path.join(DIST_DIR, dynPublicDir);
  await mkdir(jsDirFull, { recursive: true });
  await mkdir(dynDirFull, { recursive: true });

  const NEW_DYNAMIC_FILE_PREFIX = `/${dynPublicDir}/`;
  const NEW_UV_FILE_PREFIX = `/${jsPublicDir}/`;

  const PROTECTED = ["/bare/", "/wisp/", "/baremux/", "/epoxy/", "/libcurl/", "/assets/scramjet/", NEW_UV_SCOPE, NEW_SCRAMJET_SCOPE, NEW_DYNAMIC_SCOPE];

  const usedPaths = new Set();

  function nextOutputPath(basePublicDir, baseDirFull) {
    const existingSegments = new Set(basePublicDir.split("/").filter(Boolean));
    let publicPath, fullPath;
    do {
      const filename = `${randomFilename()}.js`;
      if (Math.random() < 0.05) {
        let subDir;
        do {
          subDir = randomWord();
        } while (existingSegments.has(subDir));
        publicPath = `/${basePublicDir}/${subDir}/${filename}`;
        fullPath = path.join(baseDirFull, subDir, filename);
      } else {
        publicPath = `/${basePublicDir}/${filename}`;
        fullPath = path.join(baseDirFull, filename);
      }
    } while (usedPaths.has(publicPath));
    usedPaths.add(publicPath);
    return { publicPath, fullPath };
  }

  const jsRenameMap = new Map();
  const dynRenameMap = new Map();
  const plan = new Map();

  for (const filePath of await getJsFiles(JS_DIR)) {
    const basename = path.basename(filePath);
    const { publicPath: newPublicPath, fullPath: newFullPath } = nextOutputPath(jsPublicDir, jsDirFull);
    plan.set(filePath, { basename, newPublicPath, newFullPath, inPlace: false, group: "js" });
    jsRenameMap.set(basename, newPublicPath);
  }

  for (const filePath of await getJsFiles(UV_DIR)) {
    const basename = path.basename(filePath);
    const { publicPath: newPublicPath, fullPath: newFullPath } = nextOutputPath(jsPublicDir, jsDirFull);
    plan.set(filePath, { basename, newPublicPath, newFullPath, inPlace: false, group: "uv" });
    jsRenameMap.set(basename, newPublicPath);
  }

  const ROOT_JS = ["sw.js"];
  for (const name of ROOT_JS) {
    const filePath = path.join(DIST_DIR, name);
    let newName;
    do {
      newName = `${randomFilename()}.js`;
    } while (usedPaths.has(`/${newName}`));
    usedPaths.add(`/${newName}`);
    const newPublicPath = `/${newName}`;
    const newFullPath = path.join(DIST_DIR, newName);
    plan.set(filePath, { basename: name, newPublicPath, newFullPath, inPlace: false, group: "uv" });
    jsRenameMap.set(name, newPublicPath);
  }

  for (const filePath of await getJsFiles(DYNAMIC_DIR)) {
    const basename = path.basename(filePath);

    if (basename.startsWith(DYNAMIC_PREFIX)) {
      // Dynamic rebuilds these URLs at runtime from assets.prefix plus hardcoded
      // fragments, so the filenames must survive. Randomize the directory only.
      const newPublicPath = `/${dynPublicDir}/${basename}`;
      const newFullPath = path.join(dynDirFull, basename);
      usedPaths.add(newPublicPath);
      plan.set(filePath, { basename, newPublicPath, newFullPath, inPlace: false, group: "dynamic" });
      dynRenameMap.set(basename, newPublicPath);
    } else {
      const rel = path.relative(DIST_DIR, filePath).replace(/\\/g, "/");
      plan.set(filePath, { basename, newPublicPath: `/${rel}`, newFullPath: filePath, inPlace: true, group: "dynamic" });
    }
  }

  console.log(`\nJS/UV output:   /${jsPublicDir}`);
  console.log(`Dynamic output: /${dynPublicDir}\n`);

  let passed = 0;
  let failed = 0;
  const codecFailures = [];

  await Promise.all(
    [...plan.entries()].map(async ([filePath, { basename, newPublicPath, newFullPath, inPlace, group }]) => {
      try {
        let output = await readFile(filePath, "utf8");
        output = assertLocalPatches(output, basename);
        output = patchProxyCodecs(output, basename, proxyCodecs);

        output = replaceAll(output, OLD_SCRAMJET_SCOPE, NEW_SCRAMJET_SCOPE);
        output = replaceAll(output, OLD_DYNAMIC_SCOPE, NEW_DYNAMIC_SCOPE);
        output = replaceAll(output, OLD_UV_SCOPE, NEW_UV_SCOPE);

        if (group === "js" || group === "uv") {
          output = replaceAll(output, OLD_UV_PREFIX, NEW_UV_FILE_PREFIX);
          output = applyRenameMap(output, jsRenameMap, PROTECTED);
          output = replaceAll(output, OLD_DYNAMIC_PREFIX, NEW_DYNAMIC_FILE_PREFIX);
          output = applyRenameMap(output, dynRenameMap, PROTECTED);
        }

        if (group === "dynamic") {
          // Directory only: absolute paths in dynamic.config.js's assets.files.* would make
          // Dynamic request assets.prefix + "/dir/file.js" -> /dir//dir/file.js.
          output = replaceAll(output, OLD_DYNAMIC_PREFIX, NEW_DYNAMIC_FILE_PREFIX);
        }

        const shouldObfuscate = OBFUSCATE && !SKIP_OBFUSCATE.has(basename);
        if (shouldObfuscate) output = await runObfuscator(output, basename);

        await mkdir(path.dirname(newFullPath), { recursive: true });
        await writeFile(newFullPath, output, "utf8");
        if (!inPlace) await rm(filePath);

        const tag = shouldObfuscate ? "(obfuscated)" : SKIP_OBFUSCATE.has(basename) ? "(skip-obfuscate)" : inPlace ? "(in place)" : "(renamed)";
        console.log(chalk.green(`  + ${basename} -> ${newPublicPath} ${tag}`));
        passed++;
      } catch (err) {
        if (err instanceof CodecPatchError) codecFailures.push(err.message);
        console.error(chalk.red(`  x ${basename}: ${err.message}`));
        failed++;
      }
    }),
  );

  console.log(`\n${passed} processed${failed ? `, ${failed} failed` : ""}`);

  if (codecFailures.length) {
    console.error(chalk.red("\nAborting: URL codec patching failed."));
    console.error(chalk.red("The client and the proxy would encode/decode with mismatched keys, breaking every proxied URL.\n"));
    for (const message of codecFailures) console.error(chalk.red(`  - ${message}`));
    console.error(chalk.gray("\ndist/ is incomplete and will be rebuilt from static/ on the next run.\n"));
    process.exit(1);
  }

  for (const dir of [JS_DIR, UV_DIR, DYNAMIC_DIR]) {
    await rm(dir, { recursive: true, force: true });
  }

  const allRenames = new Map([...jsRenameMap, ...dynRenameMap]);
  const htmlFiles = await getHtmlFiles(DIST_DIR);
  console.log(`\nUpdating ${htmlFiles.length} HTML files${OBFUSCATE_HTML ? " + obfuscating" : ""}...\n`);

  await Promise.all(
    htmlFiles.map(async htmlPath => {
      let html = await readFile(htmlPath, "utf8");
      let changed = false;

      for (const [oldScope, newScope] of [
        [OLD_SCRAMJET_SCOPE, NEW_SCRAMJET_SCOPE],
        [OLD_DYNAMIC_SCOPE, NEW_DYNAMIC_SCOPE],
        [OLD_UV_SCOPE, NEW_UV_SCOPE],
      ]) {
        const updated = replaceAll(html, oldScope, newScope);
        if (updated !== html) {
          html = updated;
          changed = true;
        }
      }

      for (const [original, newPublicPath] of allRenames) {
        const pattern = new RegExp(`((?:src|href)=["'])[^"']*${escapeRegex(original)}(["'])`, "g");
        const updated = html.replace(pattern, `$1${newPublicPath}$2`);
        if (updated !== html) {
          html = updated;
          changed = true;
        }
      }

      if (OBFUSCATE_HTML) {
        const obfuscated = await obfuscateHtml(html, path.relative(DIST_DIR, htmlPath));
        if (obfuscated !== html) {
          html = obfuscated;
          changed = true;
        }
      }

      if (changed) {
        await writeFile(htmlPath, html, "utf8");
        console.log(chalk.green(`  + ${path.relative(DIST_DIR, htmlPath)}${OBFUSCATE_HTML ? " (html-obfuscated)" : ""}`));
      } else {
        console.log(chalk.gray(`  - ${path.relative(DIST_DIR, htmlPath)} (no changes)`));
      }
    }),
  );

  const allJs = await getJsFiles(DIST_DIR);
  const otherJs = allJs.filter(f => !f.startsWith(jsDirFull) && !f.startsWith(dynDirFull) && !f.startsWith(JS_DIR) && !f.startsWith(UV_DIR) && !f.startsWith(DYNAMIC_DIR));

  if (otherJs.length) {
    console.log(`\nUpdating ${otherJs.length} other JS files...\n`);
    await Promise.all(
      otherJs.map(async jsPath => {
        const content = await readFile(jsPath, "utf8");
        let updated = content;
        updated = replaceAll(updated, OLD_SCRAMJET_SCOPE, NEW_SCRAMJET_SCOPE);
        updated = replaceAll(updated, OLD_DYNAMIC_SCOPE, NEW_DYNAMIC_SCOPE);
        updated = replaceAll(updated, OLD_UV_SCOPE, NEW_UV_SCOPE);
        updated = replaceAll(updated, OLD_UV_PREFIX, NEW_UV_FILE_PREFIX);
        updated = replaceAll(updated, OLD_DYNAMIC_PREFIX, NEW_DYNAMIC_FILE_PREFIX);
        updated = applyRenameMap(updated, allRenames, PROTECTED);
        if (updated !== content) {
          await writeFile(jsPath, updated, "utf8");
          console.log(chalk.green(`  + ${path.relative(DIST_DIR, jsPath)}`));
        }
      }),
    );
  }

  console.log("\nUpdating server routes...\n");
  await updateServerRoutes(NEW_UV_SCOPE, NEW_SCRAMJET_SCOPE, NEW_DYNAMIC_SCOPE);

  console.log(chalk.green("\nBuild complete -> dist/"));
  console.log(chalk.blue(`\nNew scope: ${NEW_UV_SCOPE}  scramjet: ${NEW_SCRAMJET_SCOPE}  dynamic: ${NEW_DYNAMIC_SCOPE}`));
}

build().catch(err => {
  console.error(chalk.red("\nBuild failed:"), err);
  process.exit(1);
});
