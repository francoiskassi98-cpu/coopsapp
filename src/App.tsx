import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScrollToTop from "@/components/ScrollToTop";
import RouteSeo from "@/components/RouteSeo";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";

const Auth = lazyWithRetry(() => import("@/pages/Auth"));
const ResetPassword = lazyWithRetry(() => import("@/pages/ResetPassword"));
const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const Producers = lazyWithRetry(() => import("@/pages/Producers"));
const ProducerDetail = lazyWithRetry(() => import("@/pages/ProducerDetail"));
const CreateShipment = lazyWithRetry(() => import("@/pages/CreateShipment"));
const ExportPage = lazyWithRetry(() => import("@/pages/ExportPage"));
const UserManagement = lazyWithRetry(() => import("@/pages/UserManagement"));
const SuperAdminDashboard = lazyWithRetry(() => import("@/pages/SuperAdminDashboard"));
const CooperativesManagement = lazyWithRetry(() => import("@/pages/CooperativesManagement"));
const AuditLog = lazyWithRetry(() => import("@/pages/AuditLog"));
const CreateCooperative = lazyWithRetry(() => import("@/pages/CreateCooperative"));

const Trash = lazyWithRetry(() => import("@/pages/Trash"));
const LoginEvents = lazyWithRetry(() => import("@/pages/LoginEvents"));
const Partners = lazyWithRetry(() => import("@/pages/Partners"));
const ShipmentTemplates = lazyWithRetry(() => import("@/pages/ShipmentTemplates"));
const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));
const OAuthConsent = lazyWithRetry(() => import("@/pages/OAuthConsent"));

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
