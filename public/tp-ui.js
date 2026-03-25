(function () {
  let toastStack = null;
  let activeModal = null;

  function ensureToastStack() {
    if (toastStack && document.body.contains(toastStack)) {
      return toastStack;
    }

    toastStack = document.createElement("div");
    toastStack.className = "tp-toast-stack";
    document.body.appendChild(toastStack);
    return toastStack;
  }

  function getToastMeta(type) {
    switch (type) {
      case "success":
        return { icon: "✓", title: "Успешно" };
      case "error":
        return { icon: "!", title: "Ошибка" };
      case "warning":
        return { icon: "!", title: "Внимание" };
      default:
        return { icon: "i", title: "Сообщение" };
    }
  }

  function tpToast(message, type = "info", options = {}) {
    const safeMessage = String(message || "").trim();
    if (!safeMessage) return null;

    const duration = Number(options.duration ?? 3200);
    const title = String(options.title || "").trim();
    const meta = getToastMeta(type);

    const stack = ensureToastStack();

    const toast = document.createElement("div");
    toast.className = `tp-toast tp-toast--${type}`;

    toast.innerHTML = `
      <div class="tp-toast__icon" aria-hidden="true">${meta.icon}</div>
      <div class="tp-toast__content">
        <div class="tp-toast__title">${escapeHtml(title || meta.title)}</div>
        <div class="tp-toast__text">${escapeHtml(safeMessage)}</div>
      </div>
      <button class="tp-toast__close" type="button" aria-label="Закрыть">×</button>
    `;

    const closeBtn = toast.querySelector(".tp-toast__close");
    let removed = false;
    let timerId = null;

    function removeToast() {
      if (removed) return;
      removed = true;
      if (timerId) clearTimeout(timerId);
      toast.remove();

      if (stack.children.length === 0) {
        stack.remove();
        if (toastStack === stack) {
          toastStack = null;
        }
      }
    }

    closeBtn.addEventListener("click", removeToast);

    if (duration > 0) {
      timerId = setTimeout(removeToast, duration);
    }

    stack.appendChild(toast);
    return { close: removeToast };
  }

  function getModalMeta(type) {
    switch (type) {
      case "success":
        return {
          badgeClass: "tp-modal__badge--success",
          icon: "✓",
          defaultTitle: "Успешно"
        };
      case "error":
        return {
          badgeClass: "tp-modal__badge--error",
          icon: "!",
          defaultTitle: "Ошибка"
        };
      case "warning":
        return {
          badgeClass: "tp-modal__badge--warning",
          icon: "!",
          defaultTitle: "Внимание"
        };
      default:
        return {
          badgeClass: "tp-modal__badge--info",
          icon: "i",
          defaultTitle: "Сообщение"
        };
    }
  }

  function getFocusableElements(container) {
    return Array.from(
      container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function closeExistingModal() {
    if (activeModal && typeof activeModal.close === "function") {
      activeModal.close(false);
    }
  }

  function tpModal(options = {}) {
    closeExistingModal();

    const type = String(options.type || "info");
    const text = String(options.text || options.message || "").trim();
    const title = String(options.title || "").trim();
    const subtitle = String(options.subtitle || "").trim();
    const confirmText = String(options.confirmText || "Ок").trim();
    const cancelText = String(options.cancelText || "Отмена").trim();
    const showCancel = Boolean(options.showCancel);
    const closeOnBackdrop = options.closeOnBackdrop !== false;
    const closeOnEscape = options.closeOnEscape !== false;
    const dangerConfirm = Boolean(options.dangerConfirm);

    const meta = getModalMeta(type);

    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "tp-modal-backdrop";

      const modal = document.createElement("div");
      modal.className = "tp-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");

      modal.innerHTML = `
        <div class="tp-modal__head">
          <div class="tp-modal__badge ${meta.badgeClass}" aria-hidden="true">${meta.icon}</div>
          <div class="tp-modal__titles">
            <h3 class="tp-modal__title">${escapeHtml(title || meta.defaultTitle)}</h3>
            ${subtitle ? `<div class="tp-modal__subtitle">${escapeHtml(subtitle)}</div>` : ""}
          </div>
          <button class="tp-modal__close" type="button" aria-label="Закрыть">×</button>
        </div>
        <div class="tp-modal__body">
          <p class="tp-modal__text">${escapeHtml(text)}</p>
        </div>
        <div class="tp-modal__actions">
          ${
            showCancel
              ? `<button class="tp-btn tp-btn--secondary" type="button" data-tp-action="cancel">${escapeHtml(cancelText)}</button>`
              : ""
          }
          <button
            class="tp-btn ${dangerConfirm ? "tp-btn--danger" : "tp-btn--primary"}"
            type="button"
            data-tp-action="confirm"
          >
            ${escapeHtml(confirmText)}
          </button>
        </div>
      `;

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      document.body.classList.add("tp-ui-lock");

      const closeBtn = modal.querySelector(".tp-modal__close");
      const confirmBtn = modal.querySelector('[data-tp-action="confirm"]');
      const cancelBtn = modal.querySelector('[data-tp-action="cancel"]');
      const previousActiveElement = document.activeElement;

      let settled = false;

      function cleanup(result) {
        if (settled) return;
        settled = true;

        document.removeEventListener("keydown", onKeyDown);
        backdrop.removeEventListener("click", onBackdropClick);

        backdrop.remove();
        document.body.classList.remove("tp-ui-lock");

        if (previousActiveElement && typeof previousActiveElement.focus === "function") {
          try {
            previousActiveElement.focus();
          } catch (_) {}
        }

        if (activeModal && activeModal.backdrop === backdrop) {
          activeModal = null;
        }

        resolve(result);
      }

      function onKeyDown(e) {
        if (e.key === "Escape" && closeOnEscape) {
          e.preventDefault();
          cleanup(false);
          return;
        }

        if (e.key === "Tab") {
          const focusable = getFocusableElements(modal);
          if (!focusable.length) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      function onBackdropClick(e) {
        if (e.target === backdrop && closeOnBackdrop) {
          cleanup(false);
        }
      }

      closeBtn.addEventListener("click", () => cleanup(false));
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => cleanup(false));
      }
      confirmBtn.addEventListener("click", () => cleanup(true));

      backdrop.addEventListener("click", onBackdropClick);
      document.addEventListener("keydown", onKeyDown);

      activeModal = {
        backdrop,
        close: cleanup
      };

      setTimeout(() => {
        confirmBtn.focus();
      }, 0);
    });
  }

  function tpAlert(message, options = {}) {
    return tpModal({
      type: options.type || "info",
      title: options.title || "",
      subtitle: options.subtitle || "",
      text: message,
      confirmText: options.confirmText || "Ок",
      showCancel: false
    });
  }

  function tpConfirm(message, options = {}) {
    return tpModal({
      type: options.type || "warning",
      title: options.title || "",
      subtitle: options.subtitle || "",
      text: message,
      confirmText: options.confirmText || "Подтвердить",
      cancelText: options.cancelText || "Отмена",
      showCancel: true,
      dangerConfirm: Boolean(options.dangerConfirm)
    });
  }

  window.tpToast = tpToast;
  window.tpModal = tpModal;
  window.tpAlert = tpAlert;
  window.tpConfirm = tpConfirm;
})();