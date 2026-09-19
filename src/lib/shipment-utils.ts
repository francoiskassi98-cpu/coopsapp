import { format, addDays, differenceInDays } from "date-fns";

export interface ProducerForDistribution {
  id: string;
  full_name: string;
  nom?: string | null;
  prenom?: string | null;
  section: string;
  plantation_code: string;
  carte_ccc?: string | null;
  remaining_potential: number;
  delivery_potential: number;
}

export interface DistributionResult {
  producer_id: string;
  full_name: string;
  nom?: string | null;
  prenom?: string | null;
  section: string;
  plantation_code: string;
  carte_ccc?: string | null;
  allocated_weight: number;
  num_bags: number;
  delivery_date: string;
  receipt_number: string;
}

const MIN_ALLOCATION_KG = 50;
const MAX_BAGS_PER_PRODUCER = 15;
export const BAG_WEIGHT_TOLERANCE_KG = 5;

export function computeAverageBagWeight(
  totalWeight: number,
  totalBags: number
): number {
  if (!(totalWeight > 0) || !(totalBags > 0)) return 0;
  return Math.ceil(totalWeight / totalBags);
}

export function bagWeightRange(
  averageBagWeight: number
): { min: number; max: number } {
  return {
    min: Math.max(1, averageBagWeight - BAG_WEIGHT_TOLERANCE_KG),
    max: averageBagWeight + BAG_WEIGHT_TOLERANCE_KG,
  };
}

function randomInt(min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function isBagWeightInRange(
  weight: number,
  bags: number,
  averageBagWeight: number
): boolean {
  if (!Number.isInteger(weight) || !Number.isInteger(bags) || bags <= 0) {
    return false;
  }

  const { min, max } = bagWeightRange(averageBagWeight);
  const weightPerBag = weight / bags;

  return weightPerBag >= min && weightPerBag <= max;
}

export function verifyDistributionTotals(
  lines: { allocated_weight: number; num_bags: number }[],
  totalWeight: number,
  totalBags: number
): {
  ok: boolean;
  weightSum: number;
  bagSum: number;
  reason?: string;
} {
  const weightSum = lines.reduce(
    (sum, line) => sum + Number(line.allocated_weight),
    0
  );

  const bagSum = lines.reduce(
    (sum, line) => sum + Number(line.num_bags),
    0
  );

  const allInteger = lines.every(
    (line) =>
      Number.isInteger(Number(line.allocated_weight)) &&
      Number.isInteger(Number(line.num_bags)) &&
      Number(line.num_bags) > 0
  );

  if (!allInteger) {
    return {
      ok: false,
      weightSum,
      bagSum,
      reason: "decimal",
    };
  }

  if (weightSum !== totalWeight || bagSum !== totalBags) {
    return {
      ok: false,
      weightSum,
      bagSum,
      reason: "mismatch",
    };
  }

  return {
    ok: true,
    weightSum,
    bagSum,
  };
}

export function distributeShipment(
  producers: ProducerForDistribution[],
  totalWeight: number,
  totalBags: number,
  startDate: Date,
  endDate: Date,
  lastReceiptNumber: number
): DistributionResult[] {
  if (
    !Number.isInteger(totalWeight) ||
    !Number.isInteger(totalBags) ||
    totalWeight <= 0 ||
    totalBags <= 0
  ) {
    return [];
  }

  const averageBagWeight = computeAverageBagWeight(
    totalWeight,
    totalBags
  );

  const { min: minBagWeight, max: maxBagWeight } =
    bagWeightRange(averageBagWeight);

  const candidates = producers
    .filter(
      (producer) =>
        Number(producer.remaining_potential) >= MIN_ALLOCATION_KG
    )
    .map((producer) => {
      const potential = Number(producer.remaining_potential);

      // 20 % du potentiel réel, sans arrondi préalable
      const twentyPercent = potential * 0.2;

      return {
        producer,
        potential,
        maxDeliveryWeight: Math.min(
          potential,
          twentyPercent
        ),
      };
    })
    .filter(
      (candidate) =>
        candidate.maxDeliveryWeight >= MIN_ALLOCATION_KG
    )
    .sort(() => Math.random() - 0.5);

  if (candidates.length === 0) return [];

  type Candidate = {
    producer: ProducerForDistribution;
    allocated_weight: number;
    num_bags: number;
    weight_per_bag: number;
  };

  const generateOptions = (
    producer: ProducerForDistribution,
    maxDeliveryWeight: number
  ): Candidate[] => {
    const options: Candidate[] = [];
    const used = new Set<string>();

    const maxWeight = Math.floor(maxDeliveryWeight);

    for (
      let bags = 1;
      bags <= MAX_BAGS_PER_PRODUCER;
      bags++
    ) {
      const maxPossibleWeightPerBag = Math.floor(
        maxWeight / bags
      );

      if (maxPossibleWeightPerBag < minBagWeight) continue;

      const upperWeightPerBag = Math.min(
        maxBagWeight,
        maxPossibleWeightPerBag
      );

      for (
        let weightPerBag = minBagWeight;
        weightPerBag <= upperWeightPerBag;
        weightPerBag++
      ) {
        const weight = weightPerBag * bags;

        if (weight < MIN_ALLOCATION_KG) continue;
        if (weight > maxWeight) continue;
        if (weight > producer.remaining_potential) continue;

        const key = `${weight}-${bags}`;

        if (used.has(key)) continue;

        used.add(key);

        options.push({
          producer,
          allocated_weight: weight,
          num_bags: bags,
          weight_per_bag: weightPerBag,
        });
      }
    }

    // Ordre aléatoire pour éviter une distribution toujours identique
    return options.sort(() => Math.random() - 0.5);
  };

  const searchExact = (
    index: number,
    selected: Candidate[],
    currentWeight: number,
    currentBags: number
  ): Candidate[] | null => {
    if (
      currentWeight === totalWeight &&
      currentBags === totalBags
    ) {
      return selected;
    }

    if (currentWeight > totalWeight) return null;
    if (currentBags > totalBags) return null;
    if (index >= candidates.length) return null;

    const remainingWeight = totalWeight - currentWeight;
    const remainingBags = totalBags - currentBags;

    if (remainingBags <= 0) return null;

    const candidate = candidates[index];

    const options = generateOptions(
      candidate.producer,
      candidate.maxDeliveryWeight
    );

    /*
     * Priorité aux poids/sacs aléatoires.
     * Aucun +1/-1 artificiel.
     */
    const randomizedOptions = options.sort(
      () => Math.random() - 0.5
    );

    for (const option of randomizedOptions) {
      if (option.num_bags > remainingBags) continue;
      if (option.allocated_weight > remainingWeight) continue;

      if (
        option.allocated_weight >
        candidate.maxDeliveryWeight
      ) {
        continue;
      }

      if (
        !isBagWeightInRange(
          option.allocated_weight,
          option.num_bags,
          averageBagWeight
        )
      ) {
        continue;
      }

      const result = searchExact(
        index + 1,
        [...selected, option],
        currentWeight + option.allocated_weight,
        currentBags + option.num_bags
      );

      if (result) return result;
    }

    // Producteur non utilisé
    return searchExact(
      index + 1,
      selected,
      currentWeight,
      currentBags
    );
  };

  let solution: Candidate[] | null = null;

  /*
   * Plusieurs tentatives afin de conserver une vraie
   * variabilité aléatoire entre les chargements.
   */
  for (let attempt = 0; attempt < 30; attempt++) {
    candidates.sort(() => Math.random() - 0.5);

    solution = searchExact(
      0,
      [],
      0,
      0
    );

    if (solution) break;
  }

  if (!solution || solution.length === 0) {
    return [];
  }

  /*
   * Vérification stricte du potentiel individuel.
   */
  for (const item of solution) {
    const potential = Number(
      item.producer.remaining_potential
    );

    const maxAllowed = potential * 0.2;

    if (item.allocated_weight > maxAllowed) {
      return [];
    }

    if (item.allocated_weight > potential) {
      return [];
    }

    if (
      item.num_bags < 1 ||
      item.num_bags > MAX_BAGS_PER_PRODUCER
    ) {
      return [];
    }

    if (
      !isBagWeightInRange(
        item.allocated_weight,
        item.num_bags,
        averageBagWeight
      )
    ) {
      return [];
    }
  }

  /*
   * Contrôle des totaux.
   */
  const weightSum = solution.reduce(
    (sum, item) =>
      sum + item.allocated_weight,
    0
  );

  const bagSum = solution.reduce(
    (sum, item) =>
      sum + item.num_bags,
    0
  );

  if (weightSum !== totalWeight) return [];
  if (bagSum !== totalBags) return [];

  /*
   * Mélange final.
   */
  solution.sort(() => Math.random() - 0.5);

  /*
   * Dates chronologiques.
   */
  const totalDays = Math.max(
    differenceInDays(endDate, startDate),
    1
  );

  const dateStep =
    totalDays /
    Math.max(solution.length - 1, 1);

  let receiptCounter = lastReceiptNumber;

  const results: DistributionResult[] =
    solution.map((item, index) => {
      receiptCounter++;

      return {
        producer_id: item.producer.id,
        full_name: item.producer.full_name,
        nom: item.producer.nom ?? null,
        prenom: item.producer.prenom ?? null,
        section: item.producer.section,
        plantation_code:
          item.producer.plantation_code,
        carte_ccc:
          item.producer.carte_ccc ?? null,
        allocated_weight:
          item.allocated_weight,
        num_bags: item.num_bags,
        delivery_date: format(
          addDays(
            startDate,
            Math.round(index * dateStep)
          ),
          "yyyy-MM-dd"
        ),
        receipt_number: String(
          receiptCounter
        ).padStart(6, "0"),
      };
    });

  /*
   * Vérification finale absolue.
   */
  const check = verifyDistributionTotals(
    results,
    totalWeight,
    totalBags
  );

  if (!check.ok) {
    return [];
  }

  /*
   * Vérification finale du poids/sac.
   */
  const validBagWeights = results.every(
    (result) =>
      isBagWeightInRange(
        result.allocated_weight,
        result.num_bags,
        averageBagWeight
      )
  );

  if (!validBagWeights) {
    return [];
  }

  return results;
}

export {
  normalizeCampaign,
  currentCampaign as getCurrentCampaign,
  isCampaignStart,
} from "@/lib/campaign";
```

Ce code est basé sur le fichier `shipment` que tu as fourni. 
