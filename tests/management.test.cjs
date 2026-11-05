const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(require.resolve("../request.js"), "utf8") + "\n" +
  readFileSync(require.resolve("../management.js"), "utf8");

for (const authentication of [undefined, "copyparty", "copyparty-usernames"]) {
  test(`connection check and saved settings use ${authentication || "legacy Basic authentication"}`, async () => {
    const inputs = {};
    for (const name of ["private_url", "public_url", "username", "password", "authentication"]) {
      inputs[name] = { value: name == "authentication" ? "basic" : "" };
    }
    const button = {};
    const notifications = { dataset: {} };
    const form = {
      checkValidity: () => true,
      querySelector: selector => selector == "button" ? button :
        inputs[selector.match(/name="([^"]+)"/)[1]],
    };
    const configuration = {
      private_url: "https://private.example/upload/",
      public_url: "https://public.example/download/",
      username: "uploader",
      password: "secret",
      authentication,
    };
    const requests = [];
    let saved;
    let updated;
    vm.runInNewContext(source, {
      document: {
        querySelector: () => form,
        querySelectorAll: () => [],
        getElementById: () => notifications,
      },
      location: { href: "https://extension.example/management.html?accountId=account1" },
      browser: {
        storage: { local: {
          get: async () => ({ account1: configuration }),
          set: async value => { saved = value.account1; },
        } },
        cloudFile: {
          getAllAccounts: async () => [{ id: "account1", configured: true }],
          updateAccount: async (id, value) => { updated = value; },
        },
        runtime: { getManifest: () => ({ version: "9" }) },
        i18n: { getMessage: key => key },
      },
      URL,
      btoa,
      setTimeout: resolve => resolve(),
      fetch: async (url, options) => {
        requests.push({ url, ...options });
        return new Response(null, { status: 200 });
      },
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(inputs.authentication.value, authentication || "basic");
    await button.onclick();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "OPTIONS");
    assert.equal(requests[0].url, configuration.private_url);
    assert.equal(requests[0].headers.Authorization, `Basic ${btoa("uploader:secret")}`);
    assert.equal(requests[0].headers.PW, authentication == "copyparty" ? "secret" :
      authentication == "copyparty-usernames" ? "uploader:secret" : undefined);
    assert.equal(requests[0].redirect, authentication ? "error" : "follow");
    assert.equal(saved.authentication, authentication || "basic");
    assert.equal(saved.password, configuration.password);
    assert.equal(updated.configured, true);
  });
}
