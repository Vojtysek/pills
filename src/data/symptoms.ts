/**
 * Maps everyday complaints to ATC groups (WHO drug classification) that are commonly used for them.
 * A product matches when its ATC code starts with one of the prefixes.
 *
 * This is a hand-curated starting point for finding what's already at home — not medical advice.
 * Review it with a pharmacist before relying on it.
 */
export type Symptom = {
  id: string;
  label: string;
  /** Extra words users might type, without diacritics handling (normalized at search time). */
  keywords: string[];
  atcPrefixes: string[];
};

export const SYMPTOMS: Symptom[] = [
  {
    id: 'headache',
    label: 'Bolest hlavy',
    keywords: ['hlava', 'migréna', 'headache'],
    // Paracetamol, metamizole, aspirin (N02B); ibuprofen, naproxen (M01AE)
    atcPrefixes: ['N02B', 'M01AE'],
  },
  {
    id: 'fever',
    label: 'Horečka',
    keywords: ['teplota', 'zvýšená teplota', 'fever'],
    atcPrefixes: ['N02B', 'M01AE'],
  },
  {
    id: 'toothache',
    label: 'Bolest zubů',
    keywords: ['zub', 'zuby'],
    atcPrefixes: ['N02B', 'M01AE', 'A01AD'],
  },
  {
    id: 'muscle-joint-pain',
    label: 'Bolest svalů a kloubů',
    keywords: ['záda', 'klouby', 'svaly', 'naražení', 'výron'],
    // Oral ibuprofen/naproxen (M01AE), diclofenac (M01AB) and topical gels (M02A)
    atcPrefixes: ['M01AE', 'M01AB', 'M02A'],
  },
  {
    id: 'menstrual-pain',
    label: 'Menstruační bolest',
    keywords: ['menstruace', 'křeče', 'perioda'],
    // NSAIDs, drotaverine (A03AD) and butylscopolamine (A03BB)
    atcPrefixes: ['M01AE', 'N02B', 'A03AD', 'A03BB'],
  },
  {
    id: 'sore-throat',
    label: 'Bolest v krku',
    keywords: ['krk', 'angína', 'chrapot'],
    // Throat preparations: antiseptics, local anaesthetics, NSAID lozenges
    atcPrefixes: ['R02A'],
  },
  {
    id: 'cough',
    label: 'Kašel',
    keywords: ['suchý kašel', 'vlhký kašel', 'hlen'],
    // Expectorants/mucolytics (R05C) and cough suppressants (R05D)
    atcPrefixes: ['R05'],
  },
  {
    id: 'runny-nose',
    label: 'Rýma a ucpaný nos',
    keywords: ['nos', 'rýma', 'nachlazení', 'chřipka'],
    // Nasal decongestants and sprays (R01A), systemic decongestants (R01B)
    atcPrefixes: ['R01'],
  },
  {
    id: 'allergy',
    label: 'Alergie a senná rýma',
    keywords: ['alergie', 'svědění', 'kopřivka', 'pyl'],
    // Antihistamines (R06A), antiallergic eye drops (S01G), nasal antiallergics (R01AC)
    atcPrefixes: ['R06A', 'S01G', 'R01AC'],
  },
  {
    id: 'diarrhea',
    label: 'Průjem',
    keywords: ['průjem', 'střeva', 'střevní flóra'],
    // Charcoal (A07B), loperamide (A07DA), probiotics and gut flora preparations (A07F), oral rehydration (A07CA)
    atcPrefixes: ['A07B', 'A07CA', 'A07DA', 'A07F'],
  },
  {
    id: 'constipation',
    label: 'Zácpa',
    keywords: ['zácpa', 'projímadlo'],
    atcPrefixes: ['A06'],
  },
  {
    id: 'heartburn',
    label: 'Pálení žáhy',
    keywords: ['žáha', 'žaludek', 'reflux'],
    // Antacids (A02A), H2 blockers (A02BA), proton pump inhibitors (A02BC)
    atcPrefixes: ['A02A', 'A02BA', 'A02BC'],
  },
  {
    id: 'bloating',
    label: 'Nadýmání',
    keywords: ['plynatost', 'nadýmání', 'větry'],
    // Simethicone and other antiflatulents (A03AX)
    atcPrefixes: ['A03AX'],
  },
  {
    id: 'nausea',
    label: 'Nevolnost a cestovní nemoc',
    keywords: ['zvracení', 'nevolnost', 'kinetóza', 'cestování'],
    // Antiemetics incl. motion sickness (A04A). Not R06AE: that group also holds cetirizine.
    atcPrefixes: ['A04A'],
  },
  {
    id: 'wounds',
    label: 'Rány a odřeniny',
    keywords: ['rána', 'odřenina', 'říznutí', 'dezinfekce'],
    // Wound healing (D03), antiseptics (D08), topical antibiotics (D06A)
    atcPrefixes: ['D03', 'D08', 'D06A'],
  },
  {
    id: 'burns',
    label: 'Popáleniny a spáleniny od slunce',
    keywords: ['popálenina', 'spálenina', 'slunce'],
    atcPrefixes: ['D03', 'D04'],
  },
  {
    id: 'itching',
    label: 'Svědění a štípnutí hmyzem',
    keywords: ['štípnutí', 'komár', 'vyrážka', 'ekzém'],
    // Antipruritics (D04), mild topical corticosteroids (D07AA), antihistamines (R06A)
    atcPrefixes: ['D04', 'D07AA', 'R06A'],
  },
  {
    id: 'cold-sore',
    label: 'Opar',
    keywords: ['opar', 'herpes'],
    // Topical antivirals (D06BB)
    atcPrefixes: ['D06BB'],
  },
  {
    id: 'fungal',
    label: 'Plíseň kůže a nehtů',
    keywords: ['plíseň', 'mykóza', 'atletická noha'],
    // Topical antifungals (D01A)
    atcPrefixes: ['D01A'],
  },
  {
    id: 'eyes',
    label: 'Podrážděné nebo suché oči',
    keywords: ['oči', 'oko', 'zánět spojivek'],
    // Ophthalmologicals (S01), incl. artificial tears (S01XA)
    atcPrefixes: ['S01'],
  },
  {
    id: 'sleep',
    label: 'Nespavost a nervozita',
    keywords: ['spánek', 'stres', 'neklid'],
    // Hypnotics and sedatives (N05C), incl. herbal (N05CM)
    atcPrefixes: ['N05C'],
  },
];
