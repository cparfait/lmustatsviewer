/**
 * Logos des fournisseurs IA et barre de sélection à icônes : icône seule pour les
 * fournisseurs inactifs, icône + nom pour celui qui est sélectionné.
 *
 * Les SVG (`src/assets/provider-icons`) n'ont ni script ni référence externe et
 * suivent `currentColor` : ils prennent la couleur du thème. Fournisseur sans logo :
 * pastille avec son initiale.
 */

import type { ReactNode } from "react";
import anthropic from "@/assets/provider-icons/anthropic.svg?raw";
import deepseek from "@/assets/provider-icons/deepseek.svg?raw";
import google from "@/assets/provider-icons/google.svg?raw";
import grok from "@/assets/provider-icons/grok.svg?raw";
import lmstudio from "@/assets/provider-icons/lmstudio.svg?raw";
import mistral from "@/assets/provider-icons/mistral.svg?raw";
import ollama from "@/assets/provider-icons/ollama.svg?raw";
import openai from "@/assets/provider-icons/openai.svg?raw";
import openrouter from "@/assets/provider-icons/openrouter.svg?raw";
import perplexity from "@/assets/provider-icons/perplexity.svg?raw";
import zai from "@/assets/provider-icons/zai.svg?raw";
import { cn } from "@/lib/utils";

const ICONS: Record<string, string> = {
  anthropic,
  deepseek,
  google,
  mistral,
  ollama,
  "ollama-cloud": ollama,
  openai,
  openrouter,
  zai,
};

/** Fournisseur personnalisé : logo reconnu d'après son nom ou son adresse. */
const CUSTOM_ICONS: [RegExp, string][] = [
  [/x\.ai|grok/i, grok],
  [/lm.?studio/i, lmstudio],
  [/perplexity/i, perplexity],
];

function iconOf(id: string, hint: string): string | null {
  return ICONS[id] ?? CUSTOM_ICONS.find(([re]) => re.test(hint))?.[1] ?? null;
}

export function ProviderIcon({
  id,
  name,
  baseUrl,
  className,
}: {
  id: string;
  name: string;
  baseUrl?: string;
  className?: string;
}) {
  const svg = iconOf(id, `${name} ${baseUrl ?? ""}`);
  if (!svg) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded bg-muted-foreground/15 text-[11px] font-semibold uppercase leading-none",
          className,
        )}
      >
        {name.trim().charAt(0) || "?"}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center text-[18px] leading-none", className)}
      // Contenu statique, importé depuis le dépôt : jamais de donnée saisie ou reçue.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export interface ProviderTabOption {
  id: string;
  name: string;
  baseUrl?: string;
  /** Infobulle, si elle dit plus que le nom (ex. « Groq · Gratuit »). */
  title?: string;
  /** Icône imposée (choix sans logo, comme « Fournisseur personnalisé »). */
  icon?: ReactNode;
}

export function ProviderTabs({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: ProviderTabOption[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-0.5 rounded-lg bg-muted p-1", className)}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.name}
            title={o.title ?? o.name}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-background px-3 text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {o.icon ?? <ProviderIcon id={o.id} name={o.name} baseUrl={o.baseUrl} />}
            {active && <span className="whitespace-nowrap">{o.name}</span>}
          </button>
        );
      })}
    </div>
  );
}
