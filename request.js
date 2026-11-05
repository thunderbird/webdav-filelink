/* exported getRequestOptions, checkConnection */

function getRequestOptions(configuration) {
  let headers = {
    "User-Agent": "Filelink for WebDav v" + browser.runtime.getManifest().version,
    "Authorization": `Basic ${btoa(configuration.username + ':' + configuration.password)}`
  };
  let copyparty = configuration.authentication == "copyparty" ||
    configuration.authentication == "copyparty-usernames";
  if (copyparty) {
    // copyparty requires explicit password authentication for cross-origin writes.
    headers.PW = configuration.copyparty_usernames || configuration.authentication == "copyparty-usernames" ?
      configuration.username + ":" + configuration.password : configuration.password;
  }
  // Custom password headers must never be forwarded to a redirect destination.
  return { headers, redirect: copyparty ? "error" : "follow" };
}

async function checkConnection(configuration) {
  if (configuration.authentication != "copyparty") {
    return fetch(configuration.private_url, {
      ...getRequestOptions(configuration),
      method: "OPTIONS",
    });
  }

  let url = new URL(configuration.private_url);
  url.searchParams.set("ls", "");
  let preferredMode = configuration.copyparty_usernames === true;
  for (let usernames of [preferredMode, !preferredMode]) {
    let response = await fetch(url.href, {
      ...getRequestOptions({ ...configuration, copyparty_usernames: usernames }),
      method: "GET",
      credentials: "omit",
    });
    if ([401, 403, 404].includes(response.status)) {
      continue;
    }
    if (!response.ok) {
      return response;
    }
    let listing = await response.json();
    // Public listings can return 200 even when authentication failed.
    if (typeof listing.acct != "string" || !listing.acct || listing.acct == "*") {
      continue;
    }
    if (!Array.isArray(listing.perms) || !listing.perms.includes("write")) {
      return { ok: false, status: 403 };
    }
    return { ok: true, status: 200, copyparty_usernames: usernames };
  }
  return { ok: false, status: 401 };
}
