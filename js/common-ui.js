const dataMenus = document.querySelectorAll(".data-menu");
let activeConfirmation = null;

document.addEventListener("click", (event) => {
  dataMenus.forEach((menu) => {
    if (!menu.contains(event.target)) {
      menu.removeAttribute("open");
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  dataMenus.forEach((menu) => {
    if (!menu.open) {
      return;
    }

    menu.removeAttribute("open");
    menu.querySelector("summary")?.focus();
  });
});

function getToastRegion() {
  let region = document.querySelector(".toast-region");

  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    document.body.append(region);
  }

  return region;
}

export function showToast(message, { type = "success", duration = 3200 } = {}) {
  const region = getToastRegion();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  region.replaceChildren(toast);

  window.setTimeout(() => {
    if (toast.isConnected) {
      toast.remove();
    }
  }, duration);
}

function createConfirmDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "confirm-dialog";

  const content = document.createElement("div");
  content.className = "confirm-dialog-content";

  const title = document.createElement("h2");
  title.id = "confirm-dialog-title";

  const message = document.createElement("p");
  message.className = "confirm-dialog-message";

  const actions = document.createElement("div");
  actions.className = "confirm-dialog-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button button-secondary";
  cancelButton.textContent = "취소";

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "button button-danger";

  actions.append(cancelButton, confirmButton);
  content.append(title, message, actions);
  dialog.append(content);
  dialog.setAttribute("aria-labelledby", title.id);
  document.body.append(dialog);

  return { dialog, title, message, cancelButton, confirmButton };
}

export function confirmAction({
  title,
  message,
  confirmLabel = "확인",
  danger = false,
}) {
  if (activeConfirmation) {
    activeConfirmation(false);
  }

  if (typeof HTMLDialogElement === "undefined") {
    return Promise.resolve(window.confirm(message));
  }

  const parts = createConfirmDialog();
  parts.title.textContent = title;
  parts.message.textContent = message;
  parts.confirmButton.textContent = confirmLabel;
  parts.confirmButton.classList.toggle("button-danger", danger);
  parts.confirmButton.classList.toggle("button-primary", !danger);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      activeConfirmation = null;
      parts.dialog.close();
      parts.dialog.remove();
      resolve(result);
    };

    activeConfirmation = finish;
    parts.cancelButton.addEventListener("click", () => finish(false));
    parts.confirmButton.addEventListener("click", () => finish(true));
    parts.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    parts.dialog.addEventListener("click", (event) => {
      if (event.target === parts.dialog) {
        finish(false);
      }
    });
    parts.dialog.showModal();
    parts.cancelButton.focus();
  });
}
