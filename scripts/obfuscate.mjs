import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "static", "assets", "js");
const outputRoot = path.join(projectRoot, "static", "assets", "js-obfuscated");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

if (!existsSync(sourceRoot)) {
  throw new Error(`Missing source directory: ${sourceRoot}`);
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

function obfuscateDirectory(sourceDirectory, outputDirectory) {
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const outputPath = path.join(outputDirectory, entry.name);

    if (entry.isDirectory()) {
      mkdirSync(outputPath, { recursive: true });
      obfuscateDirectory(sourcePath, outputPath);
      continue;
    }

    if (!entry.name.endsWith(".js")) {
      cpSync(sourcePath, outputPath);
      continue;
    }

    execFileSync(
      pnpm,
      [
        "dlx",
        "--yes",
        "javascript-obfuscator@5.6.0",
        sourcePath,
        "--output",
        outputPath,
        "--compact",
        "true",
        "--source-map",
        "false",
      ],
      { stdio: "inherit" },
    );
  }
}

obfuscateDirectory(sourceRoot, outputRoot);

function rewriteHtml(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteHtml(filePath);
      continue;
    }
    if (!entry.name.endsWith(".html")) continue;

    const original = readFileSync(filePath, "utf8");
    const rewritten = original.replace(/(assets\/)js\//g, "$1js-obfuscated/");
    if (rewritten !== original) writeFileSync(filePath, rewritten);
  }
}

rewriteHtml(path.join(projectRoot, "static"));
console.log(`Obfuscated first-party JavaScript into ${path.relative(projectRoot, outputRoot)}`);
