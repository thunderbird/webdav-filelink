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
  let madeDir = false;
  let uploadInfo = {
    id,
    name,
    foldName: "",
    abortController: new AbortController(),
  };
  uploads.set(id, uploadInfo);

  for (let attempt = 0; attempt < 3; attempt++) {
    var randomFold = Math.random().toString(36).substr(2, 8);
    let foldUrl = urls.private_url + randomFold;
    let headers = {};
    let fetchInfo = {
      method: "MKCOL",
      headers,
      signal: uploadInfo.abortController.signal,
    };
    let response = await fetch(foldUrl, fetchInfo);

    if (response.status == 401) {
      headers.Authorization = await browser.authRequest.getAuthHeader(
        foldUrl, response.headers.get("WWW-Authenticate"), "MKCOL"
      );
      response = await fetch(foldUrl, fetchInfo);
    }

    if (response.status > 299 && response.status != 405) { 
      throw new Error("response was not ok");
    }

    if (response.status == 201) { 
      madeDir = true;
      break;
    }
  }

  if (madeDir == false) {
    throw new Error("Failed to create a folder");
  }

  uploadInfo.foldName = randomFold;
  uploads.set(id, uploadInfo);

  let url = urls.private_url + randomFold + "/" + encodeURIComponent(name);
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
    return { url: urls.public_url + randomFold + "/" + encodeURIComponent(name) };
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
  let url = urls.private_url + uploadInfo.foldName + "/";
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
