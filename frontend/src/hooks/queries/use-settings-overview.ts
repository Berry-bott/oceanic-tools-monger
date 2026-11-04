"use client";

import { useQuery } from "@tanstack/react-query";
import { getSettingsOverview, settingsKeys } from "@/services/settings/settings.service";

export function useSettingsOverview<Business, Branch>(enabled: boolean) {
  return useQuery({
    queryKey: settingsKeys.overview(),
    queryFn: () => getSettingsOverview<Business, Branch>(),
    enabled,
  });
}
