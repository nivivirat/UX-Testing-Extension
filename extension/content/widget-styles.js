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
#list { width: 400px; }
.lhead { padding: 12px 16px 10px; border-bottom: 1px solid var(--gray2); display: grid; gap: 10px; }
.seg.tabs button { height: 30px; font-size: 13px; }
.cnt { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 4px; border-radius: 9px; background: var(--gray2); color: var(--gray9); font: 500 10.5px var(--mono); }
.cnt.hot { background: var(--blue); color: #fff; }
.filters { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.chips { display: flex; gap: 4px; flex-wrap: wrap; }
.chips button { height: 26px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 500; color: var(--gray9); box-shadow: var(--ring); display: inline-flex; align-items: center; gap: 5px; }
.chips button span { font: 10.5px var(--mono); color: var(--gray7); }
.chips button:hover { color: var(--fg); }
.chips button[aria-pressed="true"] { background: var(--fg); color: #fff; box-shadow: none; }
.chips button[aria-pressed="true"] span { color: rgba(255,255,255,.7); }
.irows { padding: 6px 8px; }
.irow { display: grid; grid-template-columns: 8px minmax(0,1fr) 28px 108px 26px; align-items: center; gap: 8px; padding: 6px 6px 6px 10px; border-radius: 8px; min-height: 44px; }
.irow + .irow { box-shadow: 0 -1px 0 var(--gray1); }
.irow:hover { background: var(--bg2); }
.sdot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.sd-critical { background: var(--red); box-shadow: 0 0 0 3px var(--red-soft); }
.sd-high { background: #F06A6A; }
.sd-medium { background: #F5A623; }
.sd-low { background: #A3A3A3; }
.it { display: block; width: 100%; min-width: 0; text-align: left; font-weight: 500; font-size: 13px; line-height: 1.35; padding: 4px 0;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
.it:hover { color: var(--blue); }
.go { width: 28px; height: 28px; border-radius: 7px; display: inline-grid; place-items: center; color: var(--fg); background: var(--bg);
  box-shadow: var(--shadow-sm); text-decoration: none; transition: background .12s, color .12s, box-shadow .12s; }
.go:hover { background: var(--blue); color: #fff; box-shadow: none; }
.go.off { color: var(--gray4); box-shadow: var(--ring); cursor: not-allowed; }
.go.off:hover { background: var(--bg); color: var(--gray4); box-shadow: var(--ring); }
a.btn { text-decoration: none; color: var(--fg); }
.st { position: relative; display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 8px 0 10px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: filter .12s; }
.st:hover { filter: brightness(.96); }
.irow .st { justify-content: space-between; }
.st svg { opacity: .55; }
[aria-expanded="true"].st { box-shadow: 0 0 0 2px var(--bg), 0 0 0 3px var(--gray4); }
.st-open { background: var(--gray1); color: var(--fg); }
.st-reopened { background: var(--red-soft); color: #C7262D; }
.st-fixed { background: var(--blue-soft); color: #0050C0; }
.st-partially-fixed { background: var(--amber-soft); color: var(--amber); }
.st-unresolved { background: var(--amber-soft); color: var(--amber); }
.st-closed { background: var(--green-soft); color: var(--green); }
.del { width: 26px; height: 26px; opacity: 0; transition: opacity .12s; }
.irow:hover .del, .del:focus-visible { opacity: 1; }
.del:hover { color: var(--red); background: var(--red-soft); }
.rlist { display: grid; gap: 8px; padding: 12px; }
.rcard { padding: 10px 10px 10px 12px; border-radius: 10px; box-shadow: var(--shadow-sm); display: grid; gap: 8px; }
.rt { display: grid; grid-template-columns: 8px minmax(0,1fr) 28px; align-items: center; gap: 8px; }
.dnote { font-size: 12px; color: var(--gray9); background: var(--bg2); border-radius: 6px; padding: 6px 8px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.dnote b { color: var(--fg); font-weight: 500; }
.ract { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ract .btn { height: 32px; }
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

/* dropdown menu (custom, replaces native select popups) */
.menu { position: fixed; min-width: 200px; max-width: 280px; max-height: 340px; overflow: auto; background: var(--bg); border-radius: 10px;
  box-shadow: var(--shadow-lg); padding: 4px; pointer-events: auto; animation: kqa-pop .12s ease-out; }
@keyframes kqa-pop { from { opacity: 0; transform: translateY(-2px) scale(.98); } to { opacity: 1; transform: none; } }
.mi { display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; padding: 0 8px; border-radius: 6px; font-size: 13px; text-align: left; color: var(--fg); outline: none; }
.mi:hover, .mi:focus-visible { background: var(--gray1); }
.mi .ml { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mi .msub { font: 11px var(--mono); color: var(--gray7); }
.mi .ck { width: 14px; display: inline-grid; place-items: center; color: var(--fg); flex: none; padding: 0; box-shadow: none; background: none; border-radius: 0; }
.mi .msub { white-space: nowrap; }
.mi .mic { color: var(--gray9); flex: none; }
.mi.danger { color: var(--red); }
.mdot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.msep { height: 1px; background: var(--gray2); margin: 4px -4px; }
.mlabel { padding: 8px 8px 4px; font-size: 11.5px; color: var(--gray9); font-weight: 500; }

/* project switcher + forms */
.proj { min-width: 0; }
.pswitch { display: inline-flex; align-items: center; gap: 6px; max-width: 250px; height: 28px; padding: 0 8px; margin-left: -8px; border-radius: 6px; cursor: pointer; transition: background .12s; }
.pswitch:hover, .pswitch[aria-expanded="true"] { background: var(--gray1); }
.pname { font-weight: 600; font-size: 14px; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pswitch svg { flex: none; color: var(--gray9); }
.ftitle { font-weight: 600; font-size: 13px; }
.frow { display: flex; align-items: center; gap: 8px; }
.frow .sp { flex: 1; }
.slinks { display: flex; gap: 16px; padding-top: 4px; font-size: 12.5px; }
.link { color: var(--gray9); font-weight: 500; cursor: pointer; padding: 0; }
.link:hover { color: var(--fg); text-decoration: underline; text-underline-offset: 2px; }
.link.danger { color: var(--red); }

.rmb { font: 500 11px var(--mono); color: var(--gray9); text-decoration: none; padding: 2px 6px; border-radius: 5px; box-shadow: var(--ring); white-space: nowrap; }
.rmb:hover { color: var(--blue); box-shadow: 0 0 0 1px var(--blue); }
.rmb.err { color: var(--red); box-shadow: 0 0 0 1px #F7C1C1; background: var(--red-soft); }
.irow { grid-template-columns: 8px minmax(0,1fr) auto 28px 120px 26px !important; }
.st .stl { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.irow .st { min-width: 0; overflow: hidden; }
.dnote b, .dmeta .st { max-width: 100%; }
.irow > .it + .go { grid-column: 4; }

/* current round strip */
.rstrip { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 16px; background: var(--bg2); border-bottom: 1px solid var(--gray2); font-size: 12px; color: var(--gray9); text-align: left; transition: background .12s; }
.rstrip:hover { background: var(--gray1); }
.rstrip .rn { font-weight: 600; color: var(--fg); }
.rstrip .rs b { font: 600 12px var(--mono); color: var(--fg); margin-right: 2px; }
.rstrip .more { margin-left: auto; color: var(--blue); font-weight: 500; white-space: nowrap; }

/* retest card summary */
button.dnote { display: block; width: 100%; text-align: left; cursor: pointer; transition: background .12s; }
button.dnote:hover { background: var(--gray1); }
.dnote .warn { color: var(--amber); }
.dnote .more { float: right; color: var(--blue); font-weight: 500; margin-left: 8px; }

/* retest detail view */
.dhead { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--gray2); }
.dhead .sp { flex: 1; }
.dbody { padding: 14px 16px 16px; display: grid; gap: 16px; align-content: start; }
.dtitle { font-weight: 600; font-size: 15px; line-height: 1.35; letter-spacing: -0.01em; }
.dmeta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; color: var(--gray9); font-size: 12px; margin-top: -8px; }
.dmeta .st { cursor: default; height: 22px; }
.dsec { display: grid; gap: 6px; }
.dst { font-size: 12px; font-weight: 600; color: var(--fg); }
.dst .muted { font: 500 11.5px var(--mono); margin-left: 4px; }
.ck { display: grid; grid-template-columns: 18px minmax(0,1fr) auto; gap: 10px; align-items: start; padding: 9px 10px; border-radius: 8px; box-shadow: var(--ring); cursor: pointer; transition: background .12s; }
.ck:hover { background: var(--bg2); }
.ck input { position: absolute; opacity: 0; pointer-events: none; }
.cbox { width: 18px; height: 18px; border-radius: 5px; box-shadow: inset 0 0 0 1.5px var(--gray4); display: grid; place-items: center; color: transparent; margin-top: 1px; transition: background .12s; }
.ck input:checked + .cbox { background: var(--fg); box-shadow: none; color: #fff; }
.ck input:focus-visible + .cbox { outline: 2px solid var(--blue); outline-offset: 2px; }
.ck input:checked ~ .ctext .cl { color: var(--gray9); text-decoration: line-through; text-decoration-color: var(--gray4); }
.ctext { display: grid; gap: 2px; min-width: 0; }
.cl { font-weight: 500; font-size: 13px; line-height: 1.4; }
.cd { font-size: 12px; color: var(--gray9); line-height: 1.45; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.ck:hover .cd { -webkit-line-clamp: unset; }
.ck.not, .ck.partial { background: var(--amber-soft); box-shadow: 0 0 0 1px #F7D9A8; cursor: default; }
.ck.partial { cursor: pointer; }
.ck.not .cbox { box-shadow: inset 0 0 0 1.5px #E8B46C; background: transparent; }
.ptag { font-size: 11px; font-weight: 600; color: var(--amber); white-space: nowrap; margin-top: 1px; }
.pchips { display: flex; flex-wrap: wrap; gap: 6px; }
.pchip { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border-radius: 999px; background: var(--bg); box-shadow: var(--shadow-sm);
  font: 12px var(--mono); color: var(--fg); text-decoration: none; transition: background .12s, color .12s; }
.pchip:hover { background: var(--blue); color: #fff; box-shadow: none; }
.pchip.off { color: var(--gray7); box-shadow: var(--ring); background: var(--bg2); cursor: default; }
.pchip svg { width: 12px; height: 12px; }
details.dtech { border-radius: 8px; box-shadow: var(--ring); padding: 0 12px; }
details.dtech summary { cursor: pointer; height: 38px; display: flex; align-items: center; font-size: 12.5px; font-weight: 500; color: var(--gray9); list-style: none; }
details.dtech summary::before { content: '›'; display: inline-block; width: 14px; transition: transform .12s; }
details.dtech[open] summary::before { transform: rotate(90deg); }
details.dtech .tr { display: grid; gap: 2px; padding: 8px 0; border-top: 1px solid var(--gray1); }
details.dtech .tk { font-size: 11px; font-weight: 600; color: var(--gray9); text-transform: uppercase; letter-spacing: .04em; }
details.dtech .tv { font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
details.dtech code { font-size: 11px; }

/* list search */
.srch { position: relative; }
.srch svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--gray7); pointer-events: none; }
.srch .inp { height: 34px; padding-left: 32px; }
.srch .inp::-webkit-search-cancel-button { cursor: pointer; }

/* reopen-note dialog */
.dback { position: fixed; inset: 0; background: rgba(0,0,0,.25); pointer-events: auto; }
.dbox { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(440px, calc(100vw - 32px)); background: var(--bg);
  border-radius: 12px; box-shadow: var(--shadow-lg); padding: 18px; display: grid; gap: 10px; pointer-events: auto; }
.dt { font-weight: 600; font-size: 15px; letter-spacing: -0.015em; }
.dsub { color: var(--gray9); font-size: 12.5px; margin-top: -6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dbox textarea.inp { min-height: 96px; }
.dbox.wide { width: min(560px, calc(100vw - 32px)); }
.dbox.wide .dsub { white-space: normal; }
.ptools { display: flex; gap: 14px; }
.lnk { font-size: 12px; color: var(--blue); padding: 0; }
.lnk:hover { text-decoration: underline; }
.plist { max-height: min(320px, 45vh); overflow-y: auto; overflow-x: hidden; min-width: 0; border-radius: 8px; box-shadow: var(--ring); }
.pushrow { width: 100%; min-width: 0; display: grid; grid-template-columns: 16px minmax(0,1fr) auto 12px minmax(0,118px); align-items: center; gap: 8px; padding: 8px 10px; font-size: 12.5px; cursor: pointer; }
.pushrow + .pushrow { box-shadow: 0 -1px 0 var(--gray1); }
.pushrow:hover { background: var(--bg2); }
.pushrow .pt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pushrow .st { height: 22px; cursor: inherit; }
.parrow { color: var(--gray9); }
.pto { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pto.warn { color: var(--amber); font-weight: 400; }
.derr { color: #C7262D; font-size: 12px; }
.dact { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }

/* toast */
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--fg); color: #fff; padding: 10px 14px;
  border-radius: 8px; box-shadow: var(--shadow-lg); pointer-events: auto; max-width: min(560px, 90vw); font-size: 13px; }
.toast.err { background: var(--red); }

@media (max-width: 1000px) { .mbody { grid-template-columns: 1fr; grid-template-rows: 55% 45%; } .mcanvas { border-right: 0; border-bottom: 1px solid var(--gray2); } }
`;
})((globalThis.KQA = globalThis.KQA || {}));
