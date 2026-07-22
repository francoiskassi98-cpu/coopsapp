import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, List, Coins } from "lucide-react";
import ProducersAnalytics from "@/components/producers/ProducersAnalytics";
import PrimeProducer from "@/components/producers/PrimeProducer";
import ProducersList from "@/pages/ProducersList";

export default function Producers() {
  return (
    <div className="p-4 md:p-6">
      <Tabs defaultValue="analytics" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Vue d'ensemble
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2">
            <List className="h-4 w-4" /> Liste
          </TabsTrigger>
          <TabsTrigger value="prime" className="gap-2">
            <Coins className="h-4 w-4" /> Prime producteur
          </TabsTrigger>
        </TabsList>
        <TabsContent value="analytics" className="mt-0">
          <ProducersAnalytics />
        </TabsContent>
        <TabsContent value="list" className="mt-0 -mx-6 -mb-6">
          <ProducersList />
        </TabsContent>
        <TabsContent value="prime" className="mt-0">
          <PrimeProducer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
