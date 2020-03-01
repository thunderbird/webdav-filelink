var uploads = new Map();

async function getURLs(accountId) {
  let accountInfo = await browser.storage.local.get([accountId]);
  if (!accountInfo[accountId] || !("private_url" in accountInfo[accountId])) {
    throw new Error("No URLs found.");
  }
  return accountInfo[accountId];
}

browser.cloudFile.onFileUpload.addListener(async (account, { id, name, data }) => {
  let urls = await getURLs(account.id);
  let uploadInfo = {
    id,
    name,
    abortController: new AbortController(),
  };
  uploads.set(id, uploadInfo);

  let url = urls.private_url + encodeURIComponent(name);
  let headers = {
    "Content-Type": "application/octet-stream",
  };
  let fetchInfo = {
    method: "PUT",
    headers,
    body: data,
    signal: uploadInfo.abortController.signal,
  };
  let response = await fetch(url, fetchInfo);

  if (response.status == 401) {
    headers.Authorization = await browser.authRequest.getAuthHeader(
      url, response.headers.get("WWW-Authenticate"), "PUT"
    );
    response = await fetch(url, fetchInfo);
  }

  delete uploadInfo.abortController;
  if (response.status > 299) {
    throw new Error("response was not ok");
  }

  if (urls.public_url) {
    return { url: urls.public_url + encodeURIComponent(name) };
  }
  return { url };
});

browser.cloudFile.onFileUploadAbort.addListener((account, id) => {
  let uploadInfo = uploads.get(id);
  if (uploadInfo && uploadInfo.abortController) {
    uploadInfo.abortController.abort();
  }
});

browser.cloudFile.onFileDeleted.addListener(async (account, id) => {
  let uploadInfo = uploads.get(id);
  if (!uploadInfo) {
    return;
  }

  let urls = await getURLs(account.id);
  let url = urls.private_url + encodeURIComponent(uploadInfo.name);
  let headers = {};
  let fetchInfo = {
    headers,
    method: "DELETE",
  };
  let response = await fetch(url, fetchInfo);

  if (response.status == 401) {
    headers.Authorization = await browser.authRequest.getAuthHeader(
      url, response.headers.get("WWW-Authenticate"), "DELETE"
    );
    response = await fetch(url, fetchInfo);
  }

  uploads.delete(id);
  if (response.status > 299) {
    throw new Error("response was not ok");
  }
});

browser.cloudFile.getAllAccounts().then(async (accounts) => {
  let allAccountsInfo = await browser.storage.local.get();
  for (let account of accounts) {
    await browser.cloudFile.updateAccount(account.id, {
      configured: account.id in allAccountsInfo,
    });
  }
});

browser.cloudFile.onAccountDeleted.addListener((accountId) => {
  browser.storage.local.remove(accountId);
});
