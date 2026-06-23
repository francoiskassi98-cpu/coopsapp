import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface Props {
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

export default function ProtectedRoute({ adminOnly = false, superAdminOnly = false }: Props) {
  const { session, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  if (adminOnly || superAdminOnly) {
    if (role === null) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (superAdminOnly && role !== "super_admin") return <Navigate to="/" replace />;
    if (adminOnly && role !== "super_admin" && role !== "coop_admin") return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
