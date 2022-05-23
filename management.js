let form = document.querySelector("form");
let private_url = form.querySelector(`input[name="private_url"]`);
let public_url = form.querySelector(`input[name="public_url"]`);
let button = form.querySelector("button");
let accountId = new URL(location.href).searchParams.get("accountId");

(() => {
  for (let element of document.querySelectorAll("[data-message]")) {
    element.textContent = browser.i18n.getMessage(element.dataset.message);
  }
})();

browser.storage.local.get([accountId]).then(accountInfo => {
  if (accountId in accountInfo) {
    if ("private_url" in accountInfo[accountId]) {
      private_url.value = accountInfo[accountId].private_url;
    }
    if ("public_url" in accountInfo[accountId]) {
      public_url.value = accountInfo[accountId].public_url;
    }
  }
});

button.onclick = async () => {
  if (!form.checkValidity()) {
    return;
  }

  private_url.disabled = public_url.disabled = button.disabled = true;

  let private_url_value = private_url.value;
  if (!private_url_value.endsWith("/")) {
    private_url_value += "/";
    private_url.value = private_url_value;
  }

  let public_url_value = public_url.value || private_url_value;
  if (!public_url_value.endsWith("/")) {
    public_url_value += "/";
  }
  public_url.value = public_url_value;

  let start = Date.now();
  await browser.storage.local.set({
    [accountId]: {
      private_url: private_url_value,
      public_url: public_url_value,
    },
  });
  await browser.cloudFile.updateAccount(accountId, { configured: true });
  setTimeout(() => {
    private_url.disabled = public_url.disabled = button.disabled = false;
  }, Math.max(0, start + 500 - Date.now()));
};
