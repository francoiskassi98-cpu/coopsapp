import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, List, Coins, Users, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const ProducersAnalytics = lazy(() => import("@/components/producers/ProducersAnalytics"));
const PrimeProducer = lazy(() => import("@/components/producers/PrimeProducer"));
const ProducersList = lazy(() => import("@/pages/ProducersList"));

const TabFallback = () => (
  <div className="flex items-center justify-center py-16 text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin" />
  </div>
);


export default function Producers() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Users}
        title="Producteurs"
        description="Vue analytique, liste des producteurs et calcul des primes de campagne."
      />
      <Tabs defaultValue="analytics" className="w-full">
        <TabsList className="mb-4 bg-muted/50 p-1 rounded-full h-auto flex-wrap">
          <TabsTrigger value="analytics" className="gap-2 rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">
            <BarChart3 className="h-4 w-4" /> Vue d'ensemble
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2 rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">
            <List className="h-4 w-4" /> Liste
          </TabsTrigger>
          <TabsTrigger value="prime" className="gap-2 rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">
            <Coins className="h-4 w-4" /> Prime producteur
          </TabsTrigger>
        </TabsList>
        <TabsContent value="analytics" className="mt-0">
          <Suspense fallback={<TabFallback />}><ProducersAnalytics /></Suspense>
        </TabsContent>
        <TabsContent value="list" className="mt-0 -mx-4 md:-mx-6 -mb-4 md:-mb-6">
          <Suspense fallback={<TabFallback />}><ProducersList /></Suspense>
        </TabsContent>
        <TabsContent value="prime" className="mt-0">
          <Suspense fallback={<TabFallback />}><PrimeProducer /></Suspense>
        </TabsContent>

      </Tabs>
    </div>
  );
}
