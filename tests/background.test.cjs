const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(require.resolve("../request.js"), "utf8") + "\n" +
  readFileSync(require.resolve("../background.js"), "utf8");
const account = { id: "account1" };
const name = "résumé #1?.txt";
const privateUrl = "https://private.example/upload/";
const publicUrl = "https://public.example/download/";
const encodedName = encodeURIComponent(name);

function setup(response, options = {}) {
  const listeners = {};
  const requests = [];
  const configuration = {
    private_url: privateUrl,
    public_url: publicUrl,
    username: "uploader",
    password: "secret",
    ...options,
  };
  const cloudFile = {
    getAllAccounts: async () => [],
  };
  for (const event of ["onFileUpload", "onFileUploadAbort", "onFileDeleted", "onAccountDeleted"]) {
    cloudFile[event] = { addListener: listener => { listeners[event] = listener; } };
  }
  vm.runInNewContext(source, {
    browser: {
      cloudFile,
      storage: { local: { get: async () => ({ [account.id]: configuration }) } },
      runtime: { getManifest: () => ({ version: "9" }) },
    },
    AbortController,
    URL,
    btoa,
    fetch: async (url, info) => {
      requests.push({ url, ...info });
      return typeof response === "function" ? response(url, info) : response;
    },
  });
  return {
    listeners,
    requests,
    upload: () => listeners.onFileUpload(account, { id: 1, name, data: "attachment" }),
  };
}

test("copies copyparty's filekey while keeping the configured public URL", async () => {
  const { upload, requests, listeners } = setup(new Response(null, {
    status: 201,
    headers: { Location: `https://private.example/upload/${encodedName}?k=abc_123-XYZ&v` },
  }));
  const result = await upload();
  assert.equal(result.url, `${publicUrl}${encodedName}?k=abc_123-XYZ`);
  assert.equal(requests[0].url, privateUrl + encodedName);
  assert.equal(requests[0].method, "PUT");
  assert.equal(requests[0].body, "attachment");
  assert.equal(requests[0].credentials, "omit");
  assert.equal(requests[0].headers.Authorization, `Basic ${btoa("uploader:secret")}`);
  assert.equal(requests[0].headers.PW, undefined);
  assert.equal(requests[0].redirect, "follow");

  await listeners.onFileDeleted(account, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, privateUrl + encodedName);
  assert.equal(requests[1].method, "DELETE");
  assert.equal(requests[1].headers.Authorization, requests[0].headers.Authorization);
});

for (const [authentication, password] of [["copyparty", "secret"], ["copyparty-usernames", "uploader:secret"]]) {
  test(`${authentication} authenticates PUT and DELETE without forwarding passwords on redirects`, async () => {
    const { upload, listeners, requests } = setup(new Response(null, {
      status: 201,
      headers: { Location: "/upload/file.txt?k=test-key" },
    }), { authentication });
    assert.equal((await upload()).url, publicUrl + encodedName + "?k=test-key");
    await listeners.onFileDeleted(account, 1);
    assert.deepEqual(requests.map(request => request.method), ["PUT", "DELETE"]);
    for (const request of requests) {
      assert.equal(request.headers.PW, password);
      assert.equal(request.redirect, "error");
    }
  });
}

test("supports relative Location headers and an unset public URL", async () => {
  const { upload } = setup(new Response(null, {
    status: 201,
    headers: { Location: `${encodedName}?k=relative-key` },
  }), { public_url: "" });
  assert.equal((await upload()).url, `${privateUrl}${encodedName}?k=relative-key`);
});

for (const location of [null, "/upload/file.txt", "/upload/file.txt?k=", "http://["]) {
  test(`keeps generic WebDAV links unchanged for Location ${JSON.stringify(location)}`, async () => {
    const { upload } = setup(new Response(null, {
      status: 201,
      headers: location === null ? {} : { Location: location },
    }));
    assert.equal((await upload()).url, publicUrl + encodedName);
  });
}

test("keeps existing public URL query parameters and fragments", async () => {
  const { upload } = setup(new Response(null, {
    status: 201,
    headers: { Location: "/upload/file.txt?k=a%2Bb%26c" },
  }), { public_url: "https://public.example/get?file=" });
  const url = new URL((await upload()).url);
  assert.equal(url.searchParams.get("file"), name);
  assert.equal(url.searchParams.get("k"), "a+b&c");

  const withFragment = setup(new Response(null, {
    status: 201,
    headers: { Location: "/upload/file.txt?k=new-key" },
  }), { public_url: "https://public.example/get?k=old-key#" });
  const fragmentUrl = new URL((await withFragment.upload()).url);
  assert.equal(fragmentUrl.searchParams.get("k"), "new-key");
  assert.equal(fragmentUrl.hash, "#" + encodedName);
});

for (const [status, message] of [[401, "Invalid credentials"], [500, "Response was not ok"]]) {
  test(`rejects unsuccessful uploads (${status})`, async () => {
    const { upload } = setup(new Response(null, {
      status,
      headers: { Location: "/upload/file.txt?k=not-successful" },
    }));
    await assert.rejects(upload(), { message });
  });
}

test("can still abort an upload", async () => {
  const { upload, listeners } = setup((url, info) => new Promise((resolve, reject) => {
    info.signal.addEventListener("abort", () => reject(info.signal.reason));
  }));
  const pending = upload();
  // Allow the storage lookup and fetch to start before cancelling.
  await new Promise(resolve => setImmediate(resolve));
  listeners.onFileUploadAbort(account, 1);
  await assert.rejects(pending, { name: "AbortError" });
});
