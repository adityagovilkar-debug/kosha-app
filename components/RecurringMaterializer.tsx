"use client";

import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useMaterializeOnLoad } from "@/lib/kosha/recurring";

function useCurrentUserId() {
  return useQuery({
    queryKey: ["kosha_current_user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabaseBrowser().auth.getUser();
      // React Query forbids `undefined` as query data — use null when signed out.
      return user?.id ?? null;
    },
  });
}

/** Mounted once at the app root — silently materializes due recurring occurrences on load. Renders nothing. */
export function RecurringMaterializer() {
  const { data: userId } = useCurrentUserId();
  useMaterializeOnLoad(userId ?? undefined);
  return null;
}
