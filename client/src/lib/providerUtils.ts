import { Cpu, Cloud } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Maps a provider type string to its representative icon component. */
const PROVIDER_ICONS: Record<string, LucideIcon> = {
  lm_studio:         Cpu,
  openai_compatible: Cpu,
  custom:            Cpu,
  openrouter:        Cloud,
};

export function getProviderIcon(providerType: string): LucideIcon {
  return PROVIDER_ICONS[providerType] ?? Cpu;
}
