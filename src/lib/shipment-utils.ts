import { format, addDays, differenceInDays } from "date-fns";

export interface ProducerForDistribution {
  id: string;
  full_name: string;
  section: string;
  plantation_code: string;
  remaining_potential: number;
  delivery_potential: number;
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
 * Distribute shipment weight across producers.
 * Rule: each producer contributes 40% of their delivery_potential.
 * Exception: if remaining_potential < 40% of delivery_potential, use all remaining_potential.
 * Skip allocations < 50 kg.
 * Bags are balanced so no bag exceeds +10% of the average bag weight.
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

  // Sort producers by section A-Z
  const sorted = [...producers]
    .filter((p) => p.remaining_potential > 0)
    .sort((a, b) => a.section.localeCompare(b.section));

  // Phase 1: Calculate raw allocations using 40% rule
  const rawAllocations: { producer: ProducerForDistribution; weight: number }[] = [];
  let totalAllocated = 0;

  for (const producer of sorted) {
    if (totalAllocated >= totalWeight) break;

    const threshold = producer.delivery_potential * 0.4;
    let allocation: number;

    if (producer.remaining_potential < threshold) {
      // End-of-delivery: use all remaining
      allocation = producer.remaining_potential;
    } else {
      allocation = threshold;
    }

    if (allocation < 50) continue;

    // Don't exceed what's left to allocate or remaining potential
    allocation = Math.min(allocation, totalWeight - totalAllocated, producer.remaining_potential);
    if (allocation < 50) continue;

    rawAllocations.push({ producer, weight: allocation });
    totalAllocated += allocation;
  }

  if (rawAllocations.length === 0) return [];

  // Scale allocations to match exact total weight
  const scaleFactor = totalWeight / totalAllocated;

  // Phase 2: Calculate bags per producer with +10% max constraint
  const maxBagWeight = avgBagWeight * 1.1;

  let entries = rawAllocations.map((a) => {
    const scaledWeight = a.weight * scaleFactor;
    // Minimum bags needed so no bag exceeds maxBagWeight
    const minBags = Math.max(1, Math.ceil(scaledWeight / maxBagWeight));
    return {
      ...a,
      weight: scaledWeight,
      bags: minBags,
    };
  });

  // Remove any with 0 bags
  entries = entries.filter((b) => b.bags > 0);

  // Adjust total bags to match declared total
  let currentTotalBags = entries.reduce((sum, b) => sum + b.bags, 0);

  if (currentTotalBags < totalBags) {
    // Need to add bags — distribute to those with highest weight per bag
    let diff = totalBags - currentTotalBags;
    while (diff > 0) {
      // Find entry with highest weight/bag ratio
      let bestIdx = 0;
      let bestRatio = 0;
      for (let i = 0; i < entries.length; i++) {
        const ratio = entries[i].weight / entries[i].bags;
        if (ratio > bestRatio) { bestRatio = ratio; bestIdx = i; }
      }
      entries[bestIdx].bags += 1;
      diff--;
    }
  } else if (currentTotalBags > totalBags) {
    // Need to remove bags — remove from those with lowest weight/bag ratio, respecting max constraint
    let diff = currentTotalBags - totalBags;
    while (diff > 0) {
      let bestIdx = -1;
      let bestRatio = Infinity;
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].bags <= 1) continue;
        // Check if removing a bag would exceed maxBagWeight
        const newRatio = entries[i].weight / (entries[i].bags - 1);
        if (newRatio <= maxBagWeight && newRatio < bestRatio) {
          bestRatio = newRatio;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break; // Can't remove more without exceeding limit
      entries[bestIdx].bags -= 1;
      diff--;
    }
  }

  // Phase 3: Assign delivery dates chronologically
  const totalDays = Math.max(differenceInDays(endDate, startDate), 1);
  const dateStep = totalDays / Math.max(entries.length - 1, 1);

  // Phase 4: Assign receipt numbers & finalize weights
  let receiptCounter = lastReceiptNumber;
  const results: DistributionResult[] = [];
  let weightAssigned = 0;

  for (let i = 0; i < entries.length; i++) {
    receiptCounter++;
    const deliveryDate = addDays(startDate, Math.round(i * dateStep));
    let weight: number;
    if (i === entries.length - 1) {
      weight = totalWeight - weightAssigned;
    } else {
      weight = Math.round(entries[i].weight);
    }
    weightAssigned += weight;

    results.push({
      producer_id: entries[i].producer.id,
      full_name: entries[i].producer.full_name,
      section: entries[i].producer.section,
      plantation_code: entries[i].producer.plantation_code,
      allocated_weight: weight,
      num_bags: entries[i].bags,
      delivery_date: format(deliveryDate, "yyyy-MM-dd"),
      receipt_number: String(receiptCounter).padStart(6, "0"),
    });
  }

  return results;
}

// Campagne : source unique de vérité dans `@/lib/campaign`.
export { normalizeCampaign, currentCampaign as getCurrentCampaign, isCampaignStart } from "@/lib/campaign";
