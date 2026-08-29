import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Un défaut RÉCURRENT de mes propres tests, et la quatrième occurrence en trois
 * jours : compter des lignes SANS clause `where`, dans une base qui porte aussi
 * les lignes des autres fichiers de test et, sur une machine de développement,
 * le jeu de démonstration.
 *
 * Les quatre fois, le test a échoué sur du voisinage et j'ai d'abord cherché le
 * défaut dans le code livré. C'est le coût réel de ce genre de fragilité : pas
 * l'échec, mais le temps passé à soupçonner la mauvaise chose.
 *
 * La sérialisation ajoutée avec JOB-055 a supprimé la casse la plus grossière —
 * deux fichiers qui s'effacent mutuellement leurs lignes — mais pas celle-ci :
 * un `count(*)` global reste faux même exécuté seul, dès que la base contient
 * autre chose.
 *
 * Une consigne ne suffit pas : j'ai écrit trois fois le commentaire « borné à
 * SON opportunité » avant de refaire l'erreur une quatrième. Voici la règle,
 * exécutable.
 */
const DOSSIER = new URL('.', import.meta.url).pathname

/**
 * On extrait les LITTÉRAUX SQL, puis on regarde chacun. Un premier jet
 * cherchait le motif directement dans le texte avec une négation en tête :
 *
 *     /delete\s+from\s+public\.\w+(?!\s*where)/
 *
 * Il signalait `delete from public.contacts where …`. La cause vaut d'être
 * notée, parce qu'elle se reproduit : `\w+` RÉTROGRADE. Il lâche le « s » de
 * `contacts`, la négation regarde alors « s where », n'y voit pas `\s*where`,
 * et la considère satisfaite. Une négation placée après un quantificateur
 * gourmand ne dit pas ce qu'on croit.
 *
 * Analyser le littéral entier supprime le problème ET gère le multi-ligne,
 * que la version regex ne voyait pas non plus.
 */
function sansCommentaires(source: string): string {
  // Remplacé par des espaces plutôt que supprimé : les numéros de ligne des
  // littéraux restants doivent rester justes, sinon le rapport pointe à côté.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length))
}

function litterauxSql(brut: string): { texte: string; ligne: number }[] {
  // Les commentaires de CE dépôt citent volontiers le SQL qu'ils décrivent,
  // entre accents graves. Les lire comme du code faisait signaler la prose qui
  // explique le défaut — au même endroit que le défaut.
  const source = sansCommentaires(brut)
  const out: { texte: string; ligne: number }[] = []
  // Backticks et apostrophes simples : les deux formes employées ici.
  for (const m of source.matchAll(/`([^`]*)`|'([^'\n]*)'/g)) {
    const texte = m[1] ?? m[2] ?? ''
    if (!/\b(?:select|delete|insert|update)\b/i.test(texte)) continue
    out.push({ texte, ligne: source.slice(0, m.index).split('\n').length })
  }
  return out
}

const TABLE = String.raw`(?:public|worker|audit)\.\w+`

function portéeManquante(sql: string): boolean {
  const compte = new RegExp(String.raw`count\(\*\)[\s\S]*?\bfrom\s+${TABLE}`, 'i').test(sql)
  const efface = new RegExp(String.raw`\bdelete\s+from\s+${TABLE}`, 'i').test(sql)
  if (!compte && !efface) return false
  return !/\bwhere\b/i.test(sql)
}

/**
 * Les exceptions, chacune avec sa raison. Une exception sans raison est une
 * règle qu'on a fini par contourner.
 */
const TOLERE: Record<string, string> = {
  'profiles.test.ts':
    'invariants du socle : ils interrogent le catalogue pour TOUTES les tables, c’est leur objet',
  'fonctions-definer.test.ts':
    'invariant du socle : il balaie toutes les fonctions security definer',
  'export-suppression.test.ts':
    'invariant de complétude : il compare l’export au schéma entier',
  'portee-des-assertions.test.ts': 'ce fichier — il cite les motifs qu’il interdit',
}

describe('les assertions de base sont bornées à leur propre fixture', () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.test.ts'))

  it('trouve bien des fichiers à examiner', () => {
    expect(fichiers.length).toBeGreaterThan(8)
  })

  it('aucun comptage ni suppression global hors des invariants du socle', () => {
    const coupables: string[] = []
    for (const f of fichiers) {
      if (f in TOLERE) continue
      for (const l of litterauxSql(readFileSync(join(DOSSIER, f), 'utf8')))
        if (portéeManquante(l.texte)) coupables.push(`${f}:${String(l.ligne)}`)
    }
    expect(coupables, 'assertion(s) qui mesurent le voisinage plutôt que leur fixture').toEqual([])
  })

  it('chaque exception porte une raison, pas seulement un nom', () => {
    for (const [f, raison] of Object.entries(TOLERE))
      expect(raison.length, f).toBeGreaterThan(10)
  })
})
