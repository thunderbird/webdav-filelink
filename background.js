var uploads = new Map();

async function getConfiguration(accountId) {
  let accountInfo = await browser.storage.local.get([accountId]);
  if (!accountInfo[accountId] || !("private_url" in accountInfo[accountId])) {
    throw new Error("No URLs found.");
  }
  return accountInfo[accountId];
}

browser.cloudFile.onFileUpload.addListener(async (account, { id, name, data }) => {
  let configuration = await getConfiguration(account.id);
  let uploadInfo = {
    id,
    name,
    abortController: new AbortController(),
  };
  uploads.set(id, uploadInfo);

  let url = configuration.private_url + encodeURIComponent(name);
  
  let headers = {
    "Content-Type": "application/octet-stream",
    "User-Agent": "Filelink for WebDav v" + manifest.version,
    "Authorization": `Basic ${btoa(configuration.username + ':' + configuration.password)}`
  };
  let fetchInfo = {
    method: "PUT",
    headers,
    body: data,
    signal: uploadInfo.abortController.signal,
    credentials: "omit",
  };
  let response = await fetch(url, fetchInfo);

  if (response.status == 401) {
    throw new Error("Invalid credentials");
  }

  delete uploadInfo.abortController;
  if (response.status > 299) {
    throw new Error("Response was not ok");
  }

  if (configuration.public_url) {
    return { url: configuration.public_url + encodeURIComponent(name) };
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

  let configuration = await getConfiguration(account.id);
  let url = configuration.private_url + encodeURIComponent(uploadInfo.name);
  let headers = {
    "User-Agent": "Filelink for WebDav v" + manifest.version,
    "Authorization": `Basic ${btoa(configuration.username + ':' + configuration.password)}`
  };
  let fetchInfo = {
    headers,
    method: "DELETE",
  };
  let response = await fetch(url, fetchInfo);

  if (response.status == 401) {
    throw new Error("Invalid credentials");
  }

  uploads.delete(id);
  if (response.status > 299) {
    throw new Error("response was not ok");
  }
});


browser.cloudFile.getAllAccounts().then(async (accounts) => {
  let allAccountsInfo = await browser.storage.local.get();
  let badConfig = false;
  for (let account of accounts) {
    let configuration = allAccountsInfo[account.id];
    let status = configuration && configuration.status == 200;
    await browser.cloudFile.updateAccount(account.id, {
      configured: configuration && configuration.status == 200,
    });
    if (!status) {
      badConfig = true;
    }
  }

  if (badConfig) {
    browser.notifications.create({
      type: "basic",
      title: browser.i18n.getMessage("extensionName"),
      message: browser.i18n.getMessage("status-not-configured"),
    })
  }
});

browser.cloudFile.onAccountDeleted.addListener((accountId) => {
  browser.storage.local.remove(accountId);
});
