/* exported getRequestOptions */

function getRequestOptions(configuration) {
  let headers = {
    "User-Agent": "Filelink for WebDav v" + browser.runtime.getManifest().version,
    "Authorization": `Basic ${btoa(configuration.username + ':' + configuration.password)}`
  };
  let copyparty = configuration.authentication == "copyparty" ||
    configuration.authentication == "copyparty-usernames";
  if (copyparty) {
    // copyparty requires explicit password authentication for cross-origin writes.
    headers.PW = configuration.authentication == "copyparty-usernames" ?
      configuration.username + ":" + configuration.password : configuration.password;
  }
  // Custom password headers must never be forwarded to a redirect destination.
  return { headers, redirect: copyparty ? "error" : "follow" };
}
