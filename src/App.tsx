import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Producers from "@/pages/Producers";
import ImportProducers from "@/pages/ImportProducers";
import ChargementsPage from "@/pages/ChargementsPage";
import ExportPage from "@/pages/ExportPage";
import Cancellations from "@/pages/Cancellations";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/producteurs" element={<Producers />} />
            <Route path="/import" element={<ImportProducers />} />
            <Route path="/chargements" element={<ChargementsPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/annulations" element={<Cancellations />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
