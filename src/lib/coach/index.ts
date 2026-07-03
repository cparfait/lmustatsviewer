/**
 * Coach par virage — moteur de mesure (COACH-LIVE-SPEC.md P1.2).
 *
 * Point d'entrée du module : moteur pur (`engine`), normaliseur de trames
 * (`frame`), fenêtres/détection (`windows`) et service autonome (`service`).
 */

export * from "./frame";
export * from "./windows";
export * from "./engine";
export * from "./capture";
export * from "./diagnostics";
export * from "./mode";
export * from "./voice";
export * from "./apex";
export * from "./calibration";
export * from "./shortref";
export * from "./staleness";
export * from "./service";
