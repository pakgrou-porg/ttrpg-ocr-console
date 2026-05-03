import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export type FeatureArea =
  | "enter_arkanum"
  | "listen_ramblings"
  | "tome_knowledge"
  | "oversee_scribes"
  | "divination_omens"
  | "arcane_mechanisms"
  | "summoning_rituals"
  | "incantations_runes";

interface PermissionResult {
  /** Whether the user has access to this feature area */
  allowed: boolean;
  /** Whether the permission is still loading */
  loading: boolean;
  /** If restricted, which game the user is limited to (null = all games) */
  restrictedGame: string | null;
  /** If restricted, which version the user is limited to (null = all versions) */
  restrictedVersion: string | null;
}

/**
 * Hook to check if the current user has access to a specific feature area.
 * 
 * Rules:
 * - Admins always have full access to everything.
 * - If no permission record exists for a feature area, the user has default access (allowed).
 * - If a permission record exists with granted=false, the user is denied.
 * - If a permission record exists with granted=true but restrictedGame/restrictedVersion set,
 *   the user has access but only to that specific game/version.
 */
export function usePermission(featureArea: FeatureArea): PermissionResult {
  const { user, loading: authLoading } = useAuth();
  const { data: permissions, isLoading: permsLoading } = trpc.permissions.mine.useQuery(
    undefined,
    { enabled: !!user }
  );

  // While loading, assume allowed to prevent flicker
  if (authLoading || permsLoading) {
    return { allowed: true, loading: true, restrictedGame: null, restrictedVersion: null };
  }

  // Not logged in — deny
  if (!user) {
    return { allowed: false, loading: false, restrictedGame: null, restrictedVersion: null };
  }

  // Admins always have full access
  if (user.role === "admin") {
    return { allowed: true, loading: false, restrictedGame: null, restrictedVersion: null };
  }

  // Check if there's a specific permission record for this feature area
  const perm = permissions?.find((p: any) => p.featureArea === featureArea);

  // No record = default access (allowed)
  if (!perm) {
    return { allowed: true, loading: false, restrictedGame: null, restrictedVersion: null };
  }

  return {
    allowed: perm.granted,
    loading: false,
    restrictedGame: perm.restrictedGame ?? null,
    restrictedVersion: perm.restrictedVersion ?? null,
  };
}

