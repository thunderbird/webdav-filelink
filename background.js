var uploads = new Map();

function generateSecureId(length = 12) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values).map(v => charset[v % charset.length]).join('');
}

async function getConfiguration(accountId) {
  let accountInfo = await browser.storage.local.get([accountId]);
  if (!accountInfo[accountId] || !("private_url" in accountInfo[accountId])) {
    throw new Error("No URLs found.");
  }
  return accountInfo[accountId];
}

browser.cloudFile.onFileUpload.addListener(async (account, { id, name, data }) => {
  let configuration = await getConfiguration(account.id);

  // 1. Generate a unique folder name for this upload
  let randomFold = generateSecureId(16);
  let foldUrl = configuration.private_url + randomFold + "/";

  let uploadInfo = {
    id,
    name,
    foldName: randomFold,
    abortController: new AbortController(),
  };
  uploads.set(id, uploadInfo);

  let authHeader = `Basic ${btoa(configuration.username + ':' + configuration.password)}`;
  let userAgent = "Filelink for WebDav v" + browser.runtime.getManifest().version;

  // 2. Create the random subfolder (MKCOL)
  let mkcolResponse = await fetch(foldUrl, {
    method: "MKCOL",
    headers: {
      "Authorization": authHeader,
      "User-Agent": userAgent
    },
    signal: uploadInfo.abortController.signal
  });

  // 405 means folder already exists (rare with 16 chars, but safe to ignore)
  if (mkcolResponse.status > 299 && mkcolResponse.status !== 405) {
    throw new Error("Failed to create secure subfolder: " + mkcolResponse.status);
  }

  // 3. Upload the file into that folder (PUT)
  let fileUrl = foldUrl + encodeURIComponent(name);
  let fetchInfo = {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "User-Agent": userAgent,
      "Authorization": authHeader
    },
    body: data,
    signal: uploadInfo.abortController.signal,
    credentials: "omit",
  };

  let response = await fetch(fileUrl, fetchInfo);

  if (response.status === 401) {
    throw new Error("Invalid credentials");
  }

  delete uploadInfo.abortController;
  if (response.status > 299) {
    throw new Error("Response was not ok");
  }

  // 4. Return the public or private URL including the random folder
  if (configuration.public_url) {
    return { url: configuration.public_url + randomFold + "/" + encodeURIComponent(name) };
  }
  return { url: fileUrl };
});

browser.cloudFile.onFileUploadAbort.addListener((account, id) => {
  let uploadInfo = uploads.get(id);
  if (uploadInfo && uploadInfo.abortController) {
    uploadInfo.abortController.abort();
  }
});

browser.cloudFile.onFileDeleted.addListener(async (account, id) => {
  let uploadInfo = uploads.get(id);
  if (!uploadInfo || !uploadInfo.foldName) {
    return;
  }

  let configuration = await getConfiguration(account.id);
  // Point the DELETE request to the FOLDER, not the file
  let url = configuration.private_url + uploadInfo.foldName + "/";

  let headers = {
    "User-Agent": "Filelink for WebDav v" + browser.runtime.getManifest().version,
    "Authorization": `Basic ${btoa(configuration.username + ':' + configuration.password)}`
  };

  let response = await fetch(url, {
    headers,
    method: "DELETE",
  });

  if (response.status === 401) {
    throw new Error("Invalid credentials");
  }

  uploads.delete(id);
  if (response.status > 299) {
    throw new Error("Response was not ok");
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
