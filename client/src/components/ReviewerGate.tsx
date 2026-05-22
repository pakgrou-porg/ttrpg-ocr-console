import { useAuth } from "@/_core/hooks/useAuth";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface ReviewerGateProps {
  children: React.ReactNode;
}

/** Allows access for users with role "reviewer" or "admin". Blocks everyone else. */
export function ReviewerGate({ children }: ReviewerGateProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user?.role !== "admin" && user?.role !== "reviewer") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4">
        <div className="p-4 rounded-full bg-destructive/10 border border-destructive/20">
          <ShieldAlert className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          You do not have permission to enter this chamber. Reviewers and administrators may proceed.
        </p>
        <Link href="/" className="text-primary hover:underline text-sm mt-2">
          Return to the Grand Hall
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
