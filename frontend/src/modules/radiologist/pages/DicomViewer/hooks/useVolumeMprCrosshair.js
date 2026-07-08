// src/modules/radiologist/DicomViewer/hooks/useVolumeMprCrosshair.js
//
// IMAIOS-style canvas crosshair for the 3-pane Volume MPR layout.
// mode="line"    → full-viewport colored lines + center dot
// mode="pointer" → center dot only

import { useEffect, useRef } from "react";

const DEFAULT_VP_IDS = ["MPR_VOL_AX", "MPR_VOL_SAG", "MPR_VOL_COR"];
const COLORS  = ["#378ADD", "#EF9F27", "#97C459"];

const dot3 = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

export default function useVolumeMprCrosshair({
  enabled,
  mode = "line",
  renderingEngineRef,
  refs,
  readyToken = 0,
  vpIds = DEFAULT_VP_IDS,
}) {
  const worldRef    = useRef(null);
  const overlaysRef = useRef({});
  const draggingRef = useRef(null);  // slot index being dragged
  const disposedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      Object.values(overlaysRef.current).forEach(o => { try { o.wrap.remove(); } catch {} });
      overlaysRef.current = {};
      return;
    }

    disposedRef.current = false;
    const listeners = [];   // { el, evt, fn, capture }
    let retryTimer  = null;
    let retryCount  = 0;

    const addL = (el, evt, fn, capture = false) => {
      el.addEventListener(evt, fn, capture);
      listeners.push({ el, evt, fn, capture });
    };

    // ── viewport accessor ────────────────────────────────────────────────
    const getVp = slot => renderingEngineRef?.current?.getViewport?.(vpIds[slot]);

    // ── overlay creation ─────────────────────────────────────────────────
    const ensureOverlay = (slot) => {
      const ex = overlaysRef.current[slot];
      if (ex && ex.wrap.isConnected) return ex;
      const el = refs[slot]?.current;
      if (!el) return null;

      // Cornerstone renders a <canvas> inside the container div.
      // We must append the overlay to the container (not the canvas).
      const parent = el.parentElement || el;
      const color  = COLORS[slot];

      const wrap = document.createElement("div");
      wrap.dataset.mprCrosshair = String(slot);
      wrap.style.cssText =
        "position:absolute;inset:0;pointer-events:none;z-index:50;overflow:hidden;";

      const v = document.createElement("div");
      v.style.cssText =
        `position:absolute;top:0;bottom:0;width:2px;background:${color};opacity:0.9;` +
        "pointer-events:none;transform:translateX(-50%);will-change:left;";

      const h = document.createElement("div");
      h.style.cssText =
        `position:absolute;left:0;right:0;height:2px;background:${color};opacity:0.9;` +
        "pointer-events:none;transform:translateY(-50%);will-change:top;";

      const dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;width:14px;height:14px;border-radius:50%;` +
        `border:2.5px solid ${color};background:rgba(0,0,0,0.35);` +
        "pointer-events:none;transform:translate(-50%,-50%);cursor:crosshair;";

      wrap.appendChild(v);
      wrap.appendChild(h);
      wrap.appendChild(dot);
      parent.appendChild(wrap);

      const o = { wrap, v, h, dot };
      overlaysRef.current[slot] = o;
      return o;
    };

    // ── draw one slot ────────────────────────────────────────────────────
    const drawSlot = (slot, cx, cy) => {
      const o = ensureOverlay(slot);
      if (!o) return;
      if (!Number.isFinite(cx)) { o.wrap.style.display = "none"; return; }
      o.wrap.style.display = "block";
      const lines = mode === "line";
      o.v.style.display = lines ? "block" : "none";
      o.h.style.display = lines ? "block" : "none";
      o.v.style.left   = `${cx}px`;
      o.h.style.top    = `${cy}px`;
      o.dot.style.left = `${cx}px`;
      o.dot.style.top  = `${cy}px`;
    };

    // ── redraw all slots from current world point ─────────────────────────
    const drawAll = () => {
      for (let slot = 0; slot < 3; slot++) {
        const vp = getVp(slot);
        const el = refs[slot]?.current;
        if (!vp || !el) continue;
        let cx = null, cy = null;
        if (worldRef.current) {
          try {
            const c = vp.worldToCanvas(worldRef.current);
            if (c && Number.isFinite(c[0])) { cx = c[0]; cy = c[1]; }
          } catch {}
        }
        if (cx == null) { cx = (el.clientWidth||400)/2; cy = (el.clientHeight||400)/2; }
        drawSlot(slot, cx, cy);
      }
    };

    // ── reslice a volume viewport to a world point ────────────────────────
    const resliceViewport = (vp, worldPt) => {
      try {
        const cam = vp.getCamera?.();
        if (!cam) return;
        const fp  = cam.focalPoint      || [0,0,0];
        const pos = cam.position        || [0,0,0];
        const vpn = cam.viewPlaneNormal || [0,0,1];
        const d   = [worldPt[0]-fp[0], worldPt[1]-fp[1], worldPt[2]-fp[2]];
        const s   = dot3(d, vpn);
        vp.setCamera({
          ...cam,
          focalPoint: [fp[0]+vpn[0]*s, fp[1]+vpn[1]*s, fp[2]+vpn[2]*s],
          position:   [pos[0]+vpn[0]*s, pos[1]+vpn[1]*s, pos[2]+vpn[2]*s],
        });
        vp.render?.();
      } catch {}
    };

    // ── apply a pointer position on a slot ───────────────────────────────
    const applyPos = (slot, clientX, clientY) => {
      const vp = getVp(slot);
      const el = refs[slot]?.current;
      if (!vp || !el) return;
      const rect = el.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      try {
        const world = vp.canvasToWorld([cx, cy]);
        if (!world || !world.every(Number.isFinite)) return;
        worldRef.current = world;
        drawSlot(slot, cx, cy);
        for (let s = 0; s < 3; s++) {
          if (s !== slot) resliceViewport(getVp(s), world);
        }
        requestAnimationFrame(() => { if (!disposedRef.current) drawAll(); });
      } catch {}
    };

    // ── setup ─────────────────────────────────────────────────────────────
    const setup = () => {
      if (disposedRef.current) return;
      const ready = [0,1,2].every(s => {
        const vp = getVp(s);
        const el = refs[s]?.current;
        return vp && el && el.clientWidth > 0 && typeof vp.canvasToWorld === "function";
      });
      if (!ready) {
        if (retryCount++ < 80) retryTimer = setTimeout(setup, 200);
        else console.warn("[useVolumeMprCrosshair] gave up waiting");
        return;
      }
      console.log("[useVolumeMprCrosshair] attaching ✓");

      // Seed world point at center of axial pane
      const trySeed = (attempt = 0) => {
        if (disposedRef.current) return;
        const vp = getVp(0); const el = refs[0]?.current;
        if (!vp || !el) return;
        try {
          const world = vp.canvasToWorld([(el.clientWidth||400)/2, (el.clientHeight||400)/2]);
          if (world && world.every(Number.isFinite)) { worldRef.current = world; drawAll(); }
          else if (attempt < 30) setTimeout(() => trySeed(attempt+1), 200);
        } catch { if (attempt < 30) setTimeout(() => trySeed(attempt+1), 200); }
      };
      drawAll();
      trySeed();

      // Redraw whenever any viewport re-renders (scroll, zoom, pan)
      for (let slot = 0; slot < 3; slot++) {
        const el = refs[slot]?.current;
        if (!el) continue;
        const onRender = () => { if (!disposedRef.current && worldRef.current) drawAll(); };
        ["cornerstoneimagerendered", "cornerstoneVolumeNewImageEvent",
         "cornerstoneCameraModified", "CORNERSTONE_CAMERA_RESET"].forEach(evt => {
          addL(el, evt, onRender);
        });
      }

      // ── Pointer interaction ───────────────────────────────────────────
      // Strategy: intercept at CAPTURE phase on each viewport element so we
      // run BEFORE CS3D tools. We call applyPos for crosshair movement, then
      // let the event propagate normally so CS3D pan/zoom/scroll still work.
      //
      // pointerdown capture → mark dragging slot, apply pos
      // pointermove capture → if dragging, apply pos (runs alongside CS3D tool)
      // pointerup   capture → clear dragging

      for (let slot = 0; slot < 3; slot++) {
        const el = refs[slot]?.current;
        if (!el) continue;
        const s = slot;

        const onDown = (ev) => {
          if (ev.button !== 0) return;
          draggingRef.current = s;
          applyPos(s, ev.clientX, ev.clientY);
          // Do NOT stopPropagation — CS3D tools must still receive the event
        };
        const onMove = (ev) => {
          if (draggingRef.current !== s) return;
          applyPos(s, ev.clientX, ev.clientY);
        };
        const onUp = () => {
          if (draggingRef.current === s) draggingRef.current = null;
        };

        // Capture phase — runs before CS3D's bubble-phase listeners
        addL(el, "pointerdown",   onDown, true);
        addL(el, "pointermove",   onMove, true);
        addL(el, "pointerup",     onUp,   true);
        addL(el, "pointercancel", onUp,   true);
      }
    };

    setup();

    return () => {
      disposedRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      listeners.forEach(({ el, evt, fn, capture }) =>
        el.removeEventListener(evt, fn, capture));
      Object.values(overlaysRef.current).forEach(o => { try { o.wrap.remove(); } catch {} });
      overlaysRef.current = {};
      draggingRef.current = null;
      worldRef.current    = null;
    };
  }, [enabled, mode, readyToken]); // eslint-disable-line react-hooks/exhaustive-deps
}
