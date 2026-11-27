/**
 * gazpar-card — « Carte Gazpar »
 *
 * Consommation de gaz lue en direct par un capteur branché sur le compteur Gazpar (LiXee ZiPulses,
 * compteur d'impulsions ESPHome…), d'après les statistiques de Home Assistant. Même présentation que
 * la carte ZLinky (Marlboro62/ZLinky-Card) et la carte Enedis Linky New.
 *
 * type: custom:gazpar-card
 * entity: sensor.<compteur de gaz cumulé, en m³ ou en kWh>
 * meter: auto                       (ou m3, kwh, pulses : ZiPulses réglé par défaut, impulsions affichées en « kWh »)
 * conversion_factor: 11.2            (kWh par m³, ou conversion_entity: input_number.… / sensor.gazpar)
 * price: 0.105                       (€ par kWh, ou price_entity: input_number.…)
 *
 * © 2026 Marlboro62.
 */
(() => {
const CARD_VERSION = "0.2.0";

/* ------------------------------------------------------------- affichage */

const fmt = (n, digits = 1) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const euro = (n) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/** Échelle d'un graphique en barres : pas « rond » (1, 2, 2,5 ou 5 × 10ⁿ) donnant 3 ou 4 graduations,
 *  haut de l'échelle arrondi au pas. Sans échelle (show_scale: false), le haut reste juste au-dessus
 *  de la plus haute barre, comme avant. */
const chartScale = (dataMax, on, floor = 1) => {
  const m = Math.max(floor, dataMax || 0);
  if (!on) return { top: m * 1.08, ticks: [], gutter: "", grid: "" };
  const raw = m / 3.5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  const top = Math.ceil(m / step - 1e-9) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (String(step / mag).includes(".") ? 1 : 0));
  return {
    top,
    ticks,
    // lignes horizontales dans le SVG (trait fin quel que soit l'étirement), étiquettes en HTML (texte non déformé)
    grid: ticks.slice(1).map((v) => `<line class="grid" x1="0" x2="100" y1="${100 - (v / top) * 100}" y2="${100 - (v / top) * 100}" vector-effect="non-scaling-stroke"/>`).join(""),
    gutter: `<div class="axis" aria-hidden="true">${ticks.map((v) => `<span style="top:${100 - (v / top) * 100}%">${fmt(v, digits)}</span>`).join("")}</div>`,
  };
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Couleur choisie (hc_color, hp_color) : "#1e88e5", [r, g, b], rgb()/hsl(), var(--x) ou nom CSS.
 *  null si absente ou invalide (la couleur par défaut s'applique). */
const cssColor = (value) => {
  if (Array.isArray(value)) {
    const n = value.map(Number);
    return n.length === 3 && n.every(Number.isFinite) ? `rgb(${n.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(", ")})` : null;
  }
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v;
  if (/^(rgba?|hsla?)\([\d\s.,%/]+\)$/i.test(v) || /^var\(--[\w-]+\)$/.test(v) || /^[a-z]{3,20}$/i.test(v)) return v;
  return null;
};

/** Prix du kWh saisis dans la carte (hc_price + hp_price, ou base_price), en €/kWh ; null si non renseignés. */
const positivePrice = (v) => {
  const x = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

/** Conversions pour la roue de couleurs de l'éditeur (teinte 0-360, saturation et luminosité 0-1). */
const hsvToHex = (h, sat, val) => {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (val - val * sat * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return "#" + [f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
const hexToHsv = (hex) => {
  let m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m && /^#?([0-9a-f]{3})$/i.test(hex || "")) m = [0, hex.replace("#", "").split("").map((x) => x + x).join("")];
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
};
/** "#1e88e5", [r, g, b] ou "rgb(...)" -> "#rrggbb" (pour la roue), sinon null */
const toHex = (value) => {
  const col = cssColor(value);
  if (!col) return null;
  if (/^#[0-9a-f]{6}$/i.test(col)) return col.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(col)) return ("#" + col.slice(1).split("").map((x) => x + x).join("")).toLowerCase();
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(col);
  return m ? "#" + m.slice(1, 4).map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("") : null;
};

/** Classe de thème de la carte :
 *  v2   : style MyElectricalData, toujours bleu nuit ;
 *  auto : style MyElectricalData, bleu nuit si Home Assistant est en mode sombre, clair sinon ;
 *  ha   : couleurs du thème Home Assistant (clair ou sombre). */
const themeClass = (theme, hass) => {
  const light = hass?.themes?.darkMode === false;
  if (theme === "ha") return `th-ha${light ? " light" : ""}`;
  if (theme === "auto") return `th-v2${light ? " light" : ""}`;
  return "th-v2";
};

/* ------------------------------------------------------------------ style */

const STYLE_BASE = `<style>
:host {
  --med-bg: #1a2434; --med-surface: #212d40; --med-line: #2f3d55;
  --med-text: #e7edf5; --med-muted: #8fa0b8;
  --med-green: #96d21f; --med-blue: #1d93e3;
  --med-hc: #4a7bd8; --med-hp: #d27333;
  --t-blue: #3f7ff0; --t-white: #e9eef4; --t-red: #ee4a4a;
  --med-up: #f08a4b; --med-down: #5fcf8a;
}
ha-card { background: var(--med-bg); color: var(--med-text); border: 1px solid var(--med-line);
  border-radius: 18px; overflow: hidden; font-variant-numeric: tabular-nums; container-type: inline-size; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 8px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand svg { width: 34px; height: 34px; fill: none; }
.brand .house { stroke: var(--med-green); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
.brand .bolt { fill: var(--med-accent, var(--med-blue)); }
.title { font-size: 1.15rem; font-weight: 700; letter-spacing: .2px; }
.sub { font-size: .78rem; color: var(--med-muted); }
.tempo { display: flex; gap: 8px; }
.pill { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
  background: var(--med-surface); border: 1px solid var(--med-line); font-size: .78rem; }
.pill-l { color: var(--med-muted); }
.pill-v { font-weight: 600; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--med-muted); flex: none; }
.t-blue .dot { background: var(--t-blue); } .t-white .dot { background: var(--t-white); } .t-red .dot { background: var(--t-red); }
.t-none .pill-v { color: var(--med-muted); font-weight: 400; }
.quotas { display: flex; align-items: center; gap: 14px; padding: 0 18px 10px; font-size: .82rem; }
.quota { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }
.quota small { color: var(--med-muted); font-weight: 400; }
.quota-l { color: var(--med-muted); }

.hero { margin: 4px 12px 0; padding: 16px; border-radius: 14px; background: var(--med-surface);
  border: 1px solid var(--med-line); display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; }
.hero-l { color: var(--med-muted); font-size: .85rem; }
.hero-v { font-size: 2.4rem; font-weight: 700; line-height: 1.1; }
.hero-v span, .tile-v span { font-size: .9rem; font-weight: 500; color: var(--med-muted); margin-left: 4px; }
.hero-r { text-align: right; align-self: center; }
.cost { font-size: 1.6rem; font-weight: 700; color: var(--med-green); }
.cost.none { color: var(--med-muted); }
.cost.est { color: var(--med-text); opacity: .85; }
.hero-p { font-size: .75rem; color: var(--med-muted); margin-top: 6px; }
.cost-l { font-size: .75rem; color: var(--med-muted); max-width: 160px; }
.evo { font-size: .8rem; font-weight: 600; margin-top: 2px; }
.evo.up { color: var(--med-up); } .evo.down { color: var(--med-down); }
.split { grid-column: 1 / -1; margin-top: 6px; }
.split.wait { font-size: .8rem; color: var(--med-muted); border-top: 1px dashed var(--med-line); padding-top: 8px; }
.bar { display: flex; height: 8px; border-radius: 6px; overflow: hidden; background: var(--med-line); }
.bar i { display: block; } .bar .hc { background: var(--med-hc); } .bar .hp { background: var(--med-hp); }
.split-l { display: flex; justify-content: space-between; font-size: .78rem; margin-top: 6px; }
.k-hc { color: var(--med-hc-text, #8fb0f0); } .k-hp { color: var(--med-hp-text, #eaa070); }

.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 10px 12px 0; }
@container (min-width: 620px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
@container (min-width: 620px) { .tiles.six { grid-template-columns: repeat(3, 1fr); } }
.tile { padding: 12px; border-radius: 12px; border: 1px solid var(--med-line); }
.tile-l { font-size: .78rem; color: var(--med-muted); }
.tile-v { font-size: 1.35rem; font-weight: 700; margin-top: 2px; }
.tile-n { font-size: .72rem; color: var(--med-muted); margin-top: 4px; }

.chart { margin: 14px 12px 0; }
.chart-h { display: flex; justify-content: space-between; font-size: .82rem; color: var(--med-muted); margin: 0 4px 6px; }
.legend { display: flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-left: 6px; }
.legend .k-hc { background: var(--med-hc); } .legend .k-hp { background: var(--med-hp); }
.chart-h { flex-wrap: wrap; row-gap: 4px; }
.chart-h > span:first-child, .legend .legend-t { white-space: nowrap; }
.legend .legend-t { margin-right: 2px; }
.legend i.pair { margin-left: 2px; }
.chart svg { width: 100%; height: 130px; display: block; }
.chart rect.hc { fill: var(--med-hc); } .chart rect.hp { fill: var(--med-hp); }
.chart rect.partial { fill: var(--med-muted); opacity: .35; }
.chart rect.base { fill: var(--med-base, var(--med-hc)); }
.legend .k-base { background: var(--med-base, var(--med-hc)); }
.chart g.est { opacity: .45; }
.chart rect.sel { fill: rgba(255,255,255,.06); }
.chart rect.hit { fill: transparent; cursor: pointer; }
.days { display: grid; margin-top: 4px; }
/* échelle des graphiques : colonne des valeurs à gauche, lignes horizontales discrètes */
.plot { position: relative; }
.chart.scaled { --axis: 32px; }
.chart.scaled .plot, .chart.scaled .days, .chart.scaled .zl-hl { margin-left: var(--axis); }
.axis { position: absolute; top: 0; bottom: 0; left: calc(-1 * var(--axis)); width: calc(var(--axis) - 5px); pointer-events: none; }
.axis span { position: absolute; right: 0; transform: translateY(-50%); font-size: calc(.62rem * var(--fs, 1)); line-height: 1;
  color: var(--med-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.axis span:first-child { transform: translateY(-100%); }
.chart line.grid { stroke: var(--med-line); stroke-width: 1; stroke-dasharray: 3 3; }
.day { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 4px 0; border-radius: 8px; font-size: .68rem; color: var(--med-muted); text-transform: capitalize; }
.day b { color: var(--med-text); font-size: .78rem; }
.day .dot { width: 6px; height: 6px; margin-top: 2px; }
.day.on { background: var(--med-surface); }
.day:focus-visible { outline: 2px solid var(--med-accent, var(--med-blue)); }

.detail { margin: 8px 12px 0; padding: 10px 12px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); }
.detail-h { display: flex; align-items: center; gap: 8px; font-size: .8rem; color: var(--med-muted); }
.tag { padding: 1px 8px; border-radius: 999px; font-size: .72rem; font-weight: 700; color: #0f1724; }
.tag.t-blue { background: var(--t-blue); color: #fff; } .tag.t-white { background: var(--t-white); } .tag.t-red { background: var(--t-red); color: #fff; }
.detail-v { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 4px; font-size: .9rem; }
.sep { width: 1px; height: 12px; background: var(--med-line); }
.detail-p { font-size: .78rem; color: var(--med-muted); margin-top: 4px; }
.warn { color: var(--t-red); font-style: normal; font-weight: 600; }

.power { margin: 10px 12px 0; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--med-line); }
.power.is-over { border-color: var(--t-red); }
.power-t { display: flex; justify-content: space-between; font-size: .85rem; }
.gauge { height: 6px; border-radius: 6px; background: var(--med-line); margin: 8px 0 6px; overflow: hidden; }
.gauge i { display: block; height: 100%; background: linear-gradient(90deg, var(--med-green), var(--med-accent, var(--med-blue))); }
.is-over .gauge i { background: var(--t-red); }
.power-n { font-size: .75rem; color: var(--med-muted); }

.eco { margin: 10px 12px 0; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--med-line); font-size: .82rem; display: flex; align-items: center; gap: 8px; }
.eco.e-ok .dot { background: var(--med-down); }
.eco.e-warn { border-color: #f0a33a; } .eco.e-warn .dot { background: #f0a33a; }
.eco.e-alert { border-color: var(--t-red); } .eco.e-alert .dot { background: var(--t-red); }
.eco-l { color: var(--med-muted); }
footer { padding: 10px 18px 14px; font-size: .7rem; color: var(--med-muted); }
.empty { padding: 18px; display: flex; flex-direction: column; gap: 6px; font-size: .9rem; }
.empty span { color: var(--med-muted); }
/* Thème Home Assistant : fond, textes et bordures suivent le thème clair ou sombre */
ha-card.th-ha {
  /* accent (icônes, onglets, sélections, contours) : couleur principale du thème ; les bleus porteurs de sens restent bleus */
  --med-accent: var(--primary-color, #1d93e3);
  --med-on-accent: var(--text-primary-color, #fff);
  --med-bg: var(--ha-card-background, var(--card-background-color, #fff));
  --med-surface: color-mix(in srgb, var(--primary-text-color, #000) 5%, transparent);
  --med-line: var(--divider-color, rgba(127, 127, 127, .25));
  --med-text: var(--primary-text-color, #1f2937);
  --med-muted: var(--secondary-text-color, #6b7280);
  border-radius: var(--ha-card-border-radius, 12px);
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
}
ha-card.th-ha.light { --med-green: #4c8a0b; --med-up: #c2560f; --med-down: #1d8a4b; }
/* Style MyElectricalData en version claire (theme: auto quand Home Assistant est en mode clair) */
ha-card.th-v2.light {
  --med-bg: #ffffff; --med-surface: #f2f5f9; --med-line: #dbe2ec;
  --med-text: #1a2434; --med-muted: #5b6b82;
  --med-green: #4c8a0b; --med-blue: #1673b8; --med-up: #c2560f; --med-down: #1d8a4b;
  box-shadow: 0 1px 3px rgba(26, 36, 52, .08);
}
ha-card.light .k-hc { color: var(--med-hc-text, #2f5fb8); }
ha-card.light .k-hp { color: var(--med-hp-text, #b35619); }
ha-card.light .t-white .dot, ha-card.light .tag.t-white { box-shadow: inset 0 0 0 1px #aab3c0; }
ha-card.light .chart rect.sel { fill: rgba(0, 0, 0, .05); }
ha-card.light .tag.t-white { color: #1f2937; }
@media (max-width: 420px) { .hero-v { font-size: 2rem; } .tempo { width: 100%; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
.tiles.h3 { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, auto); grid-auto-flow: column; }
.tiles.h3 .tile { padding: 8px 10px; min-width: 0; }
@container (max-width: 420px) { .tiles.h3 .tile-v { font-size: 1.1rem; } .tiles.h3 .tile-n { font-size: .66rem; } }
</style>`;
// Variable --fs (réglage « taille de la police ») : sans réglage elle vaut 1 et rien ne change.
const STYLE = STYLE_BASE.replace(/(-?\d*\.?\d+)rem/g, "calc($1rem * var(--fs, 1))");

/* ----------------------------------------------------------------- éditeur */

const SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "sensor" } } },
  { name: "title", selector: { text: {} } },
  {
    name: "days",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "7", label: "7 jours" },
          { value: "14", label: "14 jours" },
          { value: "31", label: "31 jours" },
        ],
      },
    },
  },
  { name: "subscribed_power", selector: { number: { min: 3, max: 36, step: 3, mode: "box", unit_of_measurement: "kVA" } } },
  // Prix de son contrat, quand ils ne sont pas dans MyElectricalData (facultatifs)
  { name: "subscription_price", selector: { number: { min: 0, max: 200, step: 0.01, mode: "box", unit_of_measurement: "€/mois" } } },
  { name: "hc_price", selector: { number: { min: 0, max: 2, step: 0.0001, mode: "box", unit_of_measurement: "€/kWh" } } },
  { name: "hp_price", selector: { number: { min: 0, max: 2, step: 0.0001, mode: "box", unit_of_measurement: "€/kWh" } } },
  { name: "base_price", selector: { number: { min: 0, max: 2, step: 0.0001, mode: "box", unit_of_measurement: "€/kWh" } } },
  {
    name: "theme",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "v2", label: "Style MyElectricalData (bleu nuit)" },
          { value: "auto", label: "Style MyElectricalData, clair ou sombre selon Home Assistant" },
          { value: "ha", label: "Thème Home Assistant (clair ou sombre)" },
        ],
      },
    },
  },
  { name: "show_cost", selector: { boolean: {} } },
  { name: "show_pdl", selector: { boolean: {} } },
  { name: "show_tempo", selector: { boolean: {} } },
  { name: "show_ecowatt", selector: { boolean: {} } },
  { name: "show_week", selector: { boolean: {} } },
  { name: "tiles_horizontal", selector: { boolean: {} } },
  { name: "show_power", selector: { boolean: {} } },
  { name: "font_size", selector: { number: { min: 70, max: 150, step: 5, mode: "slider", unit_of_measurement: "%" } } },
  { name: "tempo_today", selector: { entity: { domain: "sensor" } } },
  { name: "tempo_tomorrow", selector: { entity: { domain: "sensor" } } },
  { name: "tempo_info", selector: { entity: { domain: "sensor" } } },
  { name: "ecowatt", selector: { entity: { domain: "sensor" } } },
  { name: "price_prefix", selector: { text: {} } },
];

const LABELS = {
  entity: "Consommation (sensor.linky_<pdl>_consumption)",
  title: "Titre",
  days: "Historique affiché",
  subscribed_power: "Puissance souscrite (kVA du compteur)",
  subscription_price: "Abonnement mensuel TTC (facultatif : ajouté au coût, au prorata des jours)",
  theme: "Couleurs de la carte",
  show_cost: "Afficher les coûts estimés",
  show_pdl: "Afficher le numéro de PDL",
  show_tempo: "Afficher Tempo (couleurs d'aujourd'hui et de demain, jours restants, pastilles du graphique, coût aux prix Tempo) : à couper sans contrat Tempo",
  show_ecowatt: "Afficher EcoWatt",
  show_week: "Afficher la semaine en cours et la semaine dernière",
  tiles_horizontal: "Cases en 3 colonnes (avec la semaine)",
  show_power: "Afficher la puissance maximale sur la période",
  font_size: "Taille de la police (100 % = taille d'origine)",
  tempo_today: "Tempo aujourd'hui",
  tempo_tomorrow: "Tempo demain",
  tempo_info: "Tempo, jours restants",
  ecowatt: "EcoWatt (masqué si indisponible)",
  price_prefix: "Préfixe des capteurs de prix Tempo",
  hc_price: "Prix du kWh en heures creuses, TTC (facultatif : remplace celui de l'offre)",
  hp_price: "Prix du kWh en heures pleines, TTC (facultatif : remplace celui de l'offre)",
  base_price: "Prix du kWh, option Base, TTC (facultatif)",
};


const WHEEL_STYLE = `<style>
.med-colors { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 16px; }
.med-colors[hidden] { display: none; }
.med-color { border: 1px solid var(--divider-color, #e0e0e0); border-radius: 12px; padding: 12px; min-width: 0; }
.med-color-t { font-weight: 500; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.med-color-t i { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--divider-color, #ccc); flex: none; }
.med-wheel { position: relative; width: 180px; max-width: 100%; aspect-ratio: 1; margin: 0 auto; border-radius: 50%;
  touch-action: none; cursor: crosshair;
  background: radial-gradient(circle closest-side, #fff, rgba(255, 255, 255, 0)),
    conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red); }
.med-wheel .shade { position: absolute; inset: 0; border-radius: 50%; background: #000; pointer-events: none; }
.med-wheel .dot { position: absolute; width: 18px; height: 18px; margin: -11px 0 0 -11px; border-radius: 50%;
  border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, .5), 0 1px 4px rgba(0, 0, 0, .4); pointer-events: none; }
.med-color label { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: .9rem; }
.med-color input[type=range] { flex: 1; min-width: 0; width: 100%; accent-color: var(--primary-color, #03a9f4); }
.med-color-r { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.med-color-r input[type=text] { flex: 1; min-width: 0; font: inherit; padding: 6px 8px; border-radius: 6px;
  border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: var(--primary-text-color, #000); }
.med-color-r button { font: inherit; font-size: .85rem; padding: 6px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--divider-color, #ccc); background: transparent; color: var(--primary-color, #03a9f4); }
.med-color small { display: block; margin-top: 6px; color: var(--secondary-text-color, #666); }
.med-tempo-t { display: flex; align-items: center; gap: 8px; margin-top: 16px; font-weight: 500; cursor: pointer; }
.med-small { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-top: 10px; }
.med-small .med-color { padding: 10px; }
.med-small .med-wheel { width: 120px; }
/* Colonnes étroites : luminosité sous son libellé, code et bouton l'un sous l'autre */
.med-small .med-color label { flex-direction: column; align-items: stretch; gap: 4px; font-size: .8rem; }
.med-small .med-color-r { flex-wrap: wrap; }
.med-small .med-color-r input[type=text], .med-small .med-color-r button { flex: 1 1 100%; }
.med-small .med-color-r button { padding: 6px 8px; }
</style>`;

function makeEditor(schema, labels, defaults, colors = []) {
  const hasDays = schema.some((s) => s.name === "days");
  return class extends HTMLElement {
    setConfig(config) {
      this._config = { ...config };
      this._draw();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._form) this._form.hass = hass;
      else this._draw();
    }

    _draw() {
      if (!this._hass || !this._config) return;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => labels[s.name] || s.name;
        this._form.addEventListener("value-changed", (ev) => {
          const v = { ...ev.detail.value };
          if (hasDays && v.days !== undefined) v.days = Number(v.days);
          // Les couleurs se règlent avec les roues, hors du formulaire : garder la valeur en cours
          for (const c of colors) {
            if (this._config[c.key] !== undefined) v[c.key] = this._config[c.key];
            else delete v[c.key];
          }
          this._config = v;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      this._form.schema = schema;
      this._form.data = hasDays
        ? { ...defaults, ...this._config, days: String(this._config.days || defaults.days) }
        : { ...defaults, ...this._config };
      if (colors.length) this._drawColors();
    }

    _emit() {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }

    /** Enregistre une couleur (null : retour à la couleur par défaut, l'option disparaît du YAML). */
    _setColor(key, hex) {
      const v = { ...this._config };
      if (hex) v[key] = hex;
      else delete v[key];
      this._config = v;
      // Les roues Tempo non réglées suivent les couleurs HC / HP générales : tout repeindre
      for (const c of colors) this._paintColor(c.key);
      this._emit();
    }

    /** Couleur affichée quand l'option n'est pas réglée : la sienne par défaut, ou celle de l'option de repli. */
    _fallbackHex(c) {
      if (!c.fallback) return c.def;
      const base = colors.find((x) => x.key === c.fallback);
      return toHex(this._config[c.fallback]) || base.def;
    }

    _drawColors() {
      if (!this._colors) {
        const block = (c) => {
          const small = c.group === "tempo";
          const def = c.fallback ? `couleur ${c.key.slice(0, 2).toUpperCase()} ci-dessus` : c.def;
          return `
          <div class="med-color" data-key="${c.key}">
            <div class="med-color-t"><i></i>${esc(c.label)}</div>
            <div class="med-wheel"><div class="shade"></div><div class="dot"></div></div>
            <label>Luminosité <input type="range" min="10" max="100" step="1"></label>
            <div class="med-color-r"><input type="text" spellcheck="false" aria-label="Code couleur">
              <button type="button">${small ? "Par défaut" : "Couleur par défaut"}</button></div>
            <small>Par défaut : ${def}</small>
          </div>`;
        };
        const main = colors.filter((c) => !c.group);
        const tempo = colors.filter((c) => c.group === "tempo");
        this._colors = document.createElement("div");
        this._colors.innerHTML = WHEEL_STYLE + `<div class="med-colors">${main.map(block).join("")}</div>${
          tempo.length
            ? `<label class="med-tempo-t"><input type="checkbox"> Couleurs selon la couleur Tempo du jour (6 roues)</label>
               <div class="med-colors med-small" hidden>${tempo.map(block).join("")}</div>`
            : ""}`;
        this.appendChild(this._colors);
        for (const c of colors) this._bindColor(c);
        const toggle = this._colors.querySelector(".med-tempo-t input");
        if (toggle) {
          const grid = this._colors.querySelector(".med-small");
          toggle.checked = tempo.some((c) => this._config[c.key] !== undefined);
          grid.hidden = !toggle.checked;
          toggle.addEventListener("change", () => {
            grid.hidden = !toggle.checked;
            // Décocher retire les six couleurs Tempo : la carte reprend les couleurs HC / HP générales
            if (!toggle.checked && tempo.some((c) => this._config[c.key] !== undefined)) {
              const v = { ...this._config };
              for (const c of tempo) delete v[c.key];
              this._config = v;
              for (const c of colors) this._paintColor(c.key);
              this._emit();
            }
          });
        }
      }
      for (const c of colors) this._paintColor(c.key);
    }

    _bindColor(c) {
      const box = this._colors.querySelector(`[data-key="${c.key}"]`);
      const wheel = box.querySelector(".med-wheel");
      const range = box.querySelector("input[type=range]");
      const text = box.querySelector("input[type=text]");
      const current = () => hexToHsv(toHex(this._config[c.key]) || this._fallbackHex(c));
      const pick = (ev) => {
        const r = wheel.getBoundingClientRect();
        const dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
        const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        const sat = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
        this._setColor(c.key, hsvToHex(h, sat, current().v || 1));
      };
      wheel.addEventListener("pointerdown", (ev) => {
        wheel.setPointerCapture(ev.pointerId);
        this._dragging = c.key;
        pick(ev);
      });
      wheel.addEventListener("pointermove", (ev) => { if (this._dragging === c.key) pick(ev); });
      const stop = () => { this._dragging = null; };
      wheel.addEventListener("pointerup", stop);
      wheel.addEventListener("pointercancel", stop);
      range.addEventListener("input", () => {
        const { h, s } = current();
        this._setColor(c.key, hsvToHex(h, s, Number(range.value) / 100));
      });
      text.addEventListener("change", () => {
        const v = text.value.trim();
        if (!v) return this._setColor(c.key, null);
        const hex = toHex(v.startsWith("#") ? v : `#${v}`) || toHex(v);
        if (hex) this._setColor(c.key, hex);
        else this._paintColor(c.key);
      });
      box.querySelector("button").addEventListener("click", () => this._setColor(c.key, null));
    }

    _paintColor(key) {
      const c = colors.find((x) => x.key === key);
      const box = this._colors?.querySelector(`[data-key="${key}"]`);
      if (!c || !box) return;
      const chosen = toHex(this._config[key]);
      const hex = chosen || this._fallbackHex(c);
      const { h, s, v } = hexToHsv(hex);
      const dot = box.querySelector(".dot");
      const rad = (h * Math.PI) / 180;
      dot.style.left = `${50 + 50 * s * Math.cos(rad)}%`;
      dot.style.top = `${50 + 50 * s * Math.sin(rad)}%`;
      dot.style.background = hex;
      box.querySelector(".shade").style.opacity = String(1 - v);
      box.querySelector(".med-color-t i").style.background = hex;
      const range = box.querySelector("input[type=range]");
      if (document.activeElement !== range && this._dragging !== key) range.value = String(Math.round(v * 100));
      const text = box.querySelector("input[type=text]");
      const raw = this._config[key];
      if (document.activeElement !== text) text.value = raw === undefined ? "" : typeof raw === "string" ? raw : chosen || "";
      text.placeholder = this._fallbackHex(c);
    }
  };
}

/* ------------------------------------------- présentation de la carte ZLinky */

const ZL_STYLE = `<style>
ha-card { position: relative; display: block; }
.zl-msg { position: absolute; inset: 0; z-index: 5; display: flex; align-items: flex-start; justify-content: center; padding: 56px 14px 14px;
  background: color-mix(in srgb, var(--med-bg) 55%, transparent); backdrop-filter: blur(2px); border-radius: inherit; }
.zl-msg-box { display: flex; gap: 10px; align-items: flex-start; width: 100%; max-width: 440px; padding: 14px; border-radius: 14px;
  background: var(--med-bg); border: 2px solid #f0a33a; box-shadow: 0 10px 30px rgba(0, 0, 0, .45); color: var(--med-text); }
.zl-msg-box svg { width: 28px; height: 28px; flex: none; fill: #f0a33a; }
.zl-msg-t { display: grid; gap: 4px; flex: 1; min-width: 0; }
.zl-msg-t strong { font-size: calc(.95rem * var(--fs, 1)); }
.zl-msg-t span { font-size: calc(1.05rem * var(--fs, 1)); font-weight: 700; letter-spacing: .02em; overflow-wrap: anywhere; }
.zl-msg-t small { font-size: calc(.72rem * var(--fs, 1)); color: var(--med-muted); }
.zl-msg-x { flex: none; width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--med-line); background: var(--med-surface);
  color: var(--med-text); font-size: 1.3rem; line-height: 1; cursor: pointer; }
.zl-msg-x:hover, .zl-msg-x:focus-visible { border-color: #f0a33a; outline: none; }
.zl-meter { margin: 10px 12px 0; display: grid; gap: 6px; }
.zl-det { margin: 10px 12px 0; border: 1px solid var(--med-line); border-radius: 12px; overflow: hidden; }
.zl-det table { width: 100%; border-collapse: collapse; font-size: calc(.82rem * var(--fs, 1)); }
.zl-det th, .zl-det td { padding: 8px 12px; text-align: right; border-bottom: 1px solid var(--med-line); white-space: nowrap; }
.zl-det th:first-child, .zl-det td:first-child { text-align: left; white-space: normal; }
.zl-det th { color: var(--med-muted); font-weight: 500; font-size: calc(.74rem * var(--fs, 1)); }
.zl-det tfoot td { font-weight: 700; border-bottom: 0; background: var(--med-surface); }
.zl-sw { display: inline-block; width: 22px; height: 12px; border-radius: 3px; margin-right: 10px; vertical-align: middle; }
.zl-sw.k-hc { background: var(--med-hc); } .zl-sw.k-hp { background: var(--med-hp); } .zl-sw.k-base { background: var(--med-base, var(--med-hc)); }
.zl-sw.k-hc.tb-blue { background: var(--med-hc-blue, var(--med-hc)); } .zl-sw.k-hp.tb-blue { background: var(--med-hp-blue, var(--med-hp)); }
.zl-sw.k-hc.tb-white { background: var(--med-hc-white, var(--med-hc)); } .zl-sw.k-hp.tb-white { background: var(--med-hp-white, var(--med-hp)); }
.zl-sw.k-hc.tb-red { background: var(--med-hc-red, var(--med-hc)); } .zl-sw.k-hp.tb-red { background: var(--med-hp-red, var(--med-hp)); }
.zl-sw.zl-sub { background: #f1f5f9; box-shadow: inset 0 0 0 1px #94a3b8; }
/* colonne gauche du bloc du jour : peut rétrécir (la date passe à la ligne) sans pousser le coût hors de la carte */
.hero { grid-template-columns: minmax(0, 1fr) auto; }
/* carte étroite : le coût passe sous la consommation au lieu de serrer la date */
@container (max-width: 400px) {
  .hero { grid-template-columns: minmax(0, 1fr); }
  .hero-r { text-align: left; }
  .hero-r .cost-l { max-width: none; }
}
.zl-nav .hero-l em { font-style: normal; white-space: nowrap; }
.zl-nav { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; min-width: 0; }
.zl-nav .hero-l { min-width: 0; }
.zl-btn { border: 1px solid var(--med-line); background: var(--med-surface); color: var(--med-text); border-radius: 999px;
  min-width: 30px; height: 28px; padding: 0 9px; font: inherit; font-size: calc(.95rem * var(--fs, 1)); line-height: 1; cursor: pointer; }
.zl-btn:hover:not([disabled]), .zl-btn:focus-visible { border-color: var(--med-blue); outline: none; }
.zl-btn[disabled] { opacity: .35; cursor: default; }
.zl-btn.zl-today { font-size: calc(.72rem * var(--fs, 1)); color: var(--med-blue); padding: 0 8px; flex: none; }
.zl-btn { flex: none; }
.zl-hours svg { height: 90px; }
.zl-hl { display: flex; justify-content: space-between; font-size: calc(.68rem * var(--fs, 1)); color: var(--med-muted); padding: 2px 2px 0; }
.zl-wait { font-size: calc(.78rem * var(--fs, 1)); color: var(--med-muted); padding: 10px 2px; }
.zl-row { display: flex; flex-wrap: wrap; gap: 6px; }
.zl-ratio { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; margin-top: 2px; padding-top: 8px;
  border-top: 1px dashed var(--med-line); font-size: calc(.78rem * var(--fs, 1)); }
.zl-ratio-t { color: var(--med-muted); }
.zl-ratio > span[title] { display: inline-flex; align-items: baseline; gap: 6px; }
.zl-ratio small { font-size: calc(.72rem * var(--fs, 1)); color: var(--med-muted); }
.zl-ratio b { font-size: calc(.95rem * var(--fs, 1)); font-weight: 700; color: var(--med-hc-text, #8fb0f0); }
ha-card.light .zl-ratio b { color: var(--med-hc-text, #2f5fb8); }
.zl-fold { display: grid; gap: 6px; }
.zl-fold-w { margin: 10px 12px 0; }
.zl-fold-h { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border: 1px solid var(--med-line); border-radius: 10px;
  background: transparent; color: var(--med-muted); font: inherit; font-size: calc(.78rem * var(--fs, 1)); cursor: pointer; text-align: left; }
.zl-fold-h:hover, .zl-fold-h:focus-visible { border-color: var(--med-blue); color: var(--med-text); outline: none; }
.zl-fold-h em { margin-left: auto; font-style: normal; font-weight: 700; color: var(--med-text); }
.zl-fold-c { display: inline-block; transition: transform .15s; font-size: 1.1em; line-height: 1; }
.zl-fold.open .zl-fold-c { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .zl-fold-c { transition: none; } }
.zl-chip { flex: 1 1 auto; min-width: 92px; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--med-line);
  background: var(--med-surface); display: flex; flex-direction: column; gap: 1px; }
.zl-chip span { font-size: calc(.7rem * var(--fs, 1)); color: var(--med-muted); white-space: nowrap; }
.zl-chip b { font-size: calc(.86rem * var(--fs, 1)); font-weight: 700; white-space: nowrap; }
.zl-chip.k-hc { border-color: color-mix(in srgb, var(--med-hc) 55%, var(--med-line)); }
.zl-chip.k-hp { border-color: color-mix(in srgb, var(--med-hp) 55%, var(--med-line)); }
.zl-chip.k-hc b { color: var(--med-hc-text, #8fb0f0); }
.zl-chip.k-hp b { color: var(--med-hp-text, #eaa070); }
ha-card.light .zl-chip.k-hc b { color: var(--med-hc-text, #2f5fb8); }
ha-card.light .zl-chip.k-hp b { color: var(--med-hp-text, #b35619); }
.zl-chip[class*="tb-"] span::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
.zl-chip.tb-blue span::before { background: #3b82f6; }
.zl-chip.tb-white span::before { background: #f1f5f9; box-shadow: 0 0 0 1px #94a3b8; }
.zl-chip.tb-red span::before { background: #ef4444; }
</style>`;

/** Lectures partagées entre toutes les cartes ZLinky de la page (tableau de bord et aperçu de l'éditeur) :
 *  une même demande n'est envoyée qu'une fois par période de validité. L'historique de Home Assistant traite
 *  les lectures une par une : des lectures en double font attendre toutes les cartes de statistiques. */
const ZL_SHARED = new Map();
const zlShared = (key, ttl, fn) => {
  const hit = ZL_SHARED.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = fn();
  ZL_SHARED.set(key, { at: Date.now(), promise });
  promise.catch(() => { if (ZL_SHARED.get(key)?.promise === promise) ZL_SHARED.delete(key); });
  return promise;
};

/* ====================================================================== Gaz */

const FLAME_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="flame" d="M16 3.5c1.2 4.2 6.8 7.4 6.8 14a6.8 6.8 0 0 1-13.6 0c0-3.4 1.7-5.6 3.3-7.3.3 2 1.4 3.4 2.7 3.9-.9-3.8.1-7.6.8-10.6z"/><path class="core" d="M16 28.2a3.5 3.5 0 0 1-3.5-3.5c0-2.2 1.9-3.4 2.6-5.3 1.6 1.5 4.4 3 4.4 5.3a3.5 3.5 0 0 1-3.5 3.5z"/></svg>`;

/** Lecture des statistiques et conversions du compteur de gaz. */
const GZ = {
  DAY: 86400000,
  HOUR: 3600000,
  dayOf: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
  key: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  /** Début d'une ligne de statistiques : nombre (ms ou s) ou date ISO selon la version de Home Assistant. */
  start(row) {
    let t = typeof row.start === "number" ? row.start : Date.parse(row.start);
    if (Number.isFinite(t) && t < 1e12) t *= 1000;
    return new Date(t);
  },
  num(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
    return Number.isFinite(n) ? n : null;
  },
  /** Nature du compteur d'après son unité : volume (m³, L), énergie (Wh, kWh, MWh) ou impulsions (sans unité). */
  kind(st) {
    const u = String(st?.attributes?.unit_of_measurement || "").trim();
    if (/^(m³|m3|l|L)$/.test(u)) return "volume";
    if (/^(Wh|kWh|MWh)$/.test(u)) return "energy";
    return "raw";
  },
  /** Nature retenue pour le compteur : celle imposée par l'option « meter » (m3, kwh, pulses), sinon celle de
   *  son unité. Quand elle contredit l'unité (ZiPulses réglé par défaut : des impulsions étiquetées « kWh »),
   *  les statistiques sont lues telles quelles, sans conversion d'unité par Home Assistant. */
  meterOf(st, meter) {
    const natural = GZ.kind(st);
    const forced = { m3: "volume", kwh: "energy", pulses: "raw" }[meter] || null;
    const kind = forced || natural;
    const asIs = forced !== null && forced !== natural;
    const units = asIs ? null : kind === "volume" ? { volume: "m³" } : kind === "energy" ? { energy: "kWh" } : null;
    return { kind, natural, units, asIs };
  },
  /** Valeur du compteur dans l'unité des statistiques lues : m³ (volume, impulsions × volume par impulsion) ou kWh. */
  native(st, pulse, m = GZ.meterOf(st)) {
    const v = GZ.num(st?.state);
    if (v === null) return null;
    if (m.kind === "raw") return v * pulse;
    if (m.asIs) return v;
    const u = String(st.attributes?.unit_of_measurement || "").trim();
    if (u === "L" || u === "l" || u === "Wh") return v / 1000;
    if (u === "MWh") return v * 1000;
    return v;
  },
  /** Coefficient de conversion (kWh par m³) d'une entité : son état, ou le dernier relevé de l'intégration
   *  home-assistant-gazpar (attribut daily, « converter_factor_kwh/m3 »). */
  factorOf(st) {
    if (!st) return null;
    const v = GZ.num(st.state);
    if (v !== null && v > 5 && v < 15) return v;
    const daily = Array.isArray(st.attributes?.daily) ? st.attributes.daily : [];
    const date = (s) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || "")); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; };
    let best = null, at = -1;
    for (const d of daily) {
      const f = GZ.num(d?.["converter_factor_kwh/m3"] ?? d?.conversion_factor);
      const t = date(d?.time_period);
      if (f !== null && f > 5 && f < 15 && t >= at) { best = f; at = t; }
    }
    return best;
  },
  /** Prix du gaz dans le tableau Énergie de Home Assistant pour cette statistique (nombre fixe ou entité de prix). */
  energyPrice(prefs, statId, hass) {
    let found = null;
    const walk = (o) => {
      if (found !== null || !o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (o.stat_energy_from === statId) {
        const n = positivePrice(o.number_energy_price);
        const e = o.entity_energy_price ? positivePrice(hass?.states?.[o.entity_energy_price]?.state) : null;
        found = e ?? n;
        return;
      }
      Object.values(o).forEach(walk);
    };
    walk(prefs);
    return found;
  },
};

const GZ_DEFAULTS = {
  title: "Gaz",
  entity: "",
  meter: "auto",
  pulse_volume: 0.01,
  index_offset: null,
  conversion_factor: null,
  conversion_entity: "",
  price: null,
  price_entity: "",
  energy_prices: true,
  subscription_price: null,
  flow_entity: "",
  unit: "auto",
  days: 14,
  live_minutes: 5,
  show_cost: true,
  show_details: true,
  show_scale: true,
  show_live: true,
  show_totals: true,
  show_chart: true,
  live_open: true,
  totals_open: true,
  chart_open: true,
  show_week: false,
  tiles_horizontal: false,
  theme: "v2",
  font_size: 100,
};

const GZ_STYLE = `<style>
ha-card.gas { --med-gas: #ff8f3d; --med-gas-core: #ffd25a; }
ha-card.gas.light { --med-gas: #d4630f; --med-gas-core: #e0a10a; }
.brand .flame { fill: var(--med-gas); } .brand .core { fill: var(--med-gas-core); }
.chart rect.gasb { fill: var(--gz-color, var(--med-gas)); }
.legend .k-gas { background: var(--gz-color, var(--med-gas)); }
.zl-sw.k-gas { background: var(--gz-color, var(--med-gas)); }
.gz-alt { font-size: calc(.85rem * var(--fs, 1)); color: var(--med-muted); margin-top: 2px; }
.gz-live { display: inline-flex; align-items: center; gap: 6px; }
.gz-live .dot.on { background: var(--med-gas); box-shadow: 0 0 0 3px color-mix(in srgb, var(--med-gas) 30%, transparent); animation: gz-pulse 1.6s infinite; }
@keyframes gz-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .gz-live .dot.on { animation: none; } }
.zl-chip.k-gas { border-color: color-mix(in srgb, var(--gz-color, var(--med-gas)) 55%, var(--med-line)); }
.zl-chip.k-gas b { color: var(--gz-color, var(--med-gas)); }
.gz-warn { margin: 10px 12px 0; padding: 8px 12px; border-radius: 12px; border: 1px solid #f0a33a; font-size: calc(.78rem * var(--fs, 1)); }
</style>`;

/** Statistiques relues toutes les 5 minutes : la consommation du jour, elle, suit l'état du compteur en direct. */
const GZ_RELOAD = 5 * 60000;
const GZ_TIMEOUT = 60000;
const GZ_DAILY_KEEP = 2;

/** Consommation par jour depuis le 1er janvier de l'an dernier. Les jours terminés ne changent plus : ils sont
 *  gardés par le navigateur et seuls les derniers jours sont redemandés (lecture lourde une seule fois). */
async function gzDaily(call, id, units, yearStart) {
  const key = `gazpar-card:jours:v1:${id}:${JSON.stringify(units || "impulsions")}`;
  const today = GZ.dayOf(new Date()).getTime();
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { kept = null; }
  const usable = kept && kept.from <= yearStart.getTime() && Array.isArray(kept.rows);
  const from = usable ? new Date(Math.max(kept.from, kept.through - GZ_DAILY_KEEP * GZ.DAY)) : yearStart;
  const fresh = (await call(from, "day", ["change"], [id], units)) || {};
  const old = usable ? kept.rows.filter((r) => r.start < from.getTime()) : [];
  const recent = (fresh[id] || []).map((r) => ({ start: GZ.start(r).getTime(), change: r.change }));
  const rows = [...old, ...recent].filter((r) => r.start >= yearStart.getTime());
  try {
    localStorage.setItem(key, JSON.stringify({ from: yearStart.getTime(), through: today, rows: rows.filter((r) => r.start < today) }));
  } catch (e) { /* stockage indisponible */ }
  return rows;
}

/** Compteurs de gaz proposés par l'éditeur et le message d'erreur : volume, énergie de classe gaz, ou nom parlant. */
const gzCandidates = (hass) =>
  Object.entries(hass?.states || {})
    .filter(([id, st]) => id.startsWith("sensor.") && (st.attributes?.device_class === "gas"
      || (/gaz|gas|gazpar|zipulse|pulse/i.test(id) && ["total_increasing", "total"].includes(st.attributes?.state_class))))
    .map(([id]) => id);

class GazparCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("gazpar-card-editor");
  }

  /** Repère le compteur de gaz (m³ de préférence), le coefficient et le prix saisis à la main (input_number). */
  static getStubConfig(hass) {
    const ids = gzCandidates(hass);
    const vol = ids.find((id) => GZ.kind(hass.states[id]) === "volume");
    const all = Object.keys(hass?.states || {});
    const find = (re) => all.find((id) => re.test(id)) || "";
    return {
      entity: vol || ids[0] || "",
      conversion_entity: find(/^input_number\..*(conversion|coef).*(gaz|gas)|^input_number\..*(gaz|gas).*(conversion|coef)/i)
        || (hass?.states?.["sensor.gazpar"] ? "sensor.gazpar" : ""),
      price_entity: find(/^input_number\..*(prix|price).*(gaz|gas)|^input_number\..*(gaz|gas).*(prix|price)/i),
    };
  }

  setConfig(config) {
    const c = { ...GZ_DEFAULTS, ...(config || {}) };
    if (!c.entity) throw new Error("Indiquez le compteur de gaz (entity) : un capteur cumulé en m³ ou en kWh, avec des statistiques.");
    this._config = { ...c, days: Number(c.days || GZ_DEFAULTS.days) };
    this._sig = null;
    // un réglage d'affichage ne relit pas les statistiques : seulement un changement du compteur ou de l'unité
    const dataKey = JSON.stringify([c.entity, c.meter, c.pulse_volume, !!(c.show_cost && c.energy_prices !== false)]);
    if (dataKey !== this._lastDataKey) {
      this._lastDataKey = dataKey;
      this._selected = 0;
      this._stats = null;
      this._hours = {};
      this._loadedAt = 0;
    }
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const fold = ev.target.closest("[data-fold]");
        if (fold) {
          const k = fold.dataset.fold;
          this._folds = { ...this._folds, [k]: { open: !this._isOpen(k), cfg: this._config[`${k}_open`] !== false } };
          try { localStorage.setItem("gazpar-card:sections", JSON.stringify(this._folds)); } catch (e) { /* stockage indisponible */ }
          this._render(true);
          return;
        }
        const nav = ev.target.closest("[data-nav]");
        if (nav) {
          const max = Math.max(0, (this._all?.length || 1) - 1);
          const n = nav.dataset.nav;
          this._selected = n === "today" ? 0 : n === "prev" ? Math.min(max, this._selected + 1) : Math.max(0, this._selected - 1);
          this._render(true);
          this._loadHours();
          return;
        }
        const t = ev.target.closest("[data-i]");
        if (!t) return;
        this._selected = Number(t.dataset.i);
        this._render(true);
        this._loadHours();
      });
    }
    this._render(true);
  }

  set hass(hass) {
    this._hass = hass;
    const st = this._state(this._config?.entity);
    // unité du compteur changée (m³ ↔ kWh) : les statistiques lues ne correspondent plus, relecture
    if (st && this._stats && this._stats.rawKind !== this._meterKey()) { this._stats = null; this._loadedAt = 0; }
    if (!this._loading && Date.now() - (this._loadedAt || 0) > GZ_RELOAD && st) this._load();
    this._render(false);
  }

  connectedCallback() {
    clearInterval(this._tick);
    // relecture des statistiques, et rafraîchissement du « il y a … min » de la dernière impulsion
    this._tick = setInterval(() => {
      if (!this._hass) return;
      if (Date.now() - (this._loadedAt || 0) > GZ_RELOAD) this._load();
      else this._render(true);
    }, 60000);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
  }

  getCardSize() {
    return 7;
  }

  _state(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  /** Nature du compteur (volume, énergie ou impulsions) et unités à demander aux statistiques. */
  _meter() {
    return GZ.meterOf(this._state(this._config.entity), this._config.meter);
  }

  _meterKey() {
    const m = this._meter();
    return `${m.kind}${m.asIs ? "-brut" : ""}`;
  }

  /** Volume d'une impulsion, pour un compteur sans unité (Gazpar : 10 litres, soit 0,01 m³). */
  _pulse() {
    const p = GZ.num(this._config.pulse_volume);
    return p !== null && p > 0 ? p : 0.01;
  }

  /** Statistiques par jour (depuis le 1er janvier de l'an dernier), par heure (hier et aujourd'hui), prix du tableau Énergie. */
  async _load() {
    if (!this._hass || !this._config) return;
    const st = this._state(this._config.entity);
    if (!st) return;
    this._loading = true;
    try {
      const now = new Date();
      const id = this._config.entity;
      const m = this._meter();
      const kind = m.kind;
      const units = m.units;
      const k = kind === "raw" ? this._pulse() : 1;
      const yearStart = new Date(now.getFullYear() - 1, 0, 1);
      const yesterday = new Date(GZ.dayOf(now).getTime() - GZ.DAY);
      const timed = (promise) => Promise.race([promise, new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Home Assistant ne répond pas (historique occupé), nouvel essai dans 5 minutes")), GZ_TIMEOUT))]);
      const call = (start, period, types, statistic_ids, u) => timed(
        this._hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: start.toISOString(),
          end_time: now.toISOString(),
          statistic_ids,
          period,
          types,
          ...(u ? { units: u } : {}),
        }));
      const ttl = GZ_RELOAD - 30000;
      // la clé suit aussi l'unité du compteur : un capteur passé de m³ à kWh ne reprend pas l'ancienne lecture
      const sk = `${id}|${this._meterKey()}`;
      const daily = await zlShared(`gaz-jours|${sk}`, ttl, () => gzDaily(call, id, units, yearStart));
      const hourly = await zlShared(`gaz-heures|${sk}`, ttl, () => call(yesterday, "hour", ["change", "state"], [id], units));
      let prefs = null;
      if (this._config.show_cost && this._config.energy_prices !== false) {
        prefs = await zlShared("prix", ttl, () => this._hass.callWS({ type: "energy/get_prefs" })).catch(() => null);
      }
      // impulsions : tout est ramené en m³
      const scale = (r) => ({ start: GZ.start(r).getTime(), change: Number.isFinite(r.change) ? r.change * k : null, state: Number.isFinite(r.state) ? r.state * k : null });
      this._stats = {
        kind: kind === "energy" ? "energy" : "volume",
        rawKind: this._meterKey(),
        daily: (daily || []).map((r) => ({ start: r.start, change: Number.isFinite(r.change) ? r.change * k : null })),
        hourly: ((hourly || {})[id] || []).map(scale),
        prefs,
        at: now,
      };
      this._error = null;
    } catch (e) {
      this._error = e?.message || String(e);
    }
    this._loading = false;
    this._loadedAt = Date.now();
    this._render(true);
  }

  _signature() {
    const c = this._config;
    const ids = [c.entity, c.conversion_entity, c.price_entity, c.flow_entity];
    // la minute courante : « dernière impulsion il y a … » et « gaz en cours » se mettent à jour
    return `${c.theme}|${this._hass?.themes?.darkMode}|${this._loadedAt}|${Math.floor(Date.now() / 60000)}|`
      + ids.map((id) => this._state(id)?.last_updated || "-").join("|");
  }

  /** Coefficient de conversion en kWh par m³ : saisi dans la carte, sinon lu dans une entité. */
  _factor() {
    const c = this._config;
    this._badFactor = null;
    // un coefficient en kWh/m³ vaut environ 11 : hors de 5 à 15, il est écarté (et signalé) plutôt que d'afficher
    // des kWh et des coûts faux, par exemple un coefficient en kWh par impulsion (environ 0,11)
    const fixed = positivePrice(c.conversion_factor);
    if (fixed !== null) {
      if (fixed > 5 && fixed < 15) return { value: fixed, src: "carte" };
      this._badFactor = { value: fixed, src: "saisi dans la carte" };
      return null;
    }
    const st = this._state(c.conversion_entity);
    const f = GZ.factorOf(st);
    if (f !== null) return { value: f, src: c.conversion_entity };
    const v = st ? GZ.num(st.state) : null;
    if (v !== null && v > 0) this._badFactor = { value: v, src: `lu dans ${c.conversion_entity}` };
    return null;
  }

  /** Prix : €/kWh saisi ou lu dans une entité (€/m³ si l'unité de l'entité le dit), sinon prix du tableau Énergie
   *  (dans l'unité du compteur choisi dans le tableau Énergie). */
  _price() {
    const c = this._config;
    const fixed = positivePrice(c.price);
    if (fixed !== null) return { value: fixed, per: "kwh", src: "saisi dans la carte" };
    const st = this._state(c.price_entity);
    const v = st ? positivePrice(st.state) : null;
    if (v !== null) return { value: v, per: /m³|m3/i.test(String(st.attributes?.unit_of_measurement || "")) ? "m3" : "kwh", src: "de l'entité de prix" };
    if (c.energy_prices !== false && this._stats?.prefs) {
      const e = GZ.energyPrice(this._stats.prefs, c.entity, this._hass);
      if (e !== null) return { value: e, per: this._stats.kind === "energy" ? "kwh" : "m3", src: "du tableau Énergie" };
    }
    return null;
  }

  /** Jours, du plus récent (aujourd'hui, en direct) au plus ancien : volume (m³) et énergie (kWh). */
  _days(factor) {
    const s = this._stats;
    const now = new Date();
    const today = GZ.dayOf(now);
    const byDay = new Map();
    const day = (date) => {
      const k = GZ.key(date);
      if (!byDay.has(k)) byDay.set(k, { date, v: 0 });
      return byDay.get(k);
    };
    for (const row of s.daily) {
      const d = GZ.dayOf(new Date(row.start));
      if (d >= today || row.change === null) continue;
      day(d).v += row.change;
    }
    // Aujourd'hui : heures déjà enregistrées + écart entre le compteur actuel et la dernière heure enregistrée
    const t = day(today);
    t.today = true;
    let sum = 0, sameTime = 0, last = null, hourNow = 0;
    const dayAgo = now.getTime() - GZ.DAY;
    for (const row of s.hourly) {
      if (row.start >= today.getTime()) { if (row.change !== null) sum += row.change; }
      else if (row.start + GZ.HOUR <= dayAgo && row.change !== null) sameTime += row.change;
      last = row;
    }
    const cur = GZ.native(this._state(this._config.entity), this._pulse(), this._meter());
    const delta = cur !== null && last && last.state !== null ? Math.max(0, cur - last.state) : 0;
    if (delta && last.start + GZ.HOUR >= today.getTime()) sum += delta;
    // heure en cours : ce qui a tourné depuis la dernière heure enregistrée
    hourNow = delta;
    t.v = sum;
    this._yesterdaySameTime = this._conv(sameTime, factor);
    this._hourNow = this._conv(hourNow, factor);
    this._current = cur;
    const all = [...byDay.values()].sort((a, b) => b.date - a.date);
    all.forEach((d) => Object.assign(d, this._conv(d.v, factor)));
    return all;
  }

  /** Valeur dans l'unité des statistiques -> { m3, kwh } (null si le coefficient manque). */
  _conv(v, factor) {
    if (v === null || v === undefined) return { m3: null, kwh: null };
    const f = factor?.value ?? null;
    return this._stats.kind === "energy"
      ? { kwh: v, m3: f ? v / f : null }
      : { m3: v, kwh: f ? v * f : null };
  }

  /** Unité principale : kWh si connue (compteur en kWh ou coefficient), sinon m³ ; « unit » peut l'imposer. */
  _unit(factor) {
    const u = this._config.unit;
    const kwhOk = this._stats.kind === "energy" || !!factor;
    const m3Ok = this._stats.kind === "volume" || !!factor;
    if (u === "m3" && m3Ok) return "m3";
    if (u === "kwh" && kwhOk) return "kwh";
    return kwhOk ? "kwh" : "m3";
  }

  /** Totaux et comparaisons jusqu'à hier (jours complets), dans l'unité principale. Une période de comparaison
   *  n'est retenue que si les statistiques la couvrent presque entièrement (au moins 90 % des jours). */
  _aggregates(all) {
    const u = this._u;
    const now = new Date();
    const today = new Date(GZ.dayOf(now).getTime() - GZ.DAY);
    const sum = (from, to, cover = 0) => {
      const sel = all.filter((d) => !d.today && d[u] !== null && d.date >= from && d.date <= to);
      const span = Math.round((GZ.dayOf(to) - GZ.dayOf(from)) / GZ.DAY) + 1;
      if (!sel.length || sel.length < cover * span) return null;
      return sel.reduce((t, d) => t + d[u], 0);
    };
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * GZ.DAY);
    const y = now.getFullYear(), m = now.getMonth();
    const evo = (cur, ref) => (cur !== null && ref ? ((cur - ref) / ref) * 100 : null);
    const lm = sum(new Date(y, m - 1, 1), new Date(y, m, 0));
    const lmLy = sum(new Date(y - 1, m - 1, 1), new Date(y - 1, m, 0), 0.9);
    const cy = sum(new Date(y, 0, 1), today);
    const cyLy = sum(new Date(y - 1, 0, 1), new Date(y - 1, today.getMonth(), today.getDate()), 0.9);
    const lw = sum(new Date(monday.getTime() - 7 * GZ.DAY), new Date(monday.getTime() - GZ.DAY));
    const last30 = all.filter((d) => !d.today && d[u] !== null).slice(0, 30);
    return {
      current_week: today >= monday ? sum(monday, today) : null,
      week_days: Math.round((today - monday) / GZ.DAY) + 1,
      last_week: lw,
      last_week_same: sum(new Date(monday.getTime() - 7 * GZ.DAY), new Date(today.getTime() - 7 * GZ.DAY), 1),
      current_month: m === today.getMonth() ? sum(new Date(y, m, 1), today) : null,
      current_month_last_year: sum(new Date(y - 1, m, 1), new Date(y - 1, m + 1, 0), 0.9),
      last_month: lm,
      last_month_last_year: lmLy,
      monthly_evolution: evo(lm, lmLy),
      current_year: cy,
      current_year_last_year: cyLy,
      yearly_evolution: evo(cy, cyLy),
      avg30: last30.length ? last30.reduce((t, d) => t + d[u], 0) / last30.length : null,
      avg30_days: last30.length,
    };
  }

  _render(force) {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const sig = this._signature();
    if (!force && sig === this._sig) return;
    this._sig = sig;
    const c = this._config;
    const mode = `${themeClass(c.theme, this._hass)} gas`;
    const style = gzStyle(c);
    const main = this._state(c.entity);
    if (!main) {
      const found = gzCandidates(this._hass).slice(0, 12);
      this.shadowRoot.innerHTML = `${STYLE}${GZ_STYLE}<ha-card class="${mode}"${style}><div class="empty">
        <strong>Compteur introuvable : ${esc(c.entity)}</strong>
        <span>Choisissez dans l'éditeur le capteur cumulé de votre compteur de gaz (m³ ou kWh, classe d'état <code>total_increasing</code>).</span>
        ${found.length ? `<span>Compteurs trouvés : ${found.map((id) => `<code>${esc(id)}</code>`).join(", ")}</span>` : ""}</div></ha-card>`;
      return;
    }
    if (!this._stats) {
      if (!this._loading && !this._loadedAt) this._load();
      this.shadowRoot.innerHTML = `${STYLE}${GZ_STYLE}<ha-card class="${mode}"${style}><div class="empty">
        <strong>${this._error ? "Statistiques illisibles" : "Lecture des statistiques…"}</strong>
        ${this._error ? `<span>${esc(this._error)}</span>` : ""}</div></ha-card>`;
      return;
    }
    const factor = this._factor();
    const all = this._days(factor);
    this._u = this._unit(factor);
    const price = c.show_cost ? this._price() : null;
    this._priceInfo = price;
    const sub = c.show_cost ? positivePrice(c.subscription_price) : null;
    this._subscription = sub;
    all.forEach((d) => {
      const base = price ? (price.per === "kwh" ? d.kwh : d.m3) : null;
      d.energyCost = base !== null && price ? base * price.value : null;
      d.cost = d.energyCost;
      if (sub !== null) {
        const full = sub / new Date(d.date.getFullYear(), d.date.getMonth() + 1, 0).getDate();
        d.sub = d.today ? (full * (Date.now() - d.date.getTime())) / GZ.DAY : full;
        if (d.cost !== null) d.cost += d.sub;
      }
    });
    this._all = all;
    if (this._selected >= all.length) this._selected = 0;
    const shown = all.slice(0, Math.max(1, Math.min(c.days, all.length)));
    const a = this._aggregates(all);
    const unitL = this._u === "kwh" ? "kWh" : "m³";
    const monthName = cap(new Date().toLocaleDateString("fr-FR", { month: "long" }));
    this.shadowRoot.innerHTML = `${STYLE}${ZL_STYLE}${GZ_STYLE}<ha-card class="${mode}"${style}>
      ${this._header()}
      ${this._hero(all[this._selected], all[this._selected + 1])}
      ${this._hoursChart(all[this._selected], factor)}
      ${c.show_details !== false ? this._details(all[this._selected]) : ""}
      ${c.show_live === false ? "" : this._live(factor, price)}
      ${c.show_totals === false ? "" : this._fold("totals", "Semaine, mois et année",
        [a.current_month !== null ? `${monthName} ${fmt(a.current_month, 0)} ${unitL}` : "",
          a.current_year !== null ? `Année ${fmt(a.current_year, 0)} ${unitL}` : ""].filter(Boolean).join(" · "),
        this._tiles(a, all))}
      ${c.show_chart === false ? "" : this._fold("chart", "Historique",
        `${shown.length} jours · ${fmt(shown.reduce((t, d) => t + (d[this._u] || 0), 0), 0)} ${unitL}`, this._chart(shown))}
      ${this._warnings(factor)}
      ${this._footer(factor, price)}
    </ha-card>`;
  }

  /* ---------------------------------------------------------- en-tête */

  _header() {
    const c = this._config;
    const st = this._state(c.entity);
    const changed = Date.parse(st?.last_changed || "") || 0;
    const mins = changed ? Math.max(0, Math.floor((Date.now() - changed) / 60000)) : null;
    const lim = Math.max(1, Number(c.live_minutes) || GZ_DEFAULTS.live_minutes);
    const on = mins !== null && mins < lim;
    const ago = mins === null ? "" : mins < 1 ? "à l'instant" : mins < 60 ? `il y a ${mins} min` : mins < 1440 ? `il y a ${Math.floor(mins / 60)} h` : `il y a ${Math.floor(mins / 1440)} j`;
    return `<header>
      <div class="brand">${FLAME_ICON}
        <div><div class="title">${esc(c.title)}</div><div class="sub">${esc(st?.attributes?.friendly_name || c.entity)}</div></div>
      </div>
      <div class="pill" title="Dernier changement du compteur ${esc(ago)}">
        <span class="gz-live"><span class="dot${on ? " on" : ""}"></span><span class="pill-l">${on ? "Gaz en cours" : "À l'arrêt"}</span></span>
        ${ago ? `<span class="pill-v">${esc(ago)}</span>` : ""}
      </div>
    </header>`;
  }

  /* ----------------------------------------------------------- le jour */

  _val(d, digits = 2) {
    const u = this._u;
    return d && d[u] !== null && d[u] !== undefined ? fmt(d[u], digits) : "—";
  }

  _alt(d) {
    // l'autre unité, en petit sous la valeur
    if (!d) return "";
    if (this._u === "kwh" && d.m3 !== null) return `${fmt(d.m3, 2)} m³`;
    if (this._u === "m3" && d.kwh !== null) return `${fmt(d.kwh, 2)} kWh`;
    return "";
  }

  _hero(day, prev) {
    if (!day) return "";
    const u = this._u, unitL = u === "kwh" ? "kWh" : "m³";
    const live = !!day.today;
    const ref = live ? this._yesterdaySameTime?.[u] : prev?.[u];
    const evo = day[u] !== null && ref > 0 ? ((day[u] - ref) / ref) * 100 : null;
    const when = day.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const alt = this._alt(day);
    return `<section class="hero">
      <div>
        <div class="zl-nav">
          <button class="zl-btn" data-nav="prev" title="Jour précédent" aria-label="Jour précédent"${this._selected >= (this._all?.length || 1) - 1 ? " disabled" : ""}>‹</button>
          <span class="hero-l" title="${esc(cap(when))}">${esc(cap(day.date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })))}${live ? " <em>· en cours</em>" : ""}</span>
          <button class="zl-btn" data-nav="next" title="Jour suivant" aria-label="Jour suivant"${live ? " disabled" : ""}>›</button>
          ${live ? "" : `<button class="zl-btn zl-today" data-nav="today">Aujourd'hui</button>`}
        </div>
        <div class="hero-v">${this._val(day)}<span>${unitL}</span></div>
        ${alt ? `<div class="gz-alt">${alt}</div>` : ""}
        ${evo !== null ? `<div class="evo ${evo > 0 ? "up" : "down"}">${evo > 0 ? "+" : ""}${fmt(evo, 1)} % ${live ? "par rapport à hier à la même heure" : "par rapport à la veille"}</div>` : ""}
        ${prev && prev[u] !== null ? `<div class="hero-p">${live ? "Hier" : "Veille"} : ${fmt(prev[u], 2)} ${unitL}${prev.cost !== null && prev.cost !== undefined ? ` · ${euro(prev.cost)}` : ""}</div>` : ""}
      </div>
      <div class="hero-r">
        ${!this._config.show_cost ? "" : day.cost !== null && day.cost !== undefined
          ? `<div class="cost">${euro(day.cost)}</div><div class="cost-l">${live ? "coût depuis minuit" : "coût de la journée"}${day.sub ? `, dont abonnement ${euro(day.sub)}` : ""}</div>`
          : `<div class="cost none">—</div><div class="cost-l">${this._priceInfo ? "coefficient de conversion manquant" : "prix du gaz introuvable (carte, entité ou tableau Énergie)"}</div>`}
        ${live && this._hourNow && this._hourNow[u] ? `<div class="hero-p">Depuis la dernière heure : ${fmt(this._hourNow[u], 2)} ${unitL}</div>` : ""}
      </div>
    </section>`;
  }

  /** Détail du jour, comme le tableau Énergie : gaz (énergie, volume, coût), abonnement, total. */
  _details(day) {
    if (!day) return "";
    const rows = [`<tr><td><i class="zl-sw k-gas"></i>Gaz${day.m3 !== null && this._u === "kwh" ? ` · ${fmt(day.m3, 2)} m³` : day.kwh !== null && this._u === "m3" ? ` · ${fmt(day.kwh, 2)} kWh` : ""}</td>
      <td>${this._val(day)} ${this._u === "kwh" ? "kWh" : "m³"}</td><td>${day.energyCost !== null ? euro(day.energyCost) : "—"}</td></tr>`];
    if (day.sub) rows.push(`<tr><td><i class="zl-sw zl-sub"></i>Abonnement${day.today ? " (au prorata de l'heure)" : ""}</td><td>—</td><td>${euro(day.sub)}</td></tr>`);
    if (!this._config.show_cost && !day.sub) return "";
    return `<section class="zl-det">
      <table>
        <thead><tr><th>Source</th><th>${this._u === "kwh" ? "Énergie" : "Volume"}</th><th>Coût</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
        <tfoot><tr><td>Total</td><td>${this._val(day)} ${this._u === "kwh" ? "kWh" : "m³"}</td><td>${day.cost !== null && day.cost !== undefined ? euro(day.cost) : "—"}</td></tr></tfoot>
      </table>
    </section>`;
  }

  /* ----------------------------------------------------- heure par heure */

  /** Heure par heure du jour affiché : hier et aujourd'hui sont déjà lus, les autres jours à la demande. */
  async _loadHours() {
    const d = this._all?.[this._selected];
    if (!d || !this._hass || !this._stats) return;
    const key = GZ.key(d.date);
    this._hours = this._hours || {};
    if (this._hours[key] || d.today || d.date.getTime() === GZ.dayOf(new Date()).getTime() - GZ.DAY) return;
    this._hours[key] = "loading";
    const m = this._meter();
    const kind = m.kind;
    const units = m.units;
    const k = kind === "raw" ? this._pulse() : 1;
    try {
      const res = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: d.date.toISOString(),
        end_time: new Date(d.date.getTime() + GZ.DAY).toISOString(),
        statistic_ids: [this._config.entity],
        period: "hour",
        types: ["change"],
        ...(units ? { units } : {}),
      });
      this._hours[key] = (res?.[this._config.entity] || []).map((r) => ({ start: GZ.start(r).getTime(), change: Number.isFinite(r.change) ? r.change * k : null }));
    } catch (e) {
      delete this._hours[key];
    }
    this._render(true);
  }

  _hoursChart(day, factor) {
    if (!day || !this._stats) return "";
    const start = day.date.getTime();
    const recent = day.today || start === GZ.dayOf(new Date()).getTime() - GZ.DAY;
    const src = recent ? this._stats.hourly : this._hours?.[GZ.key(day.date)];
    if (!src || src === "loading") return `<section class="zl-hours"><div class="chart-h"><span>Heure par heure</span></div><div class="zl-wait">Lecture…</div></section>`;
    const u = this._u, unitL = u === "kwh" ? "kWh" : "m³";
    const hours = Array(24).fill(0);
    for (const row of src) {
      if (row.start < start || row.start >= start + GZ.DAY || row.change === null) continue;
      hours[Math.floor((row.start - start) / GZ.HOUR)] += row.change;
    }
    // heure en cours (aujourd'hui) : écart depuis la dernière heure enregistrée
    if (day.today && this._hourNow?.[u]) {
      const h = new Date().getHours();
      hours[h] += this._stats.kind === "energy" ? this._hourNow.kwh : this._hourNow.m3;
    }
    const vals = hours.map((v) => this._conv(v, factor)[u] ?? 0);
    const scale = chartScale(Math.max(...vals), this._config.show_scale !== false, u === "kwh" ? 0.5 : 0.05);
    const max = scale.top;
    const H = 100, slot = 100 / 24, w = slot * 0.7;
    const bars = vals.map((v, k) => {
      const x = k * slot + (slot - w) / 2;
      const h = (v / max) * H;
      return `<g><title>${k} h - ${k + 1} h : ${fmt(v, 2)} ${unitL}</title>${h ? `<rect class="gasb" x="${x}" y="${H - h}" width="${w}" height="${h}"/>` : ""}</g>`;
    }).join("");
    const top = vals.reduce((m, v, k) => (v > m.v ? { v, k } : m), { v: 0, k: 0 });
    return `<section class="chart zl-hours${scale.gutter ? " scaled" : ""}">
      <div class="chart-h"><span>Heure par heure${scale.gutter ? ` · ${unitL}` : ""}${top.v ? ` · maximum ${fmt(top.v, 2)} ${unitL} de ${top.k} h à ${top.k + 1} h` : ""}</span></div>
      <div class="plot">${scale.gutter}<svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" role="img" aria-label="Consommation de gaz heure par heure">${scale.grid}${bars}</svg></div>
      <div class="zl-hl"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div>
    </section>`;
  }

  /* ---------------------------------------------------------- en direct */

  /** Compteur en direct : index (m³ et kWh), débit, coefficient de conversion et prix. */
  _live(factor, price) {
    const c = this._config;
    const chip = (label, value, cls = "", title = "") =>
      `<div class="zl-chip ${cls}"${title ? ` title="${esc(title)}"` : ""}><span>${esc(label)}</span><b>${value}</b></div>`;
    const chips = [];
    const cur = this._current;
    const idx = cur !== null ? this._conv(cur, factor) : null;
    // index de départ (m³) : le ZiPulses compte depuis 0 à son appairage, l'index affiché rejoint celui du Gazpar
    const off = GZ.num(c.index_offset);
    if (idx && off) {
      if (idx.m3 !== null) idx.m3 += off;
      if (idx.kwh !== null && factor) idx.kwh += off * factor.value;
    }
    if (idx?.m3 !== null && idx?.m3 !== undefined) chips.push(chip("Index", `${fmt(idx.m3, 2)} m³`, "k-gas", c.entity));
    if (idx?.kwh !== null && idx?.kwh !== undefined) chips.push(chip(this._stats.kind === "energy" ? "Index" : "Index (énergie)", `${fmt(idx.kwh, 0)} kWh`, this._stats.kind === "energy" ? "k-gas" : "", c.entity));
    const flow = this._state(c.flow_entity);
    if (flow && GZ.num(flow.state) !== null) chips.push(chip("Débit", `${fmt(GZ.num(flow.state), 2)} ${esc(flow.attributes?.unit_of_measurement || "")}`, "", c.flow_entity));
    if (factor) chips.push(chip("Conversion", `${fmt(factor.value, 2)} kWh/m³`, "", factor.src === "carte" ? "Coefficient saisi dans la carte" : `Coefficient lu dans ${factor.src}`));
    if (price) chips.push(chip("Prix", `${fmt(price.value, 4)} €/${price.per === "kwh" ? "kWh" : "m³"}`, "", `Prix ${price.src}`));
    if (factor && price && price.per === "kwh") chips.push(chip("Prix du m³", `${fmt(price.value * factor.value, 3)} €`, "", "Prix du kWh × coefficient de conversion"));
    if (!chips.length) return "";
    const open = this._isOpen("live");
    const summary = idx?.m3 !== null && idx?.m3 !== undefined ? `Index ${fmt(idx.m3, 2)} m³` : idx?.kwh !== null && idx?.kwh !== undefined ? `Index ${fmt(idx.kwh, 0)} kWh` : "";
    return `<section class="zl-meter"><div class="zl-fold${open ? " open" : ""}">
      <button class="zl-fold-h" data-fold="live" aria-expanded="${open}">
        <span class="zl-fold-c" aria-hidden="true">›</span><span>Compteur</span>${open ? "" : `<em>${summary}</em>`}
      </button>
      ${open ? `<div class="zl-row">${chips.join("")}</div>` : ""}
    </div></section>`;
  }

  /* ------------------------------------------------------------- tuiles */

  _tile(label, value, unit, evo, note, evoSuffix = "") {
    const e = GZ.num(evo);
    return `<div class="tile">
      <div class="tile-l">${cap(label)}</div>
      <div class="tile-v">${value}<span>${unit}</span></div>
      ${e !== null ? `<div class="evo ${e > 0 ? "up" : "down"}">${e > 0 ? "+" : ""}${fmt(e, 1)} %${evoSuffix}</div>` : ""}
      ${note ? `<div class="tile-n">${note}</div>` : ""}
    </div>`;
  }

  _tiles(a, all) {
    const u = this._u === "kwh" ? "kWh" : "m³";
    const now = new Date();
    const yest = new Date(GZ.dayOf(now).getTime() - GZ.DAY);
    const month = (offset, year = 0) =>
      new Date(now.getFullYear() + year, now.getMonth() + offset, 1).toLocaleDateString("fr-FR", { month: "long", year: year ? "numeric" : undefined });
    // projection fin de mois d'après les jours complets (dès 3 jours)
    let proj = null;
    if (a.current_month !== null && yest.getMonth() === now.getMonth() && yest.getDate() >= 3) {
      proj = (a.current_month / yest.getDate()) * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    }
    const cmLy = a.current_month_last_year;
    const cmEvo = proj !== null && cmLy ? ((proj - cmLy) / cmLy) * 100 : null;
    const cmNote = [proj !== null ? `Projection : ${fmt(proj, 0)} ${u}` : "", cmLy !== null ? `${cap(month(0, -1))} : ${fmt(cmLy, 0)} ${u}` : ""].filter(Boolean).join("<br>");
    const curMonth = this._tile(`${month(0)} en cours`, fmt(a.current_month, 0), u, cmEvo, cmNote || "jusqu'à hier", cmEvo !== null ? " sur projection" : "");
    const lastMonth = this._tile(month(-1), fmt(a.last_month, 0), u, a.monthly_evolution, a.last_month_last_year !== null ? `${cap(month(-1, -1))} : ${fmt(a.last_month_last_year, 0)} ${u}` : "");
    const year = this._tile(`Année ${now.getFullYear()}`, fmt(a.current_year, 0), u, a.yearly_evolution, a.current_year_last_year !== null ? `À date en ${now.getFullYear() - 1} : ${fmt(a.current_year_last_year, 0)} ${u}` : "");
    const avg = this._tile("Moyenne par jour", fmt(a.avg30, 2), u, null, a.avg30_days ? `sur les ${a.avg30_days} derniers jours` : "");
    let week = "";
    if (this._config.show_week) {
      const short = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      const monday = new Date(yest.getTime() - ((yest.getDay() + 6) % 7) * GZ.DAY);
      const wEvo = a.current_week !== null && a.last_week_same ? ((a.current_week - a.last_week_same) / a.last_week_same) * 100 : null;
      week = this._tile("Semaine en cours", fmt(a.current_week, 0), u, wEvo, a.last_week_same !== null ? `Semaine dernière à date : ${fmt(a.last_week_same, 0)} ${u}` : "", wEvo !== null ? " à date" : "")
        + this._tile("Semaine dernière", fmt(a.last_week, 0), u, null, `Du ${short(new Date(monday.getTime() - 7 * GZ.DAY))} au ${short(new Date(monday.getTime() - GZ.DAY))}`);
    }
    if (week && this._config.tiles_horizontal) return `<section class="tiles six h3">${week}${curMonth}${lastMonth}${year}${avg}</section>`;
    return `<section class="tiles${week ? " six" : ""}">${week}${curMonth}${lastMonth}${year}${avg}</section>`;
  }

  /* ---------------------------------------------------------- graphique */

  _chart(days) {
    const u = this._u, unitL = u === "kwh" ? "kWh" : "m³";
    const chrono = days.map((d, i) => ({ ...d, i })).reverse();
    const n = chrono.length;
    const scale = chartScale(Math.max(0, ...chrono.map((d) => d[u] || 0)), this._config.show_scale !== false, u === "kwh" ? 1 : 0.1);
    const max = scale.top;
    const H = 100, slot = 100 / n, w = slot * 0.62;
    const bars = chrono.map((d, k) => {
      const x = k * slot + (slot - w) / 2;
      const sel = d.i === this._selected ? `<rect class="sel" x="${k * slot}" y="0" width="${slot}" height="${H}"/>` : "";
      const h = d[u] ? (d[u] / max) * H : 0;
      const body = h ? `<rect class="gasb" x="${x}" y="${H - h}" width="${w}" height="${h}"><title>${fmt(d[u], 2)} ${unitL}${d.today ? " (en cours)" : ""}</title></rect>` : "";
      return `${sel}${body}<rect class="hit" data-i="${d.i}" x="${k * slot}" y="0" width="${slot}" height="${H}"/>`;
    }).join("");
    const labels = chrono.map((d) => {
      const name = d.date.toLocaleDateString("fr-FR", { weekday: n > 14 ? "narrow" : "short" }).replace(".", "");
      return `<button class="day ${d.i === this._selected ? "on" : ""}" data-i="${d.i}"><span>${name}</span><b>${d.date.getDate()}</b></button>`;
    }).join("");
    return `<section class="chart${scale.gutter ? " scaled" : ""}">
      <div class="chart-h"><span>${n} derniers jours${scale.gutter ? ` · ${unitL}` : ""}</span>
        <span class="legend"><i class="k-gas"></i>Gaz</span></div>
      <div class="plot">${scale.gutter}<svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" role="img" aria-label="Consommation de gaz des ${n} derniers jours">${scale.grid}${bars}</svg></div>
      <div class="days" style="grid-template-columns:repeat(${n},1fr)">${labels}</div>
    </section>`;
  }

  /* --------------------------------------------------------- sections */

  _fold(key, title, summary, html) {
    const open = this._isOpen(key);
    return `<div class="zl-fold zl-fold-w${open ? " open" : ""}">
      <button class="zl-fold-h" data-fold="${key}" aria-expanded="${open}">
        <span class="zl-fold-c" aria-hidden="true">›</span><span>${esc(title)}</span>${open ? "" : `<em>${summary}</em>`}
      </button>
    </div>${open ? html : ""}`;
  }

  _isOpen(key) {
    if (this._folds === undefined) {
      try { this._folds = JSON.parse(localStorage.getItem("gazpar-card:sections") || "{}") || {}; } catch (e) { this._folds = {}; }
    }
    const cfg = this._config[`${key}_open`] !== false;
    const saved = this._folds[key];
    if (saved && typeof saved === "object" && saved.cfg === cfg) return !!saved.open;
    return cfg;
  }

  /* ---------------------------------------------------- avertissements */

  /** Compteur sans classe d'état (pas de statistiques) ou capteur en kWh qui a baissé (coefficient changé). */
  _warnings(factor) {
    const st = this._state(this._config.entity);
    const sc = st?.attributes?.state_class;
    const bits = [];
    if (sc !== "total_increasing" && sc !== "total") {
      bits.push(`Le compteur n'a pas de classe d'état <code>total_increasing</code> : Home Assistant ne garde pas ses statistiques, l'historique restera vide.`);
    }
    const m = this._meter();
    const name = `${this._config.entity} ${st?.attributes?.friendly_name || ""}`;
    if ((!this._config.meter || this._config.meter === "auto") && m.natural === "energy" && /zipulse|lixee|impuls|pulse/i.test(name)) {
      bits.push(`Ce compteur semble être un ZiPulses réglé par défaut : il compte des <b>impulsions</b> (10 litres chacune) même si son unité affiche « ${esc(st?.attributes?.unit_of_measurement || "")} ». Réglez <b>Nature du compteur</b> sur « Impulsions » (<code>meter: pulses</code>), ou sur « kWh » (<code>meter: kwh</code>) s'il envoie vraiment des kWh.`);
    }
    const bad = this._badFactor;
    if (bad) {
      const p = this._pulse();
      const perPulse = bad.value < 1 ? ` S'il est en kWh <b>par impulsion</b>, la valeur à indiquer est ${fmt(bad.value / p, 2)} kWh/m³ (× ${fmt(1 / p, 0)}).` : "";
      bits.push(`Coefficient de conversion ignoré : ${fmt(bad.value, 4)} (${esc(bad.src)}) n'est pas en kWh par m³, qui vaut environ 11 (sur la facture).${perPulse} Les kWh et les coûts au kWh ne sont pas calculés en attendant.`);
    } else if (this._stats.kind === "volume" && !factor && this._config.show_cost && this._priceInfo?.per === "kwh") {
      bits.push("Prix au kWh mais compteur en m³ : indiquez le coefficient de conversion (kWh par m³, sur la facture) pour calculer le coût.");
    }
    return bits.length ? `<div class="gz-warn">${bits.join("<br>")}</div>` : "";
  }

  _footer(factor, price) {
    const bits = ["Compteur de gaz en direct (statistiques Home Assistant)"];
    if (factor) bits.push(`énergie = volume × ${fmt(factor.value, 2)} kWh/m³`);
    if (this._config.show_cost) {
      const abo = this._subscription ? `abonnement compris (${euro(this._subscription)}/mois)` : "hors abonnement";
      bits.push(price ? `coûts estimés ${abo}, au prix ${price.src}` : "prix du gaz introuvable, coûts masqués");
    }
    return `<footer>${bits.join(", ")}.</footer>`;
  }
}

/** Couleur des barres et taille du texte, posées sur ha-card. */
const gzStyle = (c) => {
  const vars = [];
  const col = cssColor(c.gas_color);
  if (col) vars.push(`--gz-color: ${col};`);
  const fs = Number(c.font_size);
  if (Number.isFinite(fs) && fs >= 50 && fs <= 200 && fs !== 100) vars.push(`--fs: ${fs / 100};`);
  return vars.length ? ` style="${esc(vars.join(" "))}"` : "";
};

/* --------------------------------------------------------------- éditeur */

const GZ_SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "sensor" } } },
  { name: "title", selector: { text: {} } },
  { name: "meter", selector: { select: { mode: "dropdown", options: [
    { value: "auto", label: "Automatique (d'après l'unité du capteur)" },
    { value: "m3", label: "Volume en m³" },
    { value: "kwh", label: "Énergie en kWh" },
    { value: "pulses", label: "Impulsions (ZiPulses réglé par défaut, même s'il affiche « kWh »)" },
  ] } } },
  { name: "conversion_factor", selector: { number: { min: 0, max: 15, step: 0.001, mode: "box", unit_of_measurement: "kWh/m³" } } },
  { name: "conversion_entity", selector: { entity: { domain: ["input_number", "sensor", "number"] } } },
  { name: "unit", selector: { select: { mode: "dropdown", options: [
    { value: "auto", label: "Automatique (kWh si le coefficient est connu, sinon m³)" },
    { value: "kwh", label: "kWh" },
    { value: "m3", label: "m³" },
  ] } } },
  { name: "pulse_volume", selector: { number: { min: 0.0001, max: 1, step: 0.0001, mode: "box", unit_of_measurement: "m³" } } },
  { name: "index_offset", selector: { number: { min: 0, max: 999999, step: 0.01, mode: "box", unit_of_measurement: "m³" } } },
  { name: "show_cost", selector: { boolean: {} } },
  { name: "price", selector: { number: { min: 0, max: 2, step: 0.0001, mode: "box", unit_of_measurement: "€/kWh" } } },
  { name: "price_entity", selector: { entity: { domain: ["input_number", "sensor", "number"] } } },
  { name: "energy_prices", selector: { boolean: {} } },
  { name: "subscription_price", selector: { number: { min: 0, max: 200, step: 0.01, mode: "box", unit_of_measurement: "€/mois" } } },
  { name: "flow_entity", selector: { entity: { domain: "sensor" } } },
  { name: "live_minutes", selector: { number: { min: 1, max: 60, step: 1, mode: "box", unit_of_measurement: "min" } } },
  SCHEMA.find((s) => s.name === "days"),
  { name: "show_details", selector: { boolean: {} } },
  { name: "show_scale", selector: { boolean: {} } },
  { name: "show_live", selector: { boolean: {} } },
  { name: "live_open", selector: { boolean: {} } },
  { name: "show_totals", selector: { boolean: {} } },
  { name: "totals_open", selector: { boolean: {} } },
  { name: "show_chart", selector: { boolean: {} } },
  { name: "chart_open", selector: { boolean: {} } },
  { name: "show_week", selector: { boolean: {} } },
  { name: "tiles_horizontal", selector: { boolean: {} } },
  SCHEMA.find((s) => s.name === "theme"),
  SCHEMA.find((s) => s.name === "font_size"),
].filter(Boolean);

const GZ_LABELS = {
  ...LABELS,
  entity: "Compteur de gaz cumulé (m³ de préférence, ou kWh ; classe d'état total_increasing)",
  title: "Titre",
  meter: "Nature du compteur (à forcer pour un ZiPulses réglé par défaut, qui compte des impulsions affichées en « kWh »)",
  conversion_factor: "Coefficient de conversion en kWh par m³ (sur la facture, environ 11)",
  conversion_entity: "…ou entité du coefficient (input_number, ou sensor.gazpar de l'intégration GRDF pour le reprendre tout seul)",
  unit: "Unité affichée",
  pulse_volume: "Volume d'une impulsion, pour un compteur en impulsions (Gazpar : 0,01 m³)",
  index_offset: "Index de départ, en m³, ajouté à l'index affiché (le ZiPulses compte depuis 0 à son appairage)",
  show_cost: "Afficher les coûts estimés",
  price: "Prix du kWh de gaz, TTC (facultatif : passe avant l'entité et le tableau Énergie)",
  price_entity: "…ou entité du prix (input_number en €/kWh, ou €/m³ si son unité le dit)",
  energy_prices: "Sinon, prendre le prix du gaz réglé dans le tableau Énergie",
  subscription_price: "Abonnement mensuel TTC (facultatif : ajouté au coût, au prorata)",
  flow_entity: "Débit de gaz (facultatif)",
  live_minutes: "« Gaz en cours » si le compteur a bougé depuis moins de … minutes",
  show_details: "Afficher le détail du jour (gaz, abonnement, total)",
  show_scale: "Afficher l'échelle des graphiques (valeurs à gauche et lignes horizontales)",
  show_live: "Afficher la section « Compteur » (index, débit, coefficient, prix)",
  live_open: "Section « Compteur » ouverte au départ (rabattable d'un clic sur la carte)",
  show_totals: "Afficher la section « Semaine, mois et année »",
  totals_open: "Section « Semaine, mois et année » ouverte au départ",
  show_chart: "Afficher la section « Historique » (graphique des derniers jours)",
  chart_open: "Section « Historique » ouverte au départ",
  show_week: "Afficher la semaine en cours et la semaine dernière",
  tiles_horizontal: "Cases en 3 colonnes (avec la semaine)",
};

const GZ_COLORS = [{ key: "gas_color", label: "Couleur des barres", def: "#ff8f3d" }];

const GazparCardEditor = makeEditor(GZ_SCHEMA, GZ_LABELS, GZ_DEFAULTS, GZ_COLORS);

/* ---------------------------------------------------------- enregistrement */

if (typeof customElements !== "undefined") {
  const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
  define("gazpar-card", GazparCard);
  define("gazpar-card-editor", GazparCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "gazpar-card")) {
    window.customCards.push({
      type: "gazpar-card",
      name: "Carte Gazpar",
      description: "Consommation de gaz en direct (ZiPulses, compteur d'impulsions…) d'après les statistiques Home Assistant : jour, heure par heure, mois, année et coût.",
      preview: false,
    });
  }
  console.info(`%c GAZPAR-CARD %c ${CARD_VERSION} © Marlboro62 `, "background:#ff8f3d;color:#1a2434;font-weight:700", "background:#1d93e3;color:#fff");
}

})();
