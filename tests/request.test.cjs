const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(require.resolve("../request.js"), "utf8");
const configuration = {
  private_url: "https://private.example/upload/?existing=value",
  username: "uploader",
  password: "secret",
  authentication: "copyparty",
};

function setup(responses) {
  const requests = [];
  const context = {
    browser: { runtime: { getManifest: () => ({ version: "9" }) } },
    btoa,
    URL,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      assert.ok(responses.length, "unexpected request");
      const next = responses.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  vm.runInNewContext(source, context);
  return { requests, check: (options = {}) => context.checkConnection({ ...configuration, ...options }) };
}

test("detects password-only authentication with one read-only request", async () => {
  const { check, requests } = setup([Response.json({ acct: "uploader", perms: ["write", "upget"] })]);
  const result = await check();
  assert.equal(result.ok, true);
  assert.equal(result.copyparty_usernames, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.PW, "secret");
  assert.equal(requests[0].url, configuration.private_url + "&ls=");
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].credentials, "omit");
  assert.equal(requests[0].redirect, "error");
  assert.equal(requests[0].body, undefined);
});

for (const firstResponse of [
  () => Response.json({ acct: "*", perms: ["write"] }),
  () => new Response(null, { status: 401 }),
  () => new Response(null, { status: 403 }),
  () => new Response(null, { status: 404 }),
]) {
  test("detects --usernames without mistaking anonymous access for authentication", async () => {
    const { check, requests } = setup([firstResponse(), Response.json({ acct: "uploader", perms: ["write"] })]);
    const result = await check();
    assert.equal(result.ok, true);
    assert.equal(result.copyparty_usernames, true);
    assert.deepEqual(requests.map(request => request.headers.PW), ["secret", "uploader:secret"]);
    assert.ok(requests.every(request => request.method == "GET" && request.redirect == "error"));
  });
}

test("rejects incorrect credentials even if anonymous uploads are allowed", async () => {
  const { check } = setup([
    Response.json({ acct: "*", perms: ["write"] }),
    Response.json({ acct: "*", perms: ["write"] }),
  ]);
  const result = await check();
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("checks a previously detected --usernames mode first", async () => {
  const { check, requests } = setup([Response.json({ acct: "uploader", perms: ["write"] })]);
  const result = await check({ copyparty_usernames: true });
  assert.equal(result.copyparty_usernames, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.PW, "uploader:secret");
});

test("rejects an authenticated account without write permission", async () => {
  const { check, requests } = setup([Response.json({ acct: "uploader", perms: ["read"] })]);
  assert.equal((await check()).status, 403);
  assert.equal(requests.length, 1);
});

test("does not retry server errors", async () => {
  const { check, requests } = setup([new Response(null, { status: 503 })]);
  assert.equal((await check()).status, 503);
  assert.equal(requests.length, 1);
});

test("does not retry network or redirect failures", async () => {
  const { check, requests } = setup([new TypeError("fetch failed")]);
  await assert.rejects(check(), TypeError);
  assert.equal(requests.length, 1);
});

test("rejects malformed JSON responses", async () => {
  const { check } = setup([new Response("not JSON", { status: 200 })]);
  await assert.rejects(check(), SyntaxError);
});
