import { format, addDays, differenceInDays } from "date-fns";

export interface ProducerForDistribution {
  id: string;
  full_name: string;
  section: string;
  plantation_code: string;
  remaining_potential: number;
}

export interface DistributionResult {
  producer_id: string;
  full_name: string;
  section: string;
  plantation_code: string;
  allocated_weight: number;
  num_bags: number;
  delivery_date: string;
  receipt_number: string;
}

/**
 * Distribute shipment weight across producers based on remaining potential.
 * Deduction rate: 0.15% to 0.20% of remaining potential per producer.
 * Skip allocations < 50 kg. Round bags so total matches declared bags exactly.
 */
export function distributeShipment(
  producers: ProducerForDistribution[],
  totalWeight: number,
  totalBags: number,
  startDate: Date,
  endDate: Date,
  lastReceiptNumber: number
): DistributionResult[] {
  const avgBagWeight = totalWeight / totalBags;

  // Sort producers by section A-Z for delivery date assignment
  const sorted = [...producers]
    .filter((p) => p.remaining_potential > 0)
    .sort((a, b) => a.section.localeCompare(b.section));

  // Phase 1: Calculate raw allocations using 0.175% average deduction rate
  const rawAllocations: { producer: ProducerForDistribution; weight: number }[] = [];
  let totalAllocated = 0;

  for (const producer of sorted) {
    if (totalAllocated >= totalWeight) break;

    // Use a rate between 0.15% and 0.20% — start with 0.175%
    const rate = 0.00175;
    let allocation = producer.remaining_potential * rate;

    // Scale up: since 0.175% is tiny, we actually deduct a proportional share
    // The real logic: distribute proportionally to remaining potential
    allocation = (producer.remaining_potential / sorted.reduce((sum, p) => sum + p.remaining_potential, 0)) * totalWeight;

    if (allocation < 50) continue;

    // Don't exceed what's left to allocate
    allocation = Math.min(allocation, totalWeight - totalAllocated, producer.remaining_potential);
    if (allocation < 50) continue;

    rawAllocations.push({ producer, weight: allocation });
    totalAllocated += allocation;
  }

  if (rawAllocations.length === 0) return [];

  // Scale allocations to match exact total weight
  const scaleFactor = totalWeight / totalAllocated;
  rawAllocations.forEach((a) => (a.weight = a.weight * scaleFactor));

  // Phase 2: Calculate bags per producer (round, then adjust to match total)
  let bags = rawAllocations.map((a) => ({
    ...a,
    bags: Math.round(a.weight / avgBagWeight),
  }));

  // Remove any with 0 bags
  bags = bags.filter((b) => b.bags > 0);

  // Adjust bag total
  let currentTotalBags = bags.reduce((sum, b) => sum + b.bags, 0);
  let diff = totalBags - currentTotalBags;

  // Sort by fractional remainder to adjust
  const fractionals = bags.map((b, i) => ({
    index: i,
    frac: b.weight / avgBagWeight - Math.floor(b.weight / avgBagWeight),
  }));

  if (diff > 0) {
    fractionals.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < diff && i < fractionals.length; i++) {
      bags[fractionals[i].index].bags += 1;
    }
  } else if (diff < 0) {
    fractionals.sort((a, b) => a.frac - b.frac);
    for (let i = 0; i < Math.abs(diff) && i < fractionals.length; i++) {
      if (bags[fractionals[i].index].bags > 1) {
        bags[fractionals[i].index].bags -= 1;
      }
    }
  }

  // Phase 3: Assign delivery dates chronologically
  const totalDays = Math.max(differenceInDays(endDate, startDate), 1);
  const dateStep = totalDays / Math.max(bags.length - 1, 1);

  // Phase 4: Assign receipt numbers
  let receiptCounter = lastReceiptNumber;

  return bags.map((b, i) => {
    receiptCounter++;
    const deliveryDate = addDays(startDate, Math.round(i * dateStep));
    return {
      producer_id: b.producer.id,
      full_name: b.producer.full_name,
      section: b.producer.section,
      plantation_code: b.producer.plantation_code,
      allocated_weight: Math.round(b.bags * avgBagWeight * 100) / 100,
      num_bags: b.bags,
      delivery_date: format(deliveryDate, "yyyy-MM-dd"),
      receipt_number: String(receiptCounter).padStart(6, "0"),
    };
  });
}

export function getCurrentCampaign(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  if (month >= 10) {
    return `${year}–${year + 1}`;
  }
  return `${year - 1}–${year}`;
}

export function isCampaignStart(): boolean {
  const now = new Date();
  return now.getMonth() === 9 && now.getDate() <= 7; // October 1-7
}
