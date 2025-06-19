#!/usr/bin/env node
/**
 * verify-wrappers.js  –  TEMPORARY Tact-only validator
 *
 * Rules:
 *   A) helper files (*.compile.ts, *.test.ts, *.spec.ts, extra dots) are skipped
 *   B) if ./build/ does not exist → exit 0 (nothing built yet)
 *   C) C-01  ❌  class extends/implements Contract  → must extend alias wrapper
 *   D) If the file references ../build/      → must have alias-import + subclass
 *   E) Mandatory static methods (init?, fromInit, fromAddress) with no `any`
 *
 * Will be removed once merged into the unified linter.
 */

const fs   = require("fs");
const path = require("path");
const { Project } = require("ts-morph");

const ROOT         = process.cwd();
const WRAPPERS_DIR = path.join(ROOT, "wrappers");
const BUILD_DIR    = path.join(ROOT, "build");
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

  /* C-01 ► forbid direct Contract usage */
  sf.getClasses().forEach(cls => {
    const extendsText = cls.getExtends()?.getText();
    const implementsContract = cls.getImplements().some(impl => impl.getText() === "Contract");

    if (extendsText === "Contract" || implementsContract) {
      return report(file, [
        `• Class ${cls.getName()} extends/implements 'Contract' directly.`,
        "  Tact wrappers *must* extend the generated <Name>Wrapper instead.",
        "  Example:",
        "    import { Foo as FooWrapper } from '../build/Foo/Foo_Foo';",
        "    export class Foo extends FooWrapper { /* … */ }",
      ]);
    }
  });

  /* Alias import detection */
  const importDecl = sf
    .getImportDeclarations()
    .find(d => d.getModuleSpecifierValue().includes(`../${BUILD_REL}/`));
  const hasBuildExport = sf.getExportDeclarations().some(d =>
    d.getModuleSpecifierValue()?.includes(`../${BUILD_REL}/`),
  );

  /* skip file with no reference to build */
  if (!importDecl && !hasBuildExport) return;

  if (hasBuildExport && !importDecl) {
    return report(file, [
      "• File re-exports the generated wrapper but lacks an alias import.",
      "  Replace export-star-only with alias import and subclass.",
    ]);
  }

  const aliasSpec = importDecl?.getNamedImports().find(s => s.getAliasNode());
  if (!aliasSpec) {
    return report(file, [
      "• Alias import must look like:",
      "    import { Bar as BarWrapper } from '../build/…';",
    ]);
  }

  const parentAlias = aliasSpec.getAliasNode().getText();  // FooWrapper
  const parentName  = aliasSpec.getNameNode().getText();   // Foo
  const relBuild    = importDecl.getModuleSpecifierValue();
  const buildPath   = path.resolve(path.dirname(file), relBuild + ".ts");
  if (!fs.existsSync(buildPath)) return;  // build artifact absent yet

  /* class presence and inheritance */
  const cls = sf.getClass(() => true);
  if (!cls) {
    return report(file, [
      `• Wrapper class missing. Expected: export class ${parentName} extends ${parentAlias} { … }`,
    ]);
  }
  if (cls.getExtends()?.getText() !== parentAlias) {
    report(file, [
      `• ${cls.getName()} must extend alias wrapper ${parentAlias}.`,
    ]);
  }

  /* mandatory static methods */
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
    if (!m) return report(file, [`• Missing mandatory method → ${sig}`]);

    const anyUsed =
      (m.getReturnTypeNode()?.getText() || "").includes("any") ||
      m.getParameters().some(
        p => (p.getTypeNode()?.getText() || "").includes("any"),
      );
    if (anyUsed) report(file, [`• Method ${name} contains forbidden type any.`]);
  });
});

/* ─ exit ─ */
if (errors) {
  console.error(`\nΣ errors: ${errors} — build aborted.`);
  process.exit(1);
}
console.log("✅ Wrapper validation passed.");
