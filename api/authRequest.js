Cu.importGlobalProperties(["btoa"]);

var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { ExtensionUtils } = ChromeUtils.import("resource://gre/modules/ExtensionUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { LoginManagerPrompter } = ChromeUtils.import("resource://gre/modules/LoginManagerPrompter.jsm");

var bundle = Services.strings.createBundle("chrome://global/locale/commonDialogs.properties");

var authRequest = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      authRequest: {
        async getAuthHeader(url, authenticateHeader, requestMethod) {
          function getHash(aStr) {
            let toHexString = charCode => ("0" + charCode.toString(16)).slice(-2);

            let hasher = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
            hasher.init(Ci.nsICryptoHash.MD5);
            let stringStream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
            stringStream.data = aStr;
            hasher.updateFromStream(stringStream, -1);

            let binary = hasher.finish(false);
            return Array.from(binary, (c, i) => toHexString(binary.charCodeAt(i))).join("").toLowerCase();
          }

          function createHeader(username, password) {
            if (authenticateHeader.startsWith("Basic")) {
              return "Basic " + btoa(username + ":" + password);
            }

            let digestParts = authenticateHeader.split(",");
            let scheme = digestParts[0].split(/\s/)[0];
            let realm = null;
            let nonce = null;
            let qop = null;
            for (let part of digestParts) {
              let equalIndex = part.indexOf("=");
              let key = part.substring(0, equalIndex);
              let val = part.substring(equalIndex + 1).replace(/['"]+/g, "");
              if (key.match(/realm/i) != null) {
                realm = val;
              }
              if (key.match(/nonce/i) != null) {
                nonce = val;
              }
              if (key.match(/qop/i) != null) {
                qop = val;
              }
            }

            let cnonce = "";
            for (let i = 0; i < 16; i++) {
              cnonce += "abcdef0123456789"[Math.floor(Math.random() * 16)];
            }

            let HA1 = getHash(`${username}:${realm}:${password}`);
            let HA2 = getHash(`${requestMethod}:${filePath}`);
            let response = getHash(HA1 + ":" + nonce + ":00000001:" + cnonce + ":" + qop + ":" + HA2);

            return [
              `${scheme} username="${username}"`,
              `realm="${realm}"`,
              `nonce="${nonce}"`,
              `uri="${filePath}"`,
              "algorithm=MD5",
              `response="${response}"`,
              `qop=${qop}`,
              `nc=00000001`,
              `cnonce="${cnonce}"`,
            ].join(", ");
          }

          let { displayHostPort, prePath, filePath } = Services.io.newURI(url);
          let logins = Services.logins.findLogins(prePath, null, prePath);
          for (let login of logins) {
            return createHeader(login.username, login.password);
          }

          let title = bundle.GetStringFromName("PromptUsernameAndPassword2");
          let text = bundle.formatStringFromName("EnterUserPasswordFor2", [displayHostPort], 1);
          let usernameInput = {};
          let passwordInput = {};
          let prompter = new LoginManagerPrompter();
          prompter.init(Services.ww.activeWindow);
          if (!prompter.promptUsernameAndPassword(
            title, text, prePath, Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY, usernameInput, passwordInput
          )) {
            throw new ExtensionUtils.ExtensionError("Authorization prompt cancelled");
          }

          return createHeader(usernameInput.value, passwordInput.value);
        },
      },
    };
  }
};
