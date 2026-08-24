import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScrollToTop from "@/components/ScrollToTop";
import RouteSeo from "@/components/RouteSeo";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";

const Auth = lazy(() => import("@/pages/Auth"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Producers = lazy(() => import("@/pages/Producers"));
const ProducerDetail = lazy(() => import("@/pages/ProducerDetail"));
const CreateShipment = lazy(() => import("@/pages/CreateShipment"));
const ExportPage = lazy(() => import("@/pages/ExportPage"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const SuperAdminDashboard = lazy(() => import("@/pages/SuperAdminDashboard"));
const CooperativesManagement = lazy(() => import("@/pages/CooperativesManagement"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const CreateCooperative = lazy(() => import("@/pages/CreateCooperative"));
const Trash = lazy(() => import("@/pages/Trash"));
const LoginEvents = lazy(() => import("@/pages/LoginEvents"));
const Partners = lazy(() => import("@/pages/Partners"));
const ShipmentTemplates = lazy(() => import("@/pages/ShipmentTemplates"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min — évite de recharger en boucle
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ScrollToTop />
            <RouteSeo />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/producteurs" element={<Producers />} />
                    <Route path="/producteurs/:id" element={<ProducerDetail />} />
                    <Route path="/chargements" element={<CreateShipment />} />
                    <Route path="/export" element={<ExportPage />} />
                    <Route path="/partenaires" element={<Partners />} />
                    <Route element={<ProtectedRoute adminOnly />}>
                      <Route path="/gestion" element={<UserManagement />} />
                      <Route path="/gestion/modeles-chargement" element={<ShipmentTemplates />} />
                      <Route path="/audit" element={<AuditLog />} />
                      <Route path="/audit/connexions" element={<LoginEvents />} />
                      <Route path="/corbeille" element={<Trash />} />
                    </Route>
                    <Route element={<ProtectedRoute superAdminOnly />}>
                      <Route path="/gestion/dashboard" element={<SuperAdminDashboard />} />
                      <Route path="/gestion/cooperatives" element={<CooperativesManagement />} />
                      <Route path="/gestion/cooperatives/nouvelle" element={<CreateCooperative />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
