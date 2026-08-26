/**
 * JOB-012 — le thème, à parité réelle.
 *
 * Trois états, pas deux : « sombre », « clair », et **« comme mon système »**,
 * qui est le défaut. Un produit qui n'offre que deux boutons force un choix
 * que l'utilisateur a déjà fait ailleurs, et ne le suit plus quand il change.
 *
 * Le piège que ce fichier existe pour éviter : le CLIGNOTEMENT. Si le thème est
 * appliqué par React après l'hydratation, un utilisateur en mode sombre reçoit
 * un éclair blanc en pleine figure à chaque navigation. Sur un produit qu'on
 * consulte la nuit parce qu'on dort mal en cherchant du travail, ce n'est pas
 * un détail esthétique.
 */

export type Choix = 'clair' | 'sombre' | 'systeme'
export type ThemeResolu = 'clair' | 'sombre'

export const CLE_STOCKAGE = 'cabine-theme'

export function estChoixValide(v: unknown): v is Choix {
  return v === 'clair' || v === 'sombre' || v === 'systeme'
}

/** Ce que l'utilisateur voit réellement, une fois le choix confronté au système. */
export function resoudre(choix: Choix, systemeEstSombre: boolean): ThemeResolu {
  if (choix === 'clair' || choix === 'sombre') return choix
  return systemeEstSombre ? 'sombre' : 'clair'
}

/**
 * Le script inséré AVANT la première peinture. Volontairement minuscule et
 * sans dépendance : il s'exécute avant tout le reste, et une erreur ici
 * laisserait la page sans thème du tout.
 *
 * Il est aussi volontairement TOLÉRANT : un stockage inaccessible (navigation
 * privée, cookies bloqués) ne doit pas empêcher la page de s'afficher.
 */
export const SCRIPT_ANTI_CLIGNOTEMENT = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(CLE_STOCKAGE)});
if(c!=='clair'&&c!=='sombre'&&c!=='systeme'){c='systeme'}
var s=c==='systeme'?(matchMedia('(prefers-color-scheme: dark)').matches?'sombre':'clair'):c;
document.documentElement.setAttribute('data-theme',s==='sombre'?'dark':'light');
}catch(e){}})()`

/** Le libellé du prochain état — un bouton doit dire ce qu'il FAIT. */
export function libelleSuivant(choix: Choix): { suivant: Choix; libelle: string } {
  switch (choix) {
    case 'systeme': return { suivant: 'clair', libelle: 'Passer en clair' }
    case 'clair': return { suivant: 'sombre', libelle: 'Passer en sombre' }
    case 'sombre': return { suivant: 'systeme', libelle: 'Suivre mon système' }
  }
}

/** Le nom d'attribut attendu par tokens.css. Traduit une fois, ici. */
export function attributHtml(t: ThemeResolu): 'dark' | 'light' {
  return t === 'sombre' ? 'dark' : 'light'
}
