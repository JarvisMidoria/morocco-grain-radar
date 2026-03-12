import { SettingsView } from "@/components/settings/settings-view";
import { getPublicRadarSettings } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = getPublicRadarSettings();
  return <SettingsView initialSettings={settings} />;
}
