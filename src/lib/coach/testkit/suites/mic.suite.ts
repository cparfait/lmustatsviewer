/**
 * Suite « micro et voix » : règles pures de `voicePolicy.ts` (micro permanent,
 * raccourcis globaux, messages dits une fois, bandeau « voix manquante »), erreurs
 * lisibles de la voix en ligne, et textes présents dans les 5 langues. Le micro
 * réel, lui, ne se teste qu'à la main.
 */

import { section, eq, ok } from "../assert";
import { readFileSync } from "node:fs";
import { createOnceGate, micEngineWanted, micFellBack, missingVoiceRow, pttKeysWanted } from "@/lib/voicePolicy";
import { explainCloudError } from "@/lib/cloudVoiceProviders";
import fr from "@/i18n/fr";
import en from "@/i18n/en";
import es from "@/i18n/es";
import de from "@/i18n/de";
import it from "@/i18n/it";

const LANGS = { fr, en, es, de, it };

export function run(): void {
  section("Micro permanent : seulement pour une fonction vocale active");
  // Installation neuve : voix coupée, « Micro prêt » coché par défaut.
  eq(micEngineWanted({ voice: false, micReady: true, wakeOn: false }), false, "sans voix : micro fermé");
  eq(micEngineWanted({ voice: false, micReady: true, wakeOn: true }), false, "sans voix : le mot n'ouvre pas le micro");
  eq(micEngineWanted({ voice: true, micReady: true, wakeOn: false }), true, "voix + micro prêt : ouvert");
  eq(micEngineWanted({ voice: true, micReady: false, wakeOn: true }), true, "voix + mot : ouvert");
  eq(micEngineWanted({ voice: true, micReady: false, wakeOn: false }), false, "micro prêt décoché : ouvert à l'appui");

  section("Raccourcis globaux du push-to-talk");
  eq(pttKeysWanted(false, false), false, "voix jamais allumée : touches libres");
  eq(pttKeysWanted(true, true), true, "voix allumée : touches prises");
  eq(pttKeysWanted(false, true), true, "« coupe la radio » : la touche reste pour « active le son »");

  section("Messages micro : une fois, pas à chaque appui");
  const gate = createOnceGate();
  eq(gate.pass("Casque"), true, "premier message");
  eq(gate.pass("Casque"), false, "même micro : silence");
  eq(gate.pass("Autre"), true, "autre micro choisi : nouveau message");
  gate.reset();
  eq(gate.pass("Autre"), true, "micro revenu puis reperdu : nouveau message");

  section("Micro choisi absent (capture à l'appui)");
  eq(micFellBack("", null, "x"), false, "aucun choix : pas de repli");
  eq(micFellBack("Casque", null, "defaut"), true, "introuvable : repli");
  eq(micFellBack("Casque", "id1", "defaut"), true, "refus d'ouverture : repli");
  eq(micFellBack("Casque", "id1", "id1"), false, "bon micro ouvert");
  eq(micFellBack("Casque", "id1", undefined), false, "flux muet sur son identifiant : pas de fausse alerte");

  section("Bandeau « voix manquante »");
  const row = (id: string, is_default: boolean, installed: boolean) => ({ id, is_default, installed });
  eq(missingVoiceRow([row("a", true, false), row("b", false, false)])?.id, "a", "rien d'installé : voix par défaut proposée");
  eq(missingVoiceRow([row("a", false, false), row("b", false, false)])?.id, "a", "sans défaut : première voix");
  eq(missingVoiceRow([row("a", true, false), row("b", false, true)]), null, "autre voix installée : plus de bandeau");
  eq(missingVoiceRow([row("a", true, true)]), null, "voix par défaut installée : plus de bandeau");
  eq(missingVoiceRow([]), null, "langue sans catalogue");

  section("Voix en ligne : erreur en clair");
  const t = (k: string, o?: Record<string, unknown>) => `${k}|${String(o?.permission ?? "")}`;
  const denied = 'HTTP 401: {"detail":{"status":"missing_permissions","message":"missing the permission voices_read"}}';
  eq(explainCloudError(denied, "X", t), "config.cloudVoiceMissingPermission|Voices → Read", "permission nommée, pas de JSON");
  eq(explainCloudError("délai dépassé", "X", t), "délai dépassé", "autre erreur inchangée");
  // Le rendu « Préparer la voix » passe par l'explication, sans brut résiduel.
  const prep = readFileSync("src/components/CloudVoicePrepare.tsx", "utf8");
  ok(!/\{lastError\}/.test(prep), "pas de {lastError} brut à l'écran");
  ok(!/error: cloudVoiceSnapshot\(\)\.lastError/.test(prep), "pas d'erreur brute dans le toast « en pause »");

  section("Textes micro : 5 langues");
  for (const [code, bundle] of Object.entries(LANGS)) {
    const c = bundle.config as unknown as Record<string, string>;
    ok(!!c.wakeWordModelMissing, `${code} : mot déclencheur sans modèle`);
    ok(/Vosk/.test(c.sttConfirmUnsureDesc), `${code} : « faire répéter » précise Vosk`);
    // « Micro prêt » : le micro ne reste ouvert qu'avec les annonces vocales.
    ok(!/\bapp\b/i.test(c.micReadyTip.split(":")[0]), `${code} : micReadyTip ne promet plus « tant que l'app tourne »`);
  }
}
