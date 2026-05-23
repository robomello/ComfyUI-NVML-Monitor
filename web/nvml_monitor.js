import { app } from "../../scripts/app.js";

const POLL_MS = 1500;
const LS_POS = "nvml_monitor.pos";
const LS_OPEN = "nvml_monitor.popup_open";

const fmtG = (n) => (n == null ? "—" : `${n.toFixed(1)}G`);
const fmtPct = (n) => (n == null ? "—" : `${Math.round(n)}%`);
const fmtNum = (n, suffix = "") => (n == null ? "—" : `${n}${suffix}`);
const fmtPwr = (w) => (w == null ? "—" : `${Math.round(w)}W`);

function loadPos() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_POS) || "null");
    if (v && typeof v.x === "number" && typeof v.y === "number") return v;
  } catch {}
  return { x: window.innerWidth - 480, y: 8 };
}

function savePos(p) {
  try { localStorage.setItem(LS_POS, JSON.stringify(p)); } catch {}
}

function loadOpen() {
  return localStorage.getItem(LS_OPEN) === "1";
}

function saveOpen(v) {
  try { localStorage.setItem(LS_OPEN, v ? "1" : "0"); } catch {}
}

function loadColor(value, thresholds = [60, 85]) {
  if (value == null) return "#888";
  if (value < thresholds[0]) return "#4ade80";
  if (value < thresholds[1]) return "#facc15";
  return "#f87171";
}

function tempColor(c) {
  return loadColor(c, [65, 82]);
}

function bar(percent, color, w = 100) {
  const p = Math.min(100, Math.max(0, percent || 0));
  return `
    <div style="background:#1f2937;border-radius:3px;height:6px;width:${w}px;overflow:hidden;display:inline-block;vertical-align:middle">
      <div style="background:${color};height:100%;width:${p}%;transition:width 0.3s"></div>
    </div>`;
}

function makeStyle() {
  const css = `
    .nvml-chip {
      position: fixed; z-index: 10000;
      display: flex; align-items: center; gap: 8px;
      padding: 4px 10px; border-radius: 14px;
      background: rgba(17, 24, 39, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid #374151;
      color: #e5e7eb;
      font: 12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      cursor: grab; user-select: none;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
    }
    .nvml-chip:hover { border-color: #4b5563; }
    .nvml-chip.dragging { cursor: grabbing; opacity: 0.85; }
    .nvml-chip-label { color: #9ca3af; font-weight: 600; letter-spacing: 0.05em; }
    .nvml-chip-badge {
      background: #065f46; color: #d1fae5; padding: 1px 6px;
      border-radius: 8px; font-size: 10px; font-weight: 600;
    }
    .nvml-chip-badge.err { background: #7f1d1d; color: #fecaca; }
    .nvml-chip-stat { display: flex; align-items: center; gap: 4px; }
    .nvml-chip-icon { color: #6b7280; font-size: 11px; }
    .nvml-popup {
      position: fixed; z-index: 10001;
      background: rgba(17, 24, 39, 0.97);
      backdrop-filter: blur(10px);
      border: 1px solid #374151; border-radius: 8px;
      color: #e5e7eb;
      font: 12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      min-width: 380px; max-width: 520px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .nvml-popup-head {
      display: flex; align-items: center; gap: 0;
      border-bottom: 1px solid #374151;
    }
    .nvml-tab {
      flex: 1; padding: 8px 12px; cursor: pointer;
      border: none; background: transparent; color: #9ca3af;
      font: inherit; border-bottom: 2px solid transparent;
    }
    .nvml-tab:hover { color: #e5e7eb; }
    .nvml-tab.active { color: #e5e7eb; border-bottom-color: #3b82f6; }
    .nvml-close {
      background: transparent; border: none; color: #9ca3af;
      cursor: pointer; padding: 8px 12px; font-size: 14px;
    }
    .nvml-close:hover { color: #f87171; }
    .nvml-body { padding: 12px 14px; max-height: 70vh; overflow-y: auto; }
    .nvml-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 0; gap: 12px;
    }
    .nvml-row-label { color: #9ca3af; flex-shrink: 0; }
    .nvml-row-val { color: #e5e7eb; text-align: right; }
    .nvml-section-title {
      color: #6b7280; font-size: 10px; letter-spacing: 0.1em;
      text-transform: uppercase; margin: 10px 0 6px; padding-bottom: 4px;
      border-bottom: 1px solid #1f2937;
    }
    .nvml-section-title:first-child { margin-top: 0; }
    .nvml-procs {
      width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px;
    }
    .nvml-procs th, .nvml-procs td {
      text-align: left; padding: 3px 6px; border-bottom: 1px solid #1f2937;
    }
    .nvml-procs th { color: #6b7280; font-weight: normal; font-size: 10px; }
    .nvml-procs td.r { text-align: right; }
    .nvml-cores { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; margin-top: 4px; }
    .nvml-core { height: 4px; background: #1f2937; border-radius: 1px; overflow: hidden; }
    .nvml-core > div { height: 100%; transition: width 0.3s; }
  `;
  const tag = document.createElement("style");
  tag.id = "nvml-monitor-style";
  tag.textContent = css;
  document.head.appendChild(tag);
}

function makeChip() {
  const el = document.createElement("div");
  el.className = "nvml-chip";
  el.title = "Click to expand • Drag to move";
  const pos = loadPos();
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  document.body.appendChild(el);

  let dragging = false;
  let startX = 0, startY = 0, baseX = 0, baseY = 0, moved = false;
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true; moved = false;
    startX = e.clientX; startY = e.clientY;
    baseX = el.offsetLeft; baseY = el.offsetTop;
    el.classList.add("dragging");
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    el.style.left = `${baseX + dx}px`;
    el.style.top = `${baseY + dy}px`;
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    if (moved) savePos({ x: el.offsetLeft, y: el.offsetTop });
  });
  el.addEventListener("click", (e) => {
    if (moved) { e.stopPropagation(); return; }
    togglePopup();
  });
  return el;
}

function renderChip(el, data) {
  if (!data) {
    el.innerHTML = `<span class="nvml-chip-label">NVML</span><span class="nvml-chip-badge err">offline</span>`;
    return;
  }
  const provider = data.provider || "unavailable";
  const badgeClass = provider === "NVIDIA" ? "" : "err";
  const cpu = data.cpu?.percent;
  const ram = data.ram;
  const gpu = data.gpus?.[0];
  const vram = gpu?.vram;
  const gpuUtil = gpu?.util?.gpu;

  const cpuColor = loadColor(cpu);
  const ramColor = loadColor(ram?.percent);
  const vramColor = loadColor(vram?.percent);

  el.innerHTML = `
    <span class="nvml-chip-label">NVML</span>
    <span class="nvml-chip-badge ${badgeClass}">${provider}</span>
    <span class="nvml-chip-stat"><span class="nvml-chip-icon">CPU</span><span style="color:${cpuColor}">${fmtPct(cpu)}</span></span>
    <span class="nvml-chip-stat"><span class="nvml-chip-icon">RAM</span><span style="color:${ramColor}">${fmtG(ram?.used_gb)}/${fmtG(ram?.total_gb)}</span></span>
    <span class="nvml-chip-stat"><span class="nvml-chip-icon">VRAM</span><span style="color:${vramColor}">${fmtG(vram?.used_gb)}/${fmtG(vram?.total_gb)}</span></span>
    ${gpuUtil != null ? `<span class="nvml-chip-stat"><span class="nvml-chip-icon">GPU</span><span style="color:${loadColor(gpuUtil)}">${fmtPct(gpuUtil)}</span></span>` : ""}
  `;
  el.title = data.nvml_error
    ? `NVML error: ${data.nvml_error}`
    : `Driver ${data.driver || "?"} • Click to expand • Drag to move`;
}

let popupEl = null;
let currentTab = "gpu";

function buildPopup() {
  const el = document.createElement("div");
  el.className = "nvml-popup";
  el.innerHTML = `
    <div class="nvml-popup-head">
      <button class="nvml-tab" data-tab="gpu">GPU</button>
      <button class="nvml-tab" data-tab="system">System</button>
      <button class="nvml-close" title="Close">×</button>
    </div>
    <div class="nvml-body"></div>
  `;
  document.body.appendChild(el);
  el.querySelectorAll(".nvml-tab").forEach((b) => {
    b.addEventListener("click", () => {
      currentTab = b.dataset.tab;
      renderPopup(latestData);
    });
  });
  el.querySelector(".nvml-close").addEventListener("click", closePopup);
  return el;
}

function positionPopup() {
  if (!popupEl) return;
  const chipRect = chipEl.getBoundingClientRect();
  const top = Math.min(chipRect.bottom + 6, window.innerHeight - 100);
  const right = Math.min(window.innerWidth - chipRect.right, window.innerWidth - 100);
  popupEl.style.top = `${top}px`;
  popupEl.style.right = `${right}px`;
}

function togglePopup() {
  if (popupEl) closePopup();
  else openPopup();
}

function openPopup() {
  if (popupEl) return;
  popupEl = buildPopup();
  saveOpen(true);
  renderPopup(latestData);
  positionPopup();
}

function closePopup() {
  if (!popupEl) return;
  popupEl.remove();
  popupEl = null;
  saveOpen(false);
}

function renderPopup(data) {
  if (!popupEl) return;
  popupEl.querySelectorAll(".nvml-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === currentTab);
  });
  const body = popupEl.querySelector(".nvml-body");
  if (!data) {
    body.innerHTML = `<div style="color:#9ca3af;text-align:center;padding:20px">Waiting for telemetry…</div>`;
    return;
  }
  body.innerHTML = currentTab === "gpu" ? renderGpuTab(data) : renderSystemTab(data);
}

function renderGpuTab(data) {
  if (data.nvml_error) {
    return `<div style="color:#f87171;padding:8px">NVML unavailable: ${data.nvml_error}</div>`;
  }
  if (!data.gpus?.length) {
    return `<div style="color:#9ca3af;padding:8px">No GPUs detected.</div>`;
  }
  return data.gpus.map((g) => {
    const pwrPct = g.power?.draw_w != null && g.power?.limit_w
      ? (g.power.draw_w / g.power.limit_w) * 100 : null;
    const procs = (g.processes || []).map((p) => `
      <tr>
        <td>${p.pid}</td>
        <td>${p.name}</td>
        <td class="r">${p.mem_mb.toFixed(0)} MB</td>
      </tr>`).join("");
    const extMb = g.external_mb || 0;
    const extRow = extMb > 100 ? `
      <tr style="color:#9ca3af;font-style:italic">
        <td>—</td>
        <td>External (other containers / host)</td>
        <td class="r">${extMb >= 1024 ? (extMb / 1024).toFixed(1) + " GB" : extMb.toFixed(0) + " MB"}</td>
      </tr>` : "";
    return `
      <div class="nvml-section-title">${g.name} (GPU ${g.index})</div>
      <div class="nvml-row"><span class="nvml-row-label">GPU util</span>
        <span class="nvml-row-val">${bar(g.util.gpu, loadColor(g.util.gpu))} ${fmtPct(g.util.gpu)}</span></div>
      <div class="nvml-row"><span class="nvml-row-label">VRAM</span>
        <span class="nvml-row-val">${bar(g.vram.percent, loadColor(g.vram.percent))} ${fmtG(g.vram.used_gb)}/${fmtG(g.vram.total_gb)} (${fmtPct(g.vram.percent)})</span></div>
      <div class="nvml-row"><span class="nvml-row-label">Mem ctrl util</span>
        <span class="nvml-row-val">${fmtPct(g.util.memory)}</span></div>
      <div class="nvml-row"><span class="nvml-row-label">Temperature</span>
        <span class="nvml-row-val" style="color:${tempColor(g.temp_c)}">${fmtNum(g.temp_c, "°C")}</span></div>
      <div class="nvml-row"><span class="nvml-row-label">Power</span>
        <span class="nvml-row-val">${pwrPct != null ? bar(pwrPct, loadColor(pwrPct, [70, 90])) : ""} ${fmtPwr(g.power?.draw_w)} / ${fmtPwr(g.power?.limit_w)}</span></div>
      <div class="nvml-row"><span class="nvml-row-label">Clocks</span>
        <span class="nvml-row-val">${fmtNum(g.clocks?.graphics_mhz, " MHz")} core / ${fmtNum(g.clocks?.memory_mhz, " MHz")} mem</span></div>
      <div class="nvml-row"><span class="nvml-row-label">Fan</span>
        <span class="nvml-row-val">${fmtNum(g.fan_percent, "%")}</span></div>
      ${procs || extRow ? `
        <div class="nvml-section-title">Processes</div>
        <table class="nvml-procs">
          <thead><tr><th>PID</th><th>Name</th><th class="r">VRAM</th></tr></thead>
          <tbody>${procs}${extRow}</tbody>
        </table>` : `<div style="color:#6b7280;font-size:11px;margin-top:6px">No compute processes.</div>`}
    `;
  }).join("");
}

function renderSystemTab(data) {
  const cpu = data.cpu || {};
  const ram = data.ram || {};
  const cores = (cpu.cores || []).map((c) => `
    <div class="nvml-core"><div style="width:${c}%;background:${loadColor(c)}"></div></div>
  `).join("");
  return `
    <div class="nvml-section-title">CPU</div>
    <div class="nvml-row"><span class="nvml-row-label">Total load</span>
      <span class="nvml-row-val">${bar(cpu.percent, loadColor(cpu.percent))} ${fmtPct(cpu.percent)}</span></div>
    <div class="nvml-row"><span class="nvml-row-label">Cores</span>
      <span class="nvml-row-val">${cpu.count || 0} logical</span></div>
    <div class="nvml-cores">${cores}</div>

    <div class="nvml-section-title">Memory</div>
    <div class="nvml-row"><span class="nvml-row-label">RAM used</span>
      <span class="nvml-row-val">${bar(ram.percent, loadColor(ram.percent))} ${fmtG(ram.used_gb)} / ${fmtG(ram.total_gb)} (${fmtPct(ram.percent)})</span></div>

    <div class="nvml-section-title">Driver</div>
    <div class="nvml-row"><span class="nvml-row-label">NVIDIA driver</span>
      <span class="nvml-row-val">${data.driver || "—"}</span></div>
    <div class="nvml-row"><span class="nvml-row-label">Provider</span>
      <span class="nvml-row-val">${data.provider}</span></div>
  `;
}

let latestData = null;
let chipEl = null;

async function poll() {
  try {
    const r = await fetch("/nvml_monitor/stats", { cache: "no-store" });
    if (r.ok) {
      latestData = await r.json();
      renderChip(chipEl, latestData);
      if (popupEl) {
        renderPopup(latestData);
        positionPopup();
      }
    }
  } catch (e) {
    renderChip(chipEl, null);
  }
}

app.registerExtension({
  name: "NVML.Monitor",
  async setup() {
    if (document.getElementById("nvml-monitor-style")) return;
    makeStyle();
    chipEl = makeChip();
    renderChip(chipEl, null);
    await poll();
    setInterval(poll, POLL_MS);
    if (loadOpen()) openPopup();
  },
});
