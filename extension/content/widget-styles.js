// Styles for the floating toolbar, inspector and editor — Vercel / Geist-inspired light theme.
// Injected into a closed shadow root: page CSS cannot affect the toolbar and vice versa.
(function (K) {
  K.WIDGET_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.ui {
  --bg: #FFFFFF; --bg2: #FAFAFA; --gray1: #F2F2F2; --gray2: #EBEBEB; --gray3: #E5E5E5; --gray4: #D4D4D4;
  --gray7: #8F8F8F; --gray9: #666666; --fg: #171717;
  --blue: #006BFF; --blue-soft: #EBF3FF; --red: #E5484D; --red-soft: #FDECEC; --amber: #A35200; --amber-soft: #FFF4E5; --green: #107D32; --green-soft: #E9F7EE;
  --ring: 0 0 0 1px rgba(0,0,0,.08);
  --shadow-sm: 0 0 0 1px rgba(0,0,0,.08), 0 2px 2px rgba(0,0,0,.04);
  --shadow-md: 0 0 0 1px rgba(0,0,0,.08), 0 4px 8px -4px rgba(0,0,0,.04), 0 16px 24px -8px rgba(0,0,0,.06);
  --shadow-lg: 0 0 0 1px rgba(0,0,0,.08), 0 1px 1px rgba(0,0,0,.02), 0 8px 16px -4px rgba(0,0,0,.04), 0 24px 32px -8px rgba(0,0,0,.06);
  --sans: Geist, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font: 400 13px/1.5 var(--sans); color: var(--fg); -webkit-font-smoothing: antialiased; letter-spacing: -0.003em;
}
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; }
input, textarea, select { font: inherit; color: var(--fg); }
code, .mono { font-family: var(--mono); font-size: 12px; }
[hidden] { display: none !important; }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }

/* ---------- inspect overlay ---------- */
.ov { position: fixed; inset: 0; pointer-events: none; }
.bm { position: fixed; pointer-events: none; }
.bm-m { border-style: solid; border-color: rgba(255,166,77,.30); }
.bm-b { border-style: solid; border-color: rgba(255,214,102,.45); }
.bm-p { border-style: solid; border-color: rgba(64,190,116,.28); }
.bm-c { background: rgba(0,107,255,.14); }
.sel-ol { position: fixed; outline: 1.5px solid var(--blue); pointer-events: none; }
.hov-ol { position: fixed; outline: 1px dashed var(--blue); pointer-events: none; }
.meas-ol { position: fixed; outline: 1px solid var(--red); pointer-events: none; }
.plbl { position: fixed; transform: translate(-50%,-50%); font: 500 10px/1 var(--mono); color: var(--green); background: rgba(255,255,255,.92);
  padding: 2px 3px; border-radius: 3px; pointer-events: none; white-space: nowrap; box-shadow: var(--ring); }
.plbl.m { color: var(--amber); }
.dim { position: fixed; transform: translateX(-50%); background: var(--blue); color: #fff; font: 500 10.5px/1 var(--mono);
  padding: 3px 6px; border-radius: 4px; white-space: nowrap; pointer-events: none; }
.mline { position: fixed; background: var(--red); pointer-events: none; }
.mlbl { position: fixed; transform: translate(-50%,-50%); background: var(--red); color: #fff; font: 500 10.5px/1 var(--mono);
  padding: 3px 6px; border-radius: 4px; white-space: nowrap; pointer-events: none; }

.hcard { position: fixed; min-width: 230px; max-width: 300px; background: var(--bg); border-radius: 10px; padding: 10px 12px;
  box-shadow: var(--shadow-lg); pointer-events: none; }
.hcard .h { display: flex; gap: 6px; align-items: baseline; padding-bottom: 8px; margin-bottom: 6px; border-bottom: 1px solid var(--gray2); }
.hcard .h b { font: 600 12px var(--mono); }
.hcard .h span { color: var(--gray9); font: 11px var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hcard .r { display: grid; grid-template-columns: 64px 1fr; gap: 8px; padding: 2px 0; font-size: 12px; }
.hcard .k { color: var(--gray9); }
.hcard .v { font: 12px var(--mono); overflow-wrap: anywhere; }
.hcard .t { color: var(--blue); font-family: var(--sans); font-size: 11px; }
.sw { display: inline-block; width: 11px; height: 11px; border-radius: 3px; vertical-align: -1px; margin-right: 5px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }

/* ---------- dock ---------- */
.dock { position: fixed; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 2px; padding: 4px;
  background: var(--bg); border-radius: 12px; box-shadow: var(--shadow-lg); pointer-events: auto; user-select: none; }
.grip { width: 14px; height: 32px; display: grid; place-items: center; color: var(--gray4); cursor: grab; font-size: 12px; letter-spacing: -2px; }
.grip:hover { color: var(--gray7); }
.grip:active { cursor: grabbing; }
.dbtn { height: 32px; min-width: 32px; padding: 0 10px; border-radius: 8px; color: var(--fg); display: inline-flex; align-items: center; gap: 6px; font-weight: 500; transition: background .12s; }
.dbtn:hover { background: var(--gray1); }
.dbtn[aria-pressed="true"] { background: var(--fg); color: #fff; }
.dbtn svg { width: 16px; height: 16px; }
.dsep { width: 1px; height: 18px; background: var(--gray2); margin: 0 4px; }
.count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--gray1); color: var(--fg); font: 500 11px var(--mono); display: inline-grid; place-items: center; }
.dbtn[aria-pressed="true"] .count { background: rgba(255,255,255,.18); color: #fff; }
.tip { position: fixed; background: var(--fg); color: #EDEDED; padding: 6px 10px; border-radius: 8px; font-size: 12px; box-shadow: var(--shadow-md); pointer-events: none; white-space: nowrap; }
.tip b { color: #fff; font-weight: 500; }

/* ---------- floating panels ---------- */
.panel { position: fixed; width: 340px; max-height: calc(100vh - 110px); display: flex; flex-direction: column; background: var(--bg);
  border-radius: 12px; box-shadow: var(--shadow-lg); pointer-events: auto; overflow: hidden; }
.ph { display: flex; align-items: flex-start; gap: 6px; padding: 12px 12px 10px 16px; border-bottom: 1px solid var(--gray2); cursor: grab; user-select: none; }
.ph:active { cursor: grabbing; }
.ph .ttl { font-weight: 600; font-size: 14px; letter-spacing: -0.01em; }
.ph .ttl .comp { color: var(--blue); font-weight: 500; }
.ph .sub { color: var(--gray9); font: 11.5px var(--mono); margin-top: 2px; overflow-wrap: anywhere; }
.ph .sub.warn { color: var(--amber); font-family: var(--sans); }
.ph .sp { flex: 1; }
.ibtn { width: 28px; height: 28px; border-radius: 6px; display: inline-grid; place-items: center; color: var(--gray9); flex: none; transition: background .12s, color .12s; }
.ibtn:hover { background: var(--gray1); color: var(--fg); }
.ibtn:disabled { opacity: .35; cursor: default; background: none; }
.pb { overflow: auto; padding: 4px 0 8px; }
.pf { padding: 12px 16px; border-top: 1px solid var(--gray2); display: flex; gap: 8px; align-items: center; background: var(--bg2); }
.btn { height: 32px; padding: 0 12px; border-radius: 6px; background: var(--bg); box-shadow: var(--shadow-sm); display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-weight: 500; white-space: nowrap; transition: background .12s; }
.btn:hover { background: var(--gray1); }
.btn.primary { background: var(--fg); color: #fff; box-shadow: none; }
.btn.primary:hover { background: #383838; }
.btn.grow { flex: 1; }
.btn.ghost { box-shadow: none; background: transparent; }
.btn.ghost:hover { background: var(--gray1); }
.btn.danger { color: var(--red); }
.btn.sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.btn:disabled { opacity: .5; cursor: default; }
.btn kbd { font: 11px var(--mono); opacity: .6; margin-left: 2px; }
.muted { color: var(--gray9); }

/* inspect panel */
.sec { padding: 10px 16px 6px; }
.sec + .sec { border-top: 1px solid var(--gray2); }
.sect { font-size: 12px; font-weight: 600; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: baseline; }
.sect .muted { font: 400 11.5px var(--mono); }
.prow { display: grid; grid-template-columns: 96px 1fr 18px; align-items: center; gap: 6px; padding: 4px 8px; margin: 0 -8px; border-radius: 6px; cursor: pointer; transition: background .1s; }
.prow:hover { background: var(--gray1); }
.prow .k { color: var(--gray9); font-size: 12.5px; }
.prow .v { font: 12px var(--mono); overflow-wrap: anywhere; }
.prow .v .t { color: var(--blue); font: 11px var(--sans); margin-left: 6px; }
.prow .fl { opacity: 0; color: var(--red); font-size: 11px; text-align: center; }
.prow:hover .fl { opacity: .5; }
.prow.flag { background: var(--red-soft); }
.prow.flag .fl { opacity: 1; }
.prow.flag .k { color: var(--red); font-weight: 500; }
.bmd { font: 11px/1 var(--mono); text-align: center; margin: 6px 0 8px; }
.bmd .box { position: relative; border: 1px dashed var(--gray4); border-radius: 8px; padding: 20px 28px; background: var(--bg); }
.bmd .box.b { border-style: solid; border-color: var(--gray3); background: var(--bg2); }
.bmd .box.p { border-style: solid; border-color: #CDEBD6; background: var(--green-soft); }
.bmd .box.c { border: 1px solid #C7DCFF; background: var(--blue-soft); padding: 9px 6px; border-radius: 5px; color: #0050C0; }
.bmd .lb { position: absolute; left: 7px; top: 5px; font: 10px var(--sans); color: var(--gray7); }
.bmd .n { position: absolute; padding: 2px 4px; border-radius: 4px; cursor: pointer; min-width: 16px; }
.bmd .n:hover { background: rgba(0,0,0,.06); }
.bmd .n.zero { color: var(--gray4); }
.bmd .n.flag { background: var(--red); color: #fff; }
.bmd .n.t { top: 3px; left: 50%; transform: translateX(-50%); }
.bmd .n.b { bottom: 3px; left: 50%; transform: translateX(-50%); }
.bmd .n.l { left: 5px; top: 50%; transform: translateY(-50%); }
.bmd .n.r { right: 5px; top: 50%; transform: translateY(-50%); }
.hint { color: var(--gray9); font-size: 12px; }

/* issues panel */
.ilist { display: grid; gap: 8px; padding: 12px; }
.icard { border-radius: 8px; padding: 10px 12px; box-shadow: var(--shadow-sm); background: var(--bg); }
.icard .r1 { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.icard .id { font: 500 12px var(--mono); }
.icard .tt { font-weight: 500; margin: 4px 0 2px; }
.icard .mt { color: var(--gray9); font: 11.5px var(--mono); margin-bottom: 8px; }
.icard select { height: 28px; border: 0; border-radius: 6px; padding: 0 6px; font-size: 12px; background: var(--bg); box-shadow: var(--shadow-sm); }
.chip { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 500; background: var(--gray1); color: var(--fg); }
.sev-critical { background: var(--red); color: #fff; }
.sev-high { background: var(--red-soft); color: #C7262D; }
.sev-medium { background: var(--amber-soft); color: var(--amber); }
.sev-low { background: var(--blue-soft); color: #0050C0; }
.empty { text-align: center; color: var(--gray9); padding: 32px 16px; }
.sform { padding: 14px 16px; background: var(--bg2); border-bottom: 1px solid var(--gray2); display: grid; gap: 12px; }
.sform .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fld { display: grid; gap: 6px; }
.fld > span { font-size: 13px; font-weight: 500; color: var(--fg); }
.fld > span em { font-style: normal; font-weight: 400; color: var(--gray7); margin-left: 4px; }
.inp { width: 100%; height: 36px; border: 0; border-radius: 6px; padding: 0 12px; background: var(--bg); box-shadow: var(--shadow-sm); outline: none; transition: box-shadow .12s; }
.inp::placeholder { color: var(--gray7); }
textarea.inp { height: auto; min-height: 60px; padding: 9px 12px; resize: vertical; line-height: 1.55; }
.inp:hover { box-shadow: 0 0 0 1px rgba(0,0,0,.16), 0 2px 2px rgba(0,0,0,.04); }
.inp:focus { box-shadow: 0 0 0 1px var(--gray7), 0 0 0 4px rgba(0,0,0,.06); }
.chk { display: flex; gap: 8px; align-items: center; color: var(--gray9); }
.chk input { accent-color: var(--fg); }

/* ---------- editor modal ---------- */
.mback { position: fixed; inset: 0; background: rgba(0,0,0,.30); pointer-events: auto; backdrop-filter: blur(1px); }
.mdlg { position: fixed; inset: 16px; background: var(--bg); border-radius: 12px; box-shadow: var(--shadow-lg);
  display: grid; grid-template-rows: auto 1fr; overflow: hidden; pointer-events: auto; }
.mh { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--gray2); }
.mh .ttl { font-weight: 600; font-size: 15px; letter-spacing: -0.015em; }
.mh .muted { font: 12px var(--mono); }
.mh .sp { flex: 1; }
.mbody { display: grid; grid-template-columns: minmax(0,1fr) 380px; min-height: 0; }
.mcanvas { display: flex; flex-direction: column; min-height: 0; background: var(--bg2); border-right: 1px solid var(--gray2);
  background-image: radial-gradient(var(--gray3) 1px, transparent 1px); background-size: 16px 16px; }
.tools { display: inline-flex; gap: 2px; align-self: center; margin: 12px 0 4px; padding: 3px; background: var(--bg); border-radius: 8px; box-shadow: var(--shadow-sm); }
.tool { height: 28px; padding: 0 10px; border-radius: 6px; display: inline-flex; gap: 6px; align-items: center; font-weight: 500; font-size: 12.5px; color: var(--gray9); transition: background .12s, color .12s; }
.tool:hover { background: var(--gray1); color: var(--fg); }
.tool[aria-pressed="true"] { background: var(--fg); color: #fff; }
.cwrap { flex: 1; min-height: 0; display: grid; place-items: center; padding: 8px 16px 16px; overflow: hidden; }
.cwrap canvas { max-width: 100%; max-height: 100%; background: #fff; border-radius: 6px; box-shadow: var(--shadow-md); cursor: crosshair; touch-action: none; display: block; }
.mform { overflow: auto; padding: 16px; display: grid; gap: 16px; align-content: start; }
.mform textarea.desc { min-height: 200px; }
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; background: var(--gray1); border-radius: 8px; padding: 3px; gap: 2px; }
.seg button { height: 28px; border-radius: 6px; font-weight: 500; font-size: 12px; color: var(--gray9); position: relative; transition: background .12s, color .12s; white-space: nowrap; padding: 0 4px; }
.seg button:hover { color: var(--fg); }
.seg button[aria-pressed="true"] { background: var(--bg); color: var(--fg); box-shadow: var(--shadow-sm); }
.seg button .dot { position: absolute; top: 4px; right: 4px; width: 5px; height: 5px; border-radius: 50%; background: var(--blue); }
.seg.sev button[data-v="critical"][aria-pressed="true"] { color: var(--red); }
.seg.sev button[data-v="high"][aria-pressed="true"] { color: #C7262D; }
.seg.sev button[data-v="medium"][aria-pressed="true"] { color: var(--amber); }
.seg.sev button[data-v="low"][aria-pressed="true"] { color: #0050C0; }
.okt { color: var(--green); font-size: 12px; }
.wrn { color: var(--amber); font-size: 12px; }
.errs { background: var(--red-soft); color: #C7262D; border-radius: 6px; padding: 8px 12px; font-size: 12.5px; }
.errs ul { margin: 0; padding-left: 16px; }

/* toast */
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--fg); color: #fff; padding: 10px 14px;
  border-radius: 8px; box-shadow: var(--shadow-lg); pointer-events: auto; max-width: min(560px, 90vw); font-size: 13px; }
.toast.err { background: var(--red); }

@media (max-width: 1000px) { .mbody { grid-template-columns: 1fr; grid-template-rows: 55% 45%; } .mcanvas { border-right: 0; border-bottom: 1px solid var(--gray2); } }
`;
})((globalThis.KQA = globalThis.KQA || {}));
