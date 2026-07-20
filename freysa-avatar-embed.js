(function installFreysaAvatarElement() {
  if (customElements.get("freysa-avatar")) return;

  const scriptUrl = document.currentScript?.src || window.location.href;
  const defaultRuntimeUrl = new URL("./?embed=avatar", scriptUrl).href;

  class FreysaAvatarElement extends HTMLElement {
    constructor() {
      super();
      this.pending = new Map();
      this.handleMessage = this.handleMessage.bind(this);
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{display:block;min-width:280px;min-height:360px;overflow:hidden;background:#070908}iframe{display:block;width:100%;height:100%;border:0}";
      this.frame = document.createElement("iframe");
      this.frame.title = this.getAttribute("title") || "Freysa avatar";
      this.frame.allow = "autoplay";
      this.frameLoaded = new Promise((resolve) => this.frame.addEventListener("load", resolve, { once: true }));
      shadow.append(style, this.frame);
    }

    connectedCallback() {
      this.frame.src = this.getAttribute("src") || defaultRuntimeUrl;
      window.addEventListener("message", this.handleMessage);
    }

    disconnectedCallback() {
      window.removeEventListener("message", this.handleMessage);
      for (const pending of this.pending.values()) pending.reject(new Error("Freysa avatar was disconnected."));
      this.pending.clear();
    }

    perform(options) {
      return this.send("perform", options);
    }

    chat(options) {
      return this.send("chat", options);
    }

    stop() {
      return this.send("stop");
    }

    resetPosition() {
      return this.send("resetPosition");
    }

    getState() {
      return this.send("getState");
    }

    async send(action, payload = {}) {
      await this.frameLoaded;
      if (!this.frame.contentWindow) return Promise.reject(new Error("Freysa avatar is not ready."));
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const runtimeOrigin = new URL(this.frame.src).origin;
      const promise = new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`Freysa avatar ${action} timed out.`));
        }, 30000);
        this.pending.set(id, { resolve, reject, timeout });
      });
      this.frame.contentWindow.postMessage({ source: "freysa-avatar-host", id, action, payload }, runtimeOrigin);
      return promise;
    }

    handleMessage(event) {
      if (event.source !== this.frame.contentWindow || event.origin !== new URL(this.frame.src).origin) return;
      const message = event.data;
      if (!message || message.source !== "freysa-avatar-runtime") return;

      if (message.type === "event") {
        this.dispatchEvent(new CustomEvent(message.event, { detail: message.detail }));
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) return;
      window.clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.type === "error") pending.reject(new Error(message.error));
      else pending.resolve(message.result);
    }
  }

  customElements.define("freysa-avatar", FreysaAvatarElement);
})();
