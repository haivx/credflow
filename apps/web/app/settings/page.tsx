"use client";

import { AppShell } from "../_components/AppShell";
import { SettingsScreen } from "../_components/SettingsScreen";

/** Cài đặt hệ thống cho admin (plan 35). */
export default function SettingsPage() {
  return <AppShell role="admin">{() => <SettingsScreen />}</AppShell>;
}
