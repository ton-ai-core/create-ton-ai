#!/usr/bin/env node
/**
 * verify-wrappers.js  –  TEMPORARY Tact-only validator
 *
 *   • If ./build/ is missing       → skip everything (exit 0)
 *   • Helper files (*.compile.ts, *.test.ts, *.spec.ts, extra dots) are skipped
 *   • Rules for a wrapper file that *references* ../build/:
 *        – MUST import alias:   import { Foo as FooWrapper } from '../build/...';
 *        – MUST declare class:  export class Foo extends FooWrapper { ... }
 *        – MUST implement static methods (init?) fromInit & fromAddress
 *        – MUST NOT use `any` in those signatures
 *   • If the file has NO import *and* NO re-export → treated as “not yet built”
 *     and silently ignored.
 *   • Will be removed once merged into the unified linter.
 */

const fs   = require("fs");
const path = require("path");
const { Project } = require("ts-morph");

const ROOT         = process.cwd();
const WRAPPERS_DIR = path.join(ROOT, "wrappers");
const BUILD_DIR    = path.join(ROOT, "build"); // absolute
const BUILD_REL    = "build";

if (!fs.existsSync(BUILD_DIR)) {
  process.exit(0);
}
if (!fs.existsSync(WRAPPERS_DIR)) {
  console.error("❌  wrappers/ folder not found."); process.exit(1);
}

const project = new Project({
  tsConfigFilePath: path.join(ROOT, "tsconfig.json"),
  skipAddingFilesFromTsConfig: true,
});

/* ─ helpers ─ */
let errors = 0;

const isTactWrapper = name =>
  /^[\w-]+\.ts$/.test(name) &&
  !/\.compile\.ts$|\.test\.ts$|\.spec\.ts$/i.test(name) &&
  !name.endsWith(".d.ts");

const walk = dir =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full)
      : isTactWrapper(e.name) ? [full]
      : [];
  });

const report = (file, msgs) => {
  console.error(`\n[❌] ${path.relative(ROOT, file)}:`);
  msgs.forEach(m => console.error("   " + m));
  errors += 1;
};

/* ─ validation ─ */
walk(WRAPPERS_DIR).forEach(file => {
  const sf = project.addSourceFileAtPath(file);

  const importDecl = sf
    .getImportDeclarations()
    .find(d => d.getModuleSpecifierValue().includes(`../${BUILD_REL}/`));

  const hasBuildExport = sf.getExportDeclarations().some(d =>
    d.getModuleSpecifierValue()?.includes(`../${BUILD_REL}/`),
  );

  /* --- Skip logic -------------------------------------------------------- */
  if (!importDecl && !hasBuildExport) {
    // wrapper makes no reference to build – treat as “not yet generated”
    return;
  }

  if (hasBuildExport && !importDecl) {
    return report(file, [
      "• File re-exports the generated wrapper but never imports it with an",
      "  alias. Replace the export-star-only approach with the full pattern:",
      "    import { Foo as FooWrapper } from '../build/Foo/Foo_Foo';",
      "    export class Foo extends FooWrapper { /* … */ }",
    ]);
  }

  /* From here on we *have* an alias import ------------------------------- */
  const aliasSpec = importDecl.getNamedImports().find(s => s.getAliasNode());
  if (!aliasSpec) {
    return report(file, [
      "• Alias import must look like:",
      "    import { Bar as BarWrapper } from '../build/…';",
    ]);
  }

  const parentAlias = aliasSpec.getAliasNode().getText(); // FooWrapper
  const parentName  = aliasSpec.getNameNode().getText();  // Foo
  const relBuild    = importDecl.getModuleSpecifierValue();
  const buildPath   = path.resolve(path.dirname(file), relBuild + ".ts");

  if (!fs.existsSync(buildPath)) return; // generated TS not there yet

  /* class presence -------------------------------------------------------- */
  const cls = sf.getClass(() => true);
  if (!cls) {
    return report(file, [
      "• Wrapper class missing. Add:",
      `    export class ${parentName} extends ${parentAlias} { ... }`,
    ]);
  }

  if (cls.getExtends()?.getText() !== parentAlias) {
    report(file, [
      `• ${cls.getName()} must extend alias wrapper ${parentAlias}.`,
    ]);
  }

  /* mandatory static methods --------------------------------------------- */
  const required = [
    ["fromInit",   `static async fromInit(): Promise<${cls.getName()}>`],
    ["fromAddress",`static fromAddress(address: Address): ${cls.getName()}`],
  ];

  const buildSF  = project.addSourceFileAtPath(buildPath);
  if (buildSF.getClass(parentName)?.getStaticMethod("init")) {
    required.unshift(["init", `static async init(...): Promise<${cls.getName()}>`]);
  }

  required.forEach(([name, sig]) => {
    const m = cls.getStaticMethod(name);
    if (!m) {
      return report(file, [`• Missing mandatory method → ${sig}`]);
    }
    const anyUsed =
      (m.getReturnTypeNode()?.getText() || "").includes("any") ||
      m.getParameters().some(
        p => (p.getTypeNode()?.getText() || "").includes("any"),
      );
    if (anyUsed) {
      report(file, [
        `• Method ${name} contains forbidden type any. Use explicit types.`,
      ]);
    }
  });
});

/* ─ exit ─ */
if (errors) {
  console.error(`\nΣ errors: ${errors} — build aborted.`);
  process.exit(1);
}
console.log("✅ Wrapper validation passed.");
