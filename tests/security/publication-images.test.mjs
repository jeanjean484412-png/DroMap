import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import { before, test } from "node:test";
import ts from "typescript";
import sharp from "sharp";
import { loadSource as loadSharedSource } from "./load-source.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);

// Exécuter les vrais fichiers TS et handlers, sans démarrer Next ni contacter
// Supabase/Stripe. Les frontières réseau/auth sont explicitement simulées.
function loadSource(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  const loadedModule = { exports: {} };
  const isolatedRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "server-only") return {};
    if (name === "sharp") return sharp;
    if (name === "next/server") return nativeRequire("next/server");
    if (name === "@/lib/dromap/server/request-security") return loadSharedSource("lib/dromap/server/request-security.ts");
    throw new Error(`Import non simulé dans le test : ${name}`);
  };
  compileFunction(outputText, ["require", "module", "exports"], { filename })(isolatedRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const imageModule = loadSource("lib/dromap/server/image-data-url.ts");
const { decodeSupportedImageDataUrl: decode } = imageModule;
const publicationValues = loadSource("lib/dromap/publications.ts");
const dataUrl = (bytes, format = "jpeg") => `data:image/${format};base64,${bytes.toString("base64")}`;
let jpeg, webp, avif, png;

before(async () => {
  const source = sharp({ create: { width: 64, height: 48, channels: 3, background: "#167777" } });
  [jpeg, webp, avif, png] = await Promise.all([
    source.clone().jpeg().toBuffer(), source.clone().webp().toBuffer(),
    source.clone().avif().toBuffer(), source.clone().png().toBuffer(),
  ]);
});

test("JPEG et WebP valides : octets et type MIME conservés", async () => {
  for (const [bytes, format] of [[jpeg, "jpeg"], [webp, "webp"]]) {
    const decoded = await decode(dataUrl(bytes, format));
    assert.ok(decoded);
    assert.equal(decoded.mimeType, `image/${format}`);
    assert.deepEqual(decoded.bytes, bytes);
  }
});

test("anciens base64 sans padding et avec retours à la ligne acceptés", async () => {
  const unpadded = dataUrl(jpeg).replace(/=+$/, "");
  assert.deepEqual((await decode(unpadded)).bytes, jpeg);
  const wrapped = `data:image/jpeg;base64,${jpeg.toString("base64").match(/.{1,76}/g).join("\r\n")}`;
  assert.deepEqual((await decode(wrapped)).bytes, jpeg);
});

test("AVIF, PNG, SVG et HTML déguisés : rejet avant le décodeur natif", async () => {
  let nativeCalls = 0;
  const guarded = loadSource("lib/dromap/server/image-data-url.ts", {
    sharp: () => { nativeCalls++; throw new Error("Ne doit pas être appelé"); },
  });
  for (const bytes of [avif, png, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from("<html>contenu</html>")]) {
    for (const format of ["jpeg", "webp"]) {
      assert.equal(await guarded.decodeSupportedImageDataUrl(dataUrl(bytes, format)), null);
    }
  }
  assert.equal(nativeCalls, 0);
});

test("types déclarés et binaires incohérents refusés", async () => {
  assert.equal(await decode(dataUrl(jpeg, "webp")), null);
  assert.equal(await decode(dataUrl(webp, "jpeg")), null);
  assert.equal(await decode(dataUrl(avif, "avif")), null);
  assert.equal(await decode(dataUrl(webp, "webp"), { allowedTypes: ["jpeg"] }), null);
});

test("base64 invalide, vide ou trop volumineux refusé", async () => {
  for (const value of [null, {}, "data:image/jpeg;base64,", dataUrl(jpeg) + "====", "data:image/jpeg;base64,AAAA=AAAA", "data:image/jpeg;base64,%00"]) {
    assert.equal(await decode(value), null);
  }
  const valid = dataUrl(jpeg);
  assert.equal(await decode(valid, { maxLength: valid.length - 1 }), null);
  assert.ok(await decode(valid, { maxLength: valid.length }));
  assert.equal(await decode("data:image/jpeg;base64," + "A".repeat(2_100_001)), null);
});

test("en-têtes plausibles mais pixels tronqués refusés", async () => {
  // Conserver le début du JPEG : les métadonnées seules ne détectent pas ce cas.
  const truncated = jpeg.subarray(0, jpeg.length - 12);
  assert.equal((await sharp(truncated).metadata()).format, "jpeg");
  assert.equal(await decode(dataUrl(truncated)), null);
  const brokenWebp = Buffer.from(webp.subarray(0, webp.length - 8));
  brokenWebp.writeUInt32LE(brokenWebp.length - 8, 4);
  assert.equal(await decode(dataUrl(brokenWebp, "webp")), null);
});

test("dimensions et nombre de pixels bornés, rendus DroMap acceptés", async () => {
  for (const [width, height, accepted] of [[1800, 1350, true], [4097, 1, false], [4001, 4000, false]]) {
    const bytes = await sharp({ create: { width, height, channels: 3, background: "white" } }).jpeg().toBuffer();
    assert.equal(Boolean(await decode(dataUrl(bytes))), accepted);
  }
});

test("WebP animé refusé", async () => {
  const frames = Buffer.alloc(16 * 32 * 3, 100);
  frames.fill(200, 16 * 16 * 3);
  const animated = await sharp(frames, { raw: { width: 16, height: 32, channels: 3, pageHeight: 16 } })
    .webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  assert.equal(await decode(dataUrl(animated, "webp")), null);
});

function routeFixture(relativePath, options = {}) {
  const writes = [];
  const ownershipChecks = [];
  const row = options.row ?? { slug: "carte-test", title: "Carte été", image_data_url: dataUrl(jpeg) };
  const auth = options.auth === false ? null : { accessToken: "token-simule", user: { id: "proprietaire" } };
  const publications = {
    dromapPublicationsConfigured: () => true,
    publicationsAdminFetch: async (url, init) => {
      if (init.method === "GET") return Response.json([row]);
      writes.push({ url, ...init, body: JSON.parse(init.body) });
      return new Response(null, { status: 204 });
    },
    createUniquePublicationSlug: async () => "carte-test",
    readOwnedPublication: async () => options.existing ? row : null,
    readPublicationBySlug: async () => row,
    publicationRowToPublic: (value) => value,
    getPublicationViewerAccess: async () => ({ canExport: options.canExport !== false }),
    freezePublicationSourceFromProject: async () => { throw new Error("Copie modifiable hors de ce test"); },
  };
  const routes = loadSource(relativePath, {
    "@/lib/dromap/server/image-data-url": imageModule,
    "@/lib/dromap/server/publications": publications,
    "@/lib/dromap/publications": publicationValues,
    "@/lib/dromap/server/supabase-rest": {
      getAuthenticatedRequestUser: async () => auth,
      parseJsonResponse: async (response) => response.json(),
    },
    "@/lib/dromap/server/billing": {
      getDromapBillingAccessForSession: async () => ({ plan: options.plan ?? "plus" }),
      userOwnsDromapProject: async (owner, project) => {
        ownershipChecks.push([owner, project]);
        return options.ownsProject !== false;
      },
    },
  });
  return { ...routes, writes, ownershipChecks };
}

function publicationRequest(overrides = {}) {
  return new Request("http://localhost/api/dromap/publications", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: "projet", title: "Carte", accessMode: "read-only",
      thumbnailDataUrl: dataUrl(jpeg), previewDataUrl: dataUrl(webp, "webp"), imageDataUrl: dataUrl(jpeg),
      ...overrides,
    }),
  });
}

test("publication : trois images vérifiées avant toute écriture Supabase", async () => {
  for (const field of ["thumbnailDataUrl", "previewDataUrl", "imageDataUrl"]) {
    const route = routeFixture("app/api/dromap/publications/route.ts");
    const response = await route.POST(publicationRequest({ [field]: dataUrl(avif) }));
    assert.equal(response.status, 413);
    assert.equal(route.writes.length, 0);
  }
});

test("publication : tailles spécifiques conservées", async () => {
  for (const [field, max] of [["thumbnailDataUrl", 500_000], ["previewDataUrl", 1_200_000], ["imageDataUrl", 2_100_000]]) {
    const route = routeFixture("app/api/dromap/publications/route.ts");
    const response = await route.POST(publicationRequest({ [field]: "data:image/jpeg;base64," + "A".repeat(max) }));
    assert.equal(response.status, 413);
    assert.equal(route.writes.length, 0);
  }
});

test("publication : création et mise à jour conservent les images et le filtre propriétaire", async () => {
  for (const existing of [false, true]) {
    const route = routeFixture("app/api/dromap/publications/route.ts", { existing });
    const response = await route.POST(publicationRequest({ owner_id: "autre-utilisateur" }));
    assert.equal(response.status, 200);
    assert.deepEqual(route.ownershipChecks, [["proprietaire", "projet"]]);
    assert.equal(route.writes.length, 1);
    const write = route.writes[0];
    assert.equal(write.method, existing ? "PATCH" : "POST");
    assert.equal(write.body.thumbnail_data_url, dataUrl(jpeg));
    assert.equal(write.body.preview_data_url, dataUrl(webp, "webp"));
    assert.equal(write.body.image_data_url, dataUrl(jpeg));
    if (existing) assert.equal(write.url, "/dromap_publications?owner_id=eq.proprietaire&project_id=eq.projet");
    else assert.equal(write.body.owner_id, "proprietaire");
  }
});

test("publication : authentification, abonnement et propriété restent obligatoires", async () => {
  for (const [options, status] of [[{ auth: false }, 401], [{ plan: "free" }, 403], [{ ownsProject: false }, 404]]) {
    const route = routeFixture("app/api/dromap/publications/route.ts", options);
    assert.equal((await route.POST(publicationRequest())).status, status);
    assert.equal(route.writes.length, 0);
  }
});

for (const [name, field] of [["preview-image", "preview_data_url"], ["share-image", "thumbnail_data_url"]]) {
  test(`${name} : images persistées invalides refusées, images valides inchangées`, async () => {
    for (const [bytes, format, status] of [[avif, "jpeg", 404], [jpeg, "jpeg", 200], [webp, "webp", 200]]) {
      const route = routeFixture(`app/library/[slug]/${name}/route.ts`, { row: { [field]: dataUrl(bytes, format) } });
      const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ slug: "carte-test" }) });
      assert.equal(response.status, status);
      if (status === 200) {
        assert.equal(response.headers.get("Content-Type"), `image/${format}`);
        assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      }
    }
  });
}

test("export : JPEG original conservé, AVIF déguisé refusé, droits inchangés", async () => {
  for (const [options, status] of [[{}, 200], [{ auth: false }, 401], [{ canExport: false }, 403], [{ row: { image_data_url: dataUrl(avif) } }, 404]]) {
    const route = routeFixture("app/api/dromap/publications/[slug]/download/route.ts", options);
    const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ slug: "carte-test" }) });
    assert.equal(response.status, status);
    if (status === 200) {
      assert.equal(response.headers.get("Content-Type"), "image/jpeg");
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
      assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="Carte-ete.jpg"');
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
    }
  }
});

test("optimiseur Next : seul le logo peut être traité, redirection historique conservée", async () => {
  const { default: config } = loadSource("next.config.ts");
  const { hasLocalMatch } = nativeRequire("next/dist/shared/lib/match-local-pattern");
  assert.equal(hasLocalMatch(config.images.localPatterns, "/dromap-logo-mark-crop.png"), true);
  for (const url of ["/library/carte-test/preview-image", "/library/carte-test/share-image", "/api/dromap/publications/carte-test/download", "/dromap-logo-mark-crop.png?url=anything", "/dromap-logo-mark-crop.png/../api"]) {
    assert.equal(hasLocalMatch(config.images.localPatterns, url), false, url);
  }
  assert.deepEqual(config.images.remotePatterns, []);
  assert.deepEqual(await config.redirects(), [{ source: "/editor/test", destination: "/editor", permanent: true }]);
});
