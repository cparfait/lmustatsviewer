/**
 * Menu des stands piloté à la voix (« plein jusqu'à la fin », « quatre pneus »,
 * « répare tout »…).
 *
 * Planification **pure** (`planPitCommand`) : à partir du menu lu dans le jeu,
 * on choisit l'élément et l'option à régler, sans rien écrire. L'exécution
 * (`runPitCommand`) n'écrit que si l'utilisateur a autorisé les écritures dans le
 * jeu (Configuration), une option à la fois, chacune relue par le jeu.
 *
 * Les libellés du menu viennent du jeu et changent d'une voiture à l'autre
 * (« TIRES: », « F TIRES: », « FL TIRE: », « VIRTUAL ENERGY: »…) : on les
 * reconnaît par motifs, sans dépendre d'une liste figée. Une commande qui ne
 * trouve pas son élément répond « pas trouvé » plutôt que de régler autre chose.
 */

import type { TFunction } from "i18next";
import { live, type LiveData, type PitMenuItem } from "@/lib/api";
import { chooseEnergy, energyItem, energyNeed, energyOptions } from "@/lib/pitMenu";
import { computeStrategy } from "@/lib/strategy";
import { energyPerLap } from "./answers";

export type PitCmd =
  | "pitFuelEnd"
  | "pitFuelAdd"
  | "pitEnergy"
  | "pitTyresAll"
  | "pitTyresNone"
  | "pitTyresFront"
  | "pitTyresRear"
  | "pitWet"
  | "pitDry"
  | "pitRepairAll"
  | "pitRepairBody"
  | "pitRepairNone"
  | "pitServePenalty"
  | "pitPlan";

export const PIT_CMDS = new Set<string>([
  "pitFuelEnd",
  "pitFuelAdd",
  "pitEnergy",
  "pitTyresAll",
  "pitTyresNone",
  "pitTyresFront",
  "pitTyresRear",
  "pitWet",
  "pitDry",
  "pitRepairAll",
  "pitRepairBody",
  "pitRepairNone",
  "pitServePenalty",
  "pitPlan",
]);

export interface PitChange {
  name: string;
  index: number;
  label: string;
}

export type PitPlan = { changes: PitChange[] } | { error: "noItem" | "noOption" | "noData" };

export interface PitCtx {
  /** Litres à embarquer pour finir (marge comprise), si connu. */
  fuelNeedL?: number | null;
  /** Niveau d'énergie virtuelle visé pour finir (0-1), si connu. */
  energyNeed?: number | null;
  /** Carburant à bord (L). */
  fuelNow?: number | null;
  /** Nombre cité (litres, pourcentage). */
  amount?: number | null;
  /** Gomme montée (avant), pour « quatre pneus » sans gomme précisée. */
  compound?: string;
}

const NO_CHANGE = /no change|pas de changement|unchanged|^-$/i;
const WET = /wet|rain|monsoon|pluie|intermediate|inter\b/i;

const items = (menu: PitMenuItem[], re: RegExp) => menu.filter((m) => re.test(m.name));

/** Nombre en tête d'un libellé (« 75l/37 laps » → 75, « + 20.0L » → 20). */
export function leadingNumber(text: string): number | null {
  const m = /([+-]?\s*\d+(?:[.,]\d+)?)/.exec(text);
  return m ? Number(m[1].replace(/\s/g, "").replace(",", ".")) : null;
}

/** Plus petite option numérique ≥ `need`, sinon la plus haute. */
function atLeast(item: PitMenuItem, need: number): PitChange | null {
  const opts = item.options
    .map((label, index) => ({ label, index, v: NO_CHANGE.test(label) ? null : leadingNumber(label) }))
    .filter((o): o is { label: string; index: number; v: number } => o.v != null)
    .sort((a, b) => a.v - b.v);
  if (!opts.length) return null;
  const pick = opts.find((o) => o.v >= need - 1e-9) ?? opts[opts.length - 1];
  return { name: item.name, index: pick.index, label: pick.label };
}

function optionMatching(item: PitMenuItem, re: RegExp): PitChange | null {
  const index = item.options.findIndex((o) => re.test(o));
  return index < 0 ? null : { name: item.name, index, label: item.options[index] };
}

/** Éléments « pneus » d'un essieu (ou tous), du plus global au plus fin. */
function tyreItems(menu: PitMenuItem[], which: "all" | "front" | "rear"): PitMenuItem[] {
  const isPressure = /press/i;
  const tyres = menu.filter((m) => /tire|tyre|pneu/i.test(m.name) && !isPressure.test(m.name));
  if (which === "all") {
    const global = tyres.filter((m) => /^(tires|tyres):?$/i.test(m.name.trim()));
    return global.length ? global : tyres;
  }
  const axle = which === "front" ? /^(f|front)\b|^f tires|^f tyres/i : /^(r|rear)\b|^r tires|^r tyres/i;
  const byAxle = tyres.filter((m) => axle.test(m.name.trim()));
  if (byAxle.length) return byAxle;
  const wheels = which === "front" ? /^(fl|fr)\b/i : /^(rl|rr)\b/i;
  return tyres.filter((m) => wheels.test(m.name.trim()));
}

/** Option « pneus neufs » : la gomme visée, sinon la première qui n'est pas « No Change ». */
function tyreOption(item: PitMenuItem, compound: RegExp | null): PitChange | null {
  if (compound) {
    const c = optionMatching(item, compound);
    if (c) return c;
  }
  const index = item.options.findIndex((o) => !NO_CHANGE.test(o) && !WET.test(o));
  return index < 0 ? null : { name: item.name, index, label: item.options[index] };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Choisit les réglages d'une commande (aucune écriture). */
export function planPitCommand(cmd: PitCmd, menu: PitMenuItem[], ctx: PitCtx = {}): PitPlan {
  if (!menu.length) return { error: "noData" };
  const done = (c: (PitChange | null)[]): PitPlan => {
    const changes = c.filter((x): x is PitChange => x != null);
    return changes.length ? { changes } : { error: "noOption" };
  };
  switch (cmd) {
    case "pitFuelEnd": {
      const ve = energyItem(menu);
      if (ve && ctx.energyNeed != null) {
        const o = chooseEnergy(energyOptions(ve), ctx.energyNeed);
        return o ? done([{ name: ve.name, index: o.index, label: ve.options[o.index] }]) : { error: "noOption" };
      }
      const fuel = items(menu, /^fuel:?$/i)[0];
      if (!fuel) return { error: "noItem" };
      if (ctx.fuelNeedL == null) return { error: "noData" };
      const relative = fuel.options.some((o) => /^\s*\+/.test(o));
      const target = relative ? ctx.fuelNeedL : ctx.fuelNeedL + (ctx.fuelNow ?? 0);
      return done([atLeast(fuel, target)]);
    }
    case "pitFuelAdd": {
      const fuel = items(menu, /^fuel:?$/i)[0];
      if (!fuel) return { error: "noItem" };
      if (ctx.amount == null) return { error: "noData" };
      const relative = fuel.options.some((o) => /^\s*\+/.test(o));
      return done([atLeast(fuel, relative ? ctx.amount : ctx.amount + (ctx.fuelNow ?? 0))]);
    }
    case "pitEnergy": {
      const ve = energyItem(menu);
      if (!ve) return { error: "noItem" };
      if (ctx.amount == null) return { error: "noData" };
      const o = chooseEnergy(energyOptions(ve), Math.min(1, ctx.amount / 100));
      return o ? done([{ name: ve.name, index: o.index, label: ve.options[o.index] }]) : { error: "noOption" };
    }
    case "pitTyresAll":
    case "pitTyresFront":
    case "pitTyresRear": {
      const which = cmd === "pitTyresAll" ? "all" : cmd === "pitTyresFront" ? "front" : "rear";
      const list = tyreItems(menu, which);
      if (!list.length) return { error: "noItem" };
      const compound = ctx.compound && !NO_CHANGE.test(ctx.compound) ? new RegExp(escape(ctx.compound), "i") : null;
      return done(list.map((m) => tyreOption(m, compound)));
    }
    case "pitTyresNone": {
      const list = tyreItems(menu, "all");
      if (!list.length) return { error: "noItem" };
      return done(list.map((m) => optionMatching(m, NO_CHANGE)));
    }
    case "pitWet":
    case "pitDry": {
      const list = tyreItems(menu, "all");
      if (!list.length) return { error: "noItem" };
      if (cmd === "pitWet") return done(list.map((m) => optionMatching(m, WET)));
      const dry = ctx.compound && !WET.test(ctx.compound) ? new RegExp(escape(ctx.compound), "i") : /medium/i;
      return done(list.map((m) => tyreOption(m, dry)));
    }
    case "pitRepairAll":
    case "pitRepairBody":
    case "pitRepairNone": {
      const dmg = items(menu, /damage|repair|dégâts|reparation/i)[0];
      if (!dmg) return { error: "noItem" };
      const re =
        cmd === "pitRepairAll" ? /repair all|all|tout/i : cmd === "pitRepairBody" ? /body|carrosserie/i : /do not|don't|no repair|none|aucune/i;
      return done([optionMatching(dmg, re)]);
    }
    case "pitServePenalty": {
      const pen = items(menu, /stop\/go|stop-go|penalt/i)[0];
      if (!pen) return { error: "noItem" };
      return done([optionMatching(pen, /^yes|serve|oui/i)]);
    }
    case "pitPlan":
      return { changes: [] };
  }
}

/** Résumé parlé du menu actuel : carburant / énergie, pneus, réparations. */
export function describeMenu(menu: PitMenuItem[], t: TFunction): string {
  const pick = (re: RegExp) => menu.find((m) => re.test(m.name));
  const val = (m: PitMenuItem | undefined) => (m ? (m.options[m.current] ?? "").trim() : "");
  const parts: string[] = [];
  const ve = energyItem(menu);
  const fuel = pick(/^fuel:?$/i);
  if (ve && val(ve)) parts.push(t("live.pitPlanEnergy", { v: val(ve) }));
  else if (fuel && val(fuel)) parts.push(t("live.pitPlanFuel", { v: val(fuel) }));
  const tyres = tyreItems(menu, "all");
  if (tyres.length) parts.push(t("live.pitPlanTyres", { v: tyres.map(val).filter(Boolean).join(", ") }));
  const dmg = pick(/damage|repair/i);
  if (dmg && val(dmg)) parts.push(t("live.pitPlanRepair", { v: val(dmg) }));
  return parts.join(". ");
}

/** Nombre cité dans la commande (« ajoute 20 litres », « énergie 85 »). */
export function amountFrom(norm: string): number | null {
  const m = / (\d{1,3}(?:[.,]\d+)?) ?(?:l|litres?|liters?|litri|liter|%|pour ?cent|percent|por ?ciento|prozent|per ?cento)? /.exec(` ${norm} `);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/** Contexte chiffré de l'arrêt calculé depuis les données live. */
export function pitCtxFrom(data: LiveData | null, norm: string, reserveLaps: number): PitCtx {
  const ctx: PitCtx = { amount: amountFrom(norm) };
  if (!data?.session || !data.player) return ctx;
  const tel = data.telemetry;
  ctx.fuelNow = tel?.fuel ?? null;
  ctx.compound = tel?.front_compound || undefined;
  const strat = computeStrategy(data.session, data.player, tel);
  const lapsLeft = strat?.sessionLapsLeft ?? null;
  if (tel && tel.fuel_consumption > 0 && lapsLeft != null) {
    ctx.fuelNeedL = Math.max(0, (lapsLeft + reserveLaps) * tel.fuel_consumption - tel.fuel);
  }
  const per = energyPerLap(data);
  ctx.energyNeed = energyNeed(lapsLeft, per);
  return ctx;
}

/**
 * Exécute une commande du menu des stands et renvoie la réponse à dire.
 * `allowed` = écritures dans le jeu autorisées (Configuration).
 */
export async function runPitCommand(
  cmd: PitCmd,
  data: LiveData | null,
  norm: string,
  t: TFunction,
  o: { allowed: boolean; reserveLaps: number },
): Promise<string> {
  let menu: PitMenuItem[];
  try {
    menu = await live.pitMenu();
  } catch {
    return t("live.pitCmdNoGame");
  }
  if (cmd === "pitPlan") return describeMenu(menu, t) || t("live.pitCmdNoItem");
  if (!o.allowed) return t("live.pitCmdWritesOff");
  const plan = planPitCommand(cmd, menu, pitCtxFrom(data, norm, o.reserveLaps));
  if ("error" in plan) {
    return t(plan.error === "noItem" ? "live.pitCmdNoItem" : plan.error === "noData" ? "live.pitCmdNoData" : "live.pitCmdNoOption");
  }
  const okLabels: string[] = [];
  for (const c of plan.changes) {
    const ok = await live.setPitMenuItem(c.name, c.index).catch(() => false);
    if (!ok) return t("live.pitCmdNotConfirmed");
    okLabels.push(c.label);
  }
  return t("live.pitCmdDone", { what: [...new Set(okLabels)].join(", ") });
}
