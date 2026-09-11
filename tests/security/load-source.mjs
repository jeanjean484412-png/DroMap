import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compileFunction } from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);

export function loadSource(relativePath, mocks = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const resolve = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/") || name.startsWith(".")) {
        let target = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
        if (!existsSync(target)) target += ".ts";
        const alias = "@/" + path.relative(root, target).replaceAll("\\", "/").replace(/\.ts$/, "");
        if (Object.hasOwn(mocks, alias)) return mocks[alias];
        return load(target);
      }
      return nativeRequire(name);
    };
    compileFunction(code, ["require", "module", "exports"], { filename })(resolve, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load(path.join(root, relativePath));
}
