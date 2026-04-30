import { usePermission, type FeatureArea } from "@/hooks/usePermission";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface PermissionGateProps {
  featureArea: FeatureArea;
  children: React.ReactNode;
}

/**
 * Wraps a page or section to enforce feature-area permission gating.
 * Shows a loading spinner while permissions are being fetched,
 * and a denial message if the user lacks access.
 */
export function PermissionGate({ featureArea, children }: PermissionGateProps) {
  const { allowed, loading } = usePermission(featureArea);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4">
        <div className="p-4 rounded-full bg-destructive/10 border border-destructive/20">
          <ShieldAlert className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          You do not have permission to enter this chamber. Contact the Conclave administrator to request access.
        </p>
        <Link href="/" className="text-primary hover:underline text-sm mt-2">
          Return to the Grand Hall
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
