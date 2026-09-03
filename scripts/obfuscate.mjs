import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const assetRoot = path.join(projectRoot, "static", "assets");
const assetDirectories = ["js", "languagearts", "mathematics", "history"];
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function rewriteAssetReferences(filePath) {
  const original = readFileSync(filePath, "utf8");
  let rewritten = original;

  for (const directoryName of assetDirectories) {
    rewritten = rewritten.replaceAll(`assets/${directoryName}/`, `assets/${directoryName}-obfuscated/`);
  }

  if (rewritten !== original) writeFileSync(filePath, rewritten);
}

function rewriteJavaScriptReferences(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteJavaScriptReferences(filePath);
      continue;
    }
    if (entry.name.endsWith(".js")) rewriteAssetReferences(filePath);
  }
}

function obfuscateDirectory(sourceDirectory, outputDirectory) {
  mkdirSync(outputDirectory, { recursive: true });
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

    const isLargeBundle = readFileSync(sourcePath).length > 500_000;
    const options = [
      "--compact",
      "true",
      "--debug-protection",
      "true",
      "--debug-protection-interval",
      "4000",
      "--disable-console-output",
      "true",
      "--identifier-names-generator",
      "mangled-shuffled",
      "--random-identifiers-prefix",
      "true",
      "--numbers-to-expressions",
      isLargeBundle ? "false" : "true",
      "--self-defending",
      "true",
      "--string-array",
      "true",
      "--string-array-encoding",
      "rc4",
      "--string-array-threshold",
      "1",
      "--string-array-calls-transform",
      "true",
      "--string-array-calls-transform-threshold",
      "1",
      "--string-array-index-shift",
      "true",
      "--string-array-rotate",
      "true",
      "--string-array-shuffle",
      "true",
      "--split-strings",
      "true",
      "--split-strings-chunk-length",
      "5",
      "--transform-object-keys",
      "true",
      "--source-map",
      "false",
    ];

    if (!isLargeBundle) {
      options.push(
        "--control-flow-flattening",
        "true",
        "--control-flow-flattening-threshold",
        "1",
        "--dead-code-injection",
        "true",
        "--dead-code-injection-threshold",
        "1",
      );
    }

    execFileSync(
      pnpm,
      [
        "dlx",
        "javascript-obfuscator@5.6.0",
        sourcePath,
        "--output",
        outputPath,
        ...options,
      ],
      { stdio: "inherit" },
    );
  }
}

const stagingRoot = mkdtempSync(path.join(projectRoot, ".obfuscate-"));
const outputDirectories = [];

try {
  for (const directoryName of assetDirectories) {
    const sourceDirectory = path.join(assetRoot, directoryName);
    const stagedDirectory = path.join(stagingRoot, directoryName);
    const outputDirectory = path.join(assetRoot, `${directoryName}-obfuscated`);

    if (!existsSync(sourceDirectory)) {
      throw new Error(`Missing source directory: ${sourceDirectory}`);
    }

    cpSync(sourceDirectory, stagedDirectory, { recursive: true });
    rewriteJavaScriptReferences(stagedDirectory);
    rmSync(outputDirectory, { recursive: true, force: true });
    obfuscateDirectory(stagedDirectory, outputDirectory);
    outputDirectories.push(outputDirectory);
  }
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}

function rewriteHtml(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteHtml(filePath);
      continue;
    }
    if (entry.name.endsWith(".html")) rewriteAssetReferences(filePath);
  }
}

rewriteHtml(path.join(projectRoot, "static"));
rewriteAssetReferences(path.join(projectRoot, "static", "sw.js"));
for (const outputDirectory of outputDirectories) {
  rewriteHtml(outputDirectory);
}

console.log(
  `Obfuscated first-party JavaScript into ${outputDirectories
    .map((directory) => path.relative(projectRoot, directory))
    .join(", ")}`,
);
