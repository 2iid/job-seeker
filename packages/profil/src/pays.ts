/**
 * Les codes pays, tels que la personne les a saisis.
 *
 * On normalise la forme — « fr , sn » devient `['FR','SN']` — mais on ne
 * DEVINE pas : « France » n'est pas transformé en « FR ». Une correspondance de
 * noms de pays, en deux langues, sur un produit qui vise tous les marchés, est
 * exactement le genre de conversion qui a l'air juste et qui range la Guinée
 * sous « GN » un jour et « GIN » un autre.
 *
 * Et ce champ n'est pas n'importe lequel : c'est l'autorisation de travail,
 * le seul critère rédhibitoire absolu de REQ-005. Un code mal deviné ici, et
 * l'agent postule dans un pays où la personne n'a pas le droit de travailler.
 * L'écran propose une liste ; la saisie libre reste littérale.
 */
export function lireCodesPays(brut: string): string[] {
  return [
    ...new Set(
      brut
        .split(/[,;\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c)),
    ),
  ]
}
