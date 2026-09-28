var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var fields = [
  "sequence",
  "contractNo",
  "slash",
  "fiscalYear",
  "contractDate",
  "item",
  "planBudget",
  "procurementAmount",
  "contractor",
  "guaranteeType",
  "guaranteeBranch",
  "guaranteeNo",
  "guaranteeDate",
  "guaranteeAmount",
  "deliveryDue",
  "deliveryActual",
  "acceptanceDate",
  "warrantyPeriod",
  "warrantyDay",
  "warrantyMonth",
  "warrantyYear",
  "guaranteeReturnDate",
  "procurementOfficer",
  "department",
  "fundSource",
  "status",
  "fileName",
  "sourceNote"
];
var json = /* @__PURE__ */ __name((body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } }), "json");
var fail = /* @__PURE__ */ __name((status, message) => {
  throw Object.assign(new Error(message), { status });
}, "fail");
function pdfStorageEnabled(env) {
  return env.PDF_STORAGE_ENABLED === "true" && typeof env.PDFS?.get === "function" && typeof env.PDFS?.put === "function";
}
__name(pdfStorageEnabled, "pdfStorageEnabled");
function clean(input) {
  const data = Object.fromEntries(fields.map((k) => [k, typeof input?.[k] === "string" ? input[k].trim() : ""]));
  if (!/^\d{2}-\d{3,4}$/.test(data.sequence)) fail(400, "\u0E40\u0E25\u0E02\u0E04\u0E38\u0E21\u0E41\u0E1F\u0E49\u0E21\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 \u0E40\u0E0A\u0E48\u0E19 69-298");
  if (!data.contractNo || !data.fiscalYear || !data.item) fail(400, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E23\u0E2D\u0E01\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E0D\u0E0D\u0E32 \u0E1B\u0E35 \u0E41\u0E25\u0E30\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23");
  data.folderCount = Number(input.folderCount ?? 1);
  if (!Number.isInteger(data.folderCount) || data.folderCount < 1 || data.folderCount > 100) fail(400, "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E41\u0E1F\u0E49\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E15\u0E47\u0E21 1\u2013100");
  return data;
}
__name(clean, "clean");
function item(row) {
  return { ...JSON.parse(row.data), sequence: row.sequence, updatedAt: row.updated_at };
}
__name(item, "item");
async function limitedBody(req, limit) {
  if (Number(req.headers.get("content-length")) > limit) fail(413, "\u0E44\u0E1F\u0E25\u0E4C\u0E2B\u0E23\u0E37\u0E2D\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E43\u0E2B\u0E0D\u0E48\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      fail(413, "\u0E44\u0E1F\u0E25\u0E4C\u0E2B\u0E23\u0E37\u0E2D\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E43\u0E2B\u0E0D\u0E48\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}
__name(limitedBody, "limitedBody");
async function authorize(req, env) {
  if (env.APP_ENABLED !== "true") return json({ error: "\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E22\u0E49\u0E32\u0E22\u0E22\u0E31\u0E07\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E2D\u0E22\u0E39\u0E48" }, 503);
  if (env.LOCAL_DEV === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(req.url).hostname)) return null;
  if (!env.ACCESS_USER || !env.ACCESS_PASSWORD) return null;
  let supplied = "";
  try {
    supplied = atob((req.headers.get("Authorization") || "").replace(/^Basic /, ""));
  } catch {
  }
  const expected = env.ACCESS_USER + ":" + env.ACCESS_PASSWORD;
  const digest = /* @__PURE__ */ __name(async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), "digest");
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch ? new Response("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Spine", charset="UTF-8"', "Cache-Control": "no-store" } }) : null;
}
__name(authorize, "authorize");
async function records(req, env, url) {
  if (req.method === "GET") {
    const offset = Number(url.searchParams.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) fail(400, "invalid-offset");
    const { results } = await env.DB.prepare("SELECT sequence,data,updated_at FROM contract_spine_records ORDER BY sequence LIMIT 501 OFFSET ?").bind(offset).all();
    return json({ items: results.slice(0, 500).map(item), nextOffset: results.length > 500 ? offset + 500 : null });
  }
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(await limitedBody(req, 128 * 1024)));
  } catch (e) {
    if (e.status) throw e;
    fail(400, "invalid-json");
  }
  const data = clean(body);
  const row = await env.DB.prepare("INSERT INTO contract_spine_records(sequence,data) VALUES (?,?) ON CONFLICT(sequence) DO UPDATE SET data=excluded.data,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING sequence,data,updated_at").bind(data.sequence, JSON.stringify(data)).first();
  return json({ item: item(row) });
}
__name(records, "records");
async function documents(req, env, url) {
  if (!pdfStorageEnabled(env)) {
    const body = { enabled: false, code: "pdf-storage-disabled", message: "\u0E1B\u0E34\u0E14\u0E01\u0E32\u0E23\u0E41\u0E19\u0E1A\u0E41\u0E25\u0E30\u0E40\u0E1B\u0E34\u0E14 PDF \u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27 \u0E17\u0E30\u0E40\u0E1A\u0E35\u0E22\u0E19\u0E41\u0E25\u0E30\u0E01\u0E32\u0E23\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E2A\u0E31\u0E19\u0E41\u0E1F\u0E49\u0E21\u0E22\u0E31\u0E07\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E44\u0E14\u0E49\u0E15\u0E32\u0E21\u0E1B\u0E01\u0E15\u0E34", items: [] };
    return json(body, req.method === "GET" && !url.searchParams.has("id") ? 200 : 409);
  }
  if (req.method === "GET") {
    const id2 = url.searchParams.get("id");
    if (id2) {
      const row = await env.DB.prepare("SELECT * FROM spine_documents WHERE id=?").bind(id2).first();
      if (!row) fail(404, "document-not-found");
      const object = await env.PDFS.get(row.object_key);
      if (!object) fail(404, "pdf-not-found");
      return new Response(object.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(row.file_name), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const { results } = await env.DB.prepare("SELECT id,file_name,byte_size,sha256,created_at FROM spine_documents WHERE sequence=? ORDER BY created_at").bind(url.searchParams.get("sequence") || "").all();
    return json({ items: results });
  }
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);
  const sequence = url.searchParams.get("sequence") || "";
  if (!await env.DB.prepare("SELECT sequence FROM contract_spine_records WHERE sequence=?").bind(sequence).first()) fail(400, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E17\u0E30\u0E40\u0E1A\u0E35\u0E22\u0E19\u0E01\u0E48\u0E2D\u0E19\u0E41\u0E19\u0E1A PDF");
  const bytes = await limitedBody(req, 20 * 1024 * 1024);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") fail(400, "\u0E44\u0E1F\u0E25\u0E4C\u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48 PDF");
  const id = crypto.randomUUID(), key = "contracts/" + sequence + "/" + id + ".pdf";
  const name = (url.searchParams.get("name") || "contract.pdf").replace(/[\r\n/\\]/g, "_").slice(0, 200);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) => x.toString(16).padStart(2, "0")).join("");
  await env.PDFS.put(key, bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { sequence, sha256: hash } });
  await env.DB.prepare("INSERT INTO spine_documents(id,sequence,object_key,file_name,byte_size,sha256) VALUES (?,?,?,?,?,?)").bind(id, sequence, key, name, bytes.length, hash).run();
  return json({ item: { id, file_name: name, byte_size: bytes.length, sha256: hash } }, 201);
}
__name(documents, "documents");
async function drive(req, env, url) {
  if (req.method !== "GET") return json({ error: "method-not-allowed" }, 405);
  if (env.DRIVE_BRIDGE_ENABLED !== "true" || !env.DRIVE_BRIDGE_URL) return json({ configured: false, files: [], extracted: {}, error: "original-reader-not-in-source" }, 503);
  let contract = (url.searchParams.get("contract") || "").trim().replace(/\s+/g, "").replace(/[-–—]/g, "/");
  const match = contract.match(/^(\d{1,4})\/(\d{2,4})$/);
  if (!match) fail(400, "invalid-contract");
  let year = Number(match[2]);
  if (year < 100) year += 2500;
  contract = Number(match[1]) + "/" + year;
  const target = new URL(env.DRIVE_BRIDGE_URL);
  if (target.protocol !== "https:") fail(503, "invalid-bridge-configuration");
  target.searchParams.set("contract", contract);
  const response = await fetch(target, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15e3) });
  let data;
  try {
    data = await response.json();
  } catch {
    fail(502, "invalid-upstream-response");
  }
  return json(data, response.status);
}
__name(drive, "drive");
var worker_default = {
  async fetch(req, env) {
    try {
      const denied = await authorize(req, env);
      if (denied) return denied;
      const url = new URL(req.url);
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.get("origin");
        if (origin && origin !== url.origin || req.headers.get("sec-fetch-site") === "cross-site") fail(403, "cross-origin-write-denied");
      }
      if (url.pathname === "/api/spine-records") return await records(req, env, url);
      if (url.pathname === "/api/features" && req.method === "GET") return json({ pdfStorageEnabled: pdfStorageEnabled(env) });
      if (url.pathname === "/api/spine-documents") return await documents(req, env, url);
      if (url.pathname === "/api/drive-contract") return await drive(req, env, url);
      if (url.pathname.startsWith("/api/")) fail(404, "not-found");
      if (!["GET", "HEAD"].includes(req.method)) return json({ error: "method-not-allowed" }, 405);
      if (url.pathname === "/") return Response.redirect(url.origin + "/spine/", 302);
      const response = await env.ASSETS.fetch(req);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: response.status, headers });
    } catch (e) {
      return json({ error: e.status ? e.message : "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E17\u0E33\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E44\u0E14\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48" }, e.status || 500);
    }
  }
};
export {
  clean,
  worker_default as default,
  pdfStorageEnabled
};
//# sourceMappingURL=worker.js.map
