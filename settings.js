// settings.js — bánh răng cài đặt: ngôn ngữ + tuỳ chỉnh puzzle. Lưu trong localStorage.
import { t, getLang, setLang } from "./i18n.js?v=3";

const KEY = "nyraSettings";
const DEFAULTS = { autoNext: true, autoQueen: false, showRating: true, showThemes: false, nyraMs: 1500 };
let cfg = { ...DEFAULTS };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* bỏ qua */ }
const subs = new Set();

export const getSettings = () => cfg;
export const onSettingsChange = (fn) => subs.add(fn);
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* bỏ qua */ }
  subs.forEach((f) => f(cfg));
}

const NYRA_MS = [500, 1000, 1500, 2000, 3000, 5000];

export function initSettings({ onResetPuzzle } = {}) {
  const $ = (id) => document.getElementById(id);
  const btn = $("settingsBtn");
  let modal = $("settingsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "settingsModal";
    modal.setAttribute("aria-hidden", "true");
    document.body.appendChild(modal);
  }
  const check = (id, label, on) =>
    `<label class="st-row st-check"><input id="${id}" type="checkbox" ${on ? "checked" : ""}><span>${label}</span></label>`;

  function render() {
    const L = getLang();
    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="stTitle">
        <button class="modal-close" id="stClose" type="button" aria-label="${t("settings.close")}">✕</button>
        <h3 id="stTitle">⚙ ${t("settings.title")}</h3>
        <div class="st-group">
          <div class="st-label">${t("settings.language")}</div>
          <div class="pz-seg st-lang">
            <button type="button" data-lang="vi" class="${L === "vi" ? "active" : ""}">Tiếng Việt</button>
            <button type="button" data-lang="en" class="${L === "en" ? "active" : ""}">English</button>
          </div>
        </div>
        <div class="st-group">
          <div class="st-label">${t("settings.puzzle")}</div>
          ${check("stAutoNext", t("settings.autoNext"), cfg.autoNext)}
          ${check("stAutoQueen", t("settings.autoQueen"), cfg.autoQueen)}
          ${check("stShowRating", t("settings.showRating"), cfg.showRating)}
          ${check("stShowThemes", t("settings.showThemes"), cfg.showThemes)}
          <label class="st-row st-select">${t("settings.nyraMs")}
            <select id="stNyraMs">${NYRA_MS.map((m) => `<option value="${m}" ${m === cfg.nyraMs ? "selected" : ""}>${m / 1000} s</option>`).join("")}</select>
          </label>
          <button id="stReset" class="btn btn-outline full-width" type="button">${t("settings.resetPuzzle")}</button>
          <p class="small-note" id="stMsg"></p>
        </div>
      </div>`;
    const close = () => { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); };
    $("stClose").onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
    modal.querySelectorAll("[data-lang]").forEach((b) => { b.onclick = () => setLang(b.dataset.lang); });
    const bind = (id, key) => { $(id).onchange = (e) => { cfg[key] = e.target.checked; save(); }; };
    bind("stAutoNext", "autoNext"); bind("stAutoQueen", "autoQueen");
    bind("stShowRating", "showRating"); bind("stShowThemes", "showThemes");
    $("stNyraMs").onchange = (e) => { cfg.nyraMs = Number(e.target.value); save(); };
    $("stReset").onclick = () => {
      if (!confirm(t("settings.confirmReset"))) return;
      if (onResetPuzzle) onResetPuzzle();
      $("stMsg").textContent = t("settings.resetDone");
    };
  }
  render();
  window.addEventListener("nyra-langchange", render);
  const open = () => { render(); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); };
  if (btn) btn.addEventListener("click", open);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); } });
}
