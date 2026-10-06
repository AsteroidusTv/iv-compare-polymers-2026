/** Shared source schema for light-ageing ingestion, graph labels and sweep pairing. */
export const PEARL_QUANTITIES = /** @type {const} */ ([
  { stem: 'pout', source: 'Pout', label: 'Pout', suffix: 'mW_cm2', unit: 'mW/cm²', digits: 2, scale: 1, signed: false },
  { stem: 'voc', source: 'Voc', label: 'Voc', suffix: 'V', unit: 'V', digits: 3, scale: 1, signed: false },
  { stem: 'jsc', source: 'Jsc', label: 'Jsc', suffix: 'mA_cm2', unit: 'mA/cm²', digits: 2, scale: 1, signed: false },
  { stem: 'ff', source: 'FF', label: 'FF', suffix: 'pct', unit: '%', digits: 1, scale: 100, signed: false },
  { stem: 'vmpp', source: 'Vmpp', label: 'Vmpp', suffix: 'V', unit: 'V', digits: 3, scale: 1, signed: false },
  { stem: 'impp', source: 'Impp', label: 'Impp', suffix: 'A', unit: 'A', digits: 5, scale: 1, signed: true },
]);

export const PEARL_METRIC_DEFINITIONS = Object.fromEntries([
  ...PEARL_QUANTITIES.flatMap(quantity => ['mean', 'forward', 'reverse'].map(direction => [
    `light_${quantity.stem}_${direction}_${quantity.suffix}`,
    { ...quantity, direction, family: quantity.stem,
      label: `Light-ageing ${quantity.label} — ${direction === 'mean' ? 'mean forward/reverse' : direction}`,
      figureLabel: `${quantity.label} (${direction === 'mean' ? 'moyenne aller/retour' : direction === 'forward' ? 'balayage avant' : 'balayage arrière'})`,
      forwardKey: `light_${quantity.stem}_forward_${quantity.suffix}`,
      reverseKey: `light_${quantity.stem}_reverse_${quantity.suffix}`, contextOnly: false,
    },
  ])),
  ...[1, 2, 3, 4].flatMap(channel => [
    [`light_temperature_${channel}_C`, { label: `Temperature — sensor ${channel}`, figureLabel: `Température (capteur ${channel})`, family: `temperature_${channel}`, unit: '°C', digits: 2, signed: true, contextOnly: true }],
    [`light_photo_${channel}_raw`, { label: `Photodiode — channel ${channel} (raw signal)`, figureLabel: `Photodiode (canal ${channel}, signal brut)`, family: `photo_${channel}`, unit: 'source units', digits: 7, signed: true, contextOnly: true }],
  ]),
]);
