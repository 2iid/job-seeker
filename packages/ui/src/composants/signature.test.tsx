import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { creerTraducteur, LOCALES } from '@job-seeker/i18n'
import { STATUSES, TIERS } from '../status'
import { CarteApprobation, Fraicheur, LigneDeVie, Score, ageEnMots, barresAllumees } from './index'

/**
 * Rendu côté serveur, sans DOM : on vérifie ce qui est réellement ÉMIS.
 * Un composant testé sur ses props prouve seulement qu'on a passé des props.
 */
const html = (n: React.ReactElement): string => renderToStaticMarkup(n)
const t = creerTraducteur('fr')

/** Le texte visible, dépouillé des balises — ce qu'un humain lit vraiment. */
const texte = (n: React.ReactElement): string =>
  html(n).replace(/<[^>]*>/g, ' ').replace(/&#x27;/g, '’').replace(/\s+/g, ' ').trim()

describe('JOB-017 — la fraîcheur ne promet que ce qu’on sait', () => {
  it('le palier ne se sépare JAMAIS de l’âge', () => {
    // « il y a 4 min » seul laisse croire que l'offre a été publiée il y a
    // quatre minutes. Sur le palier B c'est faux : on sait quand on l'a VUE.
    const s = texte(<Fraicheur palier="a" minutes={4} t={t} />)
    expect(s).toContain('Palier A')
    expect(s).toContain('il y a 4 min')
  })

  it('le palier B dit « vue », parce qu’on ignore la date de publication', () => {
    expect(texte(<Fraicheur palier="b" minutes={22} t={t} />)).toContain('vue il y a 22 min')
  })

  it('le palier C n’a pas d’âge, et le dit', () => {
    const s = texte(<Fraicheur palier="c" minutes={null} t={t} />)
    expect(s).toContain('sans relevé')
  })

  it('le palier C annonce SA LIMITE sans qu’on ait à la demander', () => {
    // C'est le seul palier dont la promesse est une limite : les deux autres
    // annoncent ce qu'on fait, celui-là ce qu'on ne fera pas. La masquer par
    // défaut laisserait croire cette plateforme couverte comme les autres.
    expect(texte(<Fraicheur palier="c" minutes={null} t={t} />)).toContain('je ne postule pas')
    // Les paliers A et B, eux, ne bavardent que si on le demande.
    expect(texte(<Fraicheur palier="a" minutes={2} t={t} />)).not.toContain('premiers dossiers')
    expect(texte(<Fraicheur palier="a" minutes={2} t={t} avecPromesse />)).toContain('premiers dossiers')
  })

  it('aucun rang chiffré n’est jamais affiché', () => {
    // « 3ᵉ candidat » est une information que nous n'avons pas. La fabriquer
    // gagnerait de la confiance sur une chose fausse.
    for (const palier of ['a', 'b', 'c'] as const) {
      const s = texte(<Fraicheur palier={palier} minutes={5} t={t} avecPromesse />)
      expect(s, palier).not.toMatch(/\b\d+(e|er|ère|ᵉ)\s+(candidat|dossier)/i)
    }
  })

  it('aucune alarme : ni rouge, ni compte à rebours', () => {
    // L'histogramme DÉCROÎT : c'est une mesure, pas une urgence. Une offre de
    // quatre heures n'est pas un problème à régler.
    for (const minutes of [1, 30, 200, 5000]) {
      const s = html(<Fraicheur palier="a" minutes={minutes} t={t} />)
      expect(s, `${minutes} min`).not.toContain('accent-critique')
      expect(texte(<Fraicheur palier="a" minutes={minutes} t={t} />)).not.toMatch(/reste|expire|plus que/i)
    }
  })

  it('la fraîcheur n’emprunte jamais l’accent d’attente', () => {
    // --accent-attente veut dire « un humain doit agir ». L'employer pour de
    // la fraîcheur diluerait le seul signal qui doit rester rare.
    for (const palier of ['a', 'b', 'c'] as const) {
      expect(html(<Fraicheur palier={palier} minutes={3} t={t} />)).not.toContain('accent-attente')
    }
  })

  it('l’histogramme décroît avec l’âge, sans jamais s’éteindre', () => {
    expect(barresAllumees('a', 1)).toBe(TIERS.a.bars)
    expect(barresAllumees('a', 30)).toBeLessThan(TIERS.a.bars)
    expect(barresAllumees('a', 100_000)).toBe(1) // zéro barre se lirait « éteint »
  })

  it('l’âge cesse de compter les minutes au-delà d’une journée', () => {
    // Une précision d'une minute sur une offre de trois jours est une
    // précision inventée.
    expect(ageEnMots(0.4, t)).toBe('à l’instant')
    expect(ageEnMots(45, t)).toBe('il y a 45 min')
    expect(ageEnMots(200, t)).toBe('il y a 3 h')
    expect(ageEnMots(60 * 24 * 3, t)).toBe('il y a 3 j')
  })
})

describe('JOB-014 — un score dont l’explication est ATTEIGNABLE', () => {
  const preuves = [{ libelle: 'Fintech', citation: 'Expérience en fintech exigée' }]

  it('le dépliage est un <details> natif, pas un état de script', () => {
    // Un dépliage qui dépend d'un script n'est pas atteignable quand le script
    // n'a pas chargé — et c'est exactement là que quelqu'un regarde un nombre
    // sans savoir d'où il sort.
    const s = html(
      <Score valeur={78} correspondances={preuves} manques={[]} bloquants={[]} citationsRejetees={0} t={t} />,
    )
    expect(s).toContain('<details')
    expect(s).toContain('<summary')
  })

  it('la citation de l’offre est rendue avec la preuve', () => {
    const s = texte(
      <Score valeur={78} correspondances={preuves} manques={[]} bloquants={[]} citationsRejetees={0} t={t} />,
    )
    expect(s).toContain('Expérience en fintech exigée')
  })

  it('les citations écartées sont COMPTÉES, jamais masquées', () => {
    // Retirer les inventions sans le dire présenterait le reste comme s'il
    // n'y avait rien eu.
    const s = texte(
      <Score valeur={78} correspondances={preuves} manques={[]} bloquants={[]} citationsRejetees={2} t={t} />,
    )
    expect(s).toMatch(/2 citation/)
  })

  it('les bloquants passent AVANT les correspondances', () => {
    // Un score de 92 avec un rédhibitoire ne doit pas se lire « presque
    // parfait ». L'ordre de lecture est un argument.
    const s = texte(
      <Score
        valeur={92}
        correspondances={preuves}
        manques={[]}
        bloquants={[{ explication: 'Travailler en DE demande une démarche.' }]}
        citationsRejetees={0}
        t={t}
      />,
    )
    expect(s.indexOf('démarche')).toBeLessThan(s.indexOf('Fintech'))
  })

  it('sans aucune preuve, il le DIT au lieu de montrer un nombre nu', () => {
    const s = texte(
      <Score valeur={64} correspondances={[]} manques={[]} bloquants={[]} citationsRejetees={0} t={t} />,
    )
    expect(s).toContain('n’ai rien pu citer')
  })

  it('une offre exclue n’affiche PAS de score', () => {
    // La personne a demandé à ne pas la voir ; lui présenter un nombre
    // reviendrait à la lui montrer.
    const s = texte(
      <Score valeur={91} correspondances={preuves} manques={[]} bloquants={[]} citationsRejetees={0} exclue t={t} />,
    )
    expect(s).not.toContain('91')
    expect(s).toContain('demandé à ne pas voir')
  })

  it('la jauge n’est jamais rouge — un score bas n’est pas une faute', () => {
    expect(html(<Score valeur={12} correspondances={[]} manques={[]} bloquants={[]} citationsRejetees={0} t={t} />))
      .not.toContain('accent-critique')
  })

  it('le score reste borné même si l’appelant sort de l’intervalle', () => {
    const s = html(<Score valeur={140} correspondances={[]} manques={[]} bloquants={[]} citationsRejetees={0} t={t} />)
    expect(s).toContain('width:100%')
  })
})

describe('JOB-015 — refuser doit être aussi facile qu’envoyer', () => {
  const carte = (
    <CarteApprobation
      employeur="Qonto"
      intitule="Product Manager"
      resume="CV adapté et lettre en français."
      t={t}
      envoyer="/envoyer"
      refuser="/refuser"
    />
  )

  it('la première phrase dit ce qui n’est PAS parti', () => {
    // Pas « Prêt à envoyer ! », qui décrit l'état de la machine, mais la
    // réponse à la question que la personne se pose en arrivant.
    const s = texte(carte)
    expect(s).toContain('Rien n’est parti')
    expect(s.indexOf('Rien n’est parti')).toBeLessThan(s.indexOf('Envoyer'))
  })

  it('les deux boutons ont la même hauteur de cible', () => {
    // Un refus rétréci serait une pression — et une pression ici enverrait une
    // candidature au nom de quelqu'un qui n'avait pas vraiment dit oui.
    const s = html(carte)
    const hauteurs = [...s.matchAll(/min-height:(\d+)px/g)].map((m) => m[1])
    expect(new Set(hauteurs).size).toBe(1)
    expect(hauteurs[0]).toBe('44')
  })

  it('le composant ne sait pas envoyer — il rend des formulaires', () => {
    // Un composant d'interface capable de déclencher un envoi serait un
    // endroit de plus d'où l'envoi peut partir.
    expect(html(carte)).toContain('action="/envoyer"')
    expect(html(carte)).toContain('action="/refuser"')
  })

  it('la fenêtre d’annulation est annoncée AVANT le bouton', () => {
    const s = texte(
      <CarteApprobation
        employeur="Qonto" intitule="PM" resume="—" t={t}
        envoyer="/e" refuser="/r" secondesAnnulation={20}
      />,
    )
    expect(s).toContain('20 s')
    expect(s.indexOf('20 s')).toBeLessThan(s.indexOf('Envoyer'))
  })
})

describe('JOB-016 — le silence est une information', () => {
  it('un journal vide EXPLIQUE au lieu de laisser conclure', () => {
    // « Rien depuis 6 h » seul se lit « c'est cassé ». REQ-003 interdit qu'une
    // absence de résultat se présente comme une absence tout court.
    const s = texte(<LigneDeVie evenements={[]} etat="en-veille" depuis="6 h" t={t} />)
    expect(s).toContain('6 h')
    expect(s).toContain('marché est calme')
  })

  it('chaque entrée porte sa forme, pas seulement sa couleur', () => {
    const s = html(
      <LigneDeVie
        evenements={[{ id: '1', statut: 'envoyee', quoi: 'Candidature envoyée chez Qonto', quand: '14:02' }]}
        etat="au-travail"
        depuis="2 min"
        t={t}
      />,
    )
    expect(s).toContain('<svg')
    expect(texte(
      <LigneDeVie
        evenements={[{ id: '1', statut: 'envoyee', quoi: 'x', quand: '14:02' }]}
        etat="au-travail" depuis="2 min" t={t}
      />,
    )).toContain('Envoyée')
  })

  it('l’état « arrêtée » se voit — c’est ce qu’on vient vérifier', () => {
    const s = texte(<LigneDeVie evenements={[]} etat="arrete" depuis="1 j" t={t} />)
    expect(s).toContain('Arrêtée')
  })
})

describe('G6 — les deux langues rendent, sans chaîne manquante', () => {
  it.each(LOCALES)('%s : aucun composant signature ne laisse fuir une clé brute', (locale) => {
    const tr = creerTraducteur(locale)
    const rendus = [
      texte(<Fraicheur palier="b" minutes={22} t={tr} avecPromesse />),
      texte(<Score valeur={78} correspondances={[{ libelle: 'x', citation: 'y' }]} manques={[]} bloquants={[{ explication: 'z' }]} citationsRejetees={1} t={tr} />),
      texte(<CarteApprobation employeur="Q" intitule="PM" resume="—" t={tr} envoyer="/e" refuser="/r" modifier="/m" secondesAnnulation={20} />),
      texte(<LigneDeVie evenements={[{ id: '1', statut: 'escalade', quoi: 'a', quand: 'b' }]} etat="au-travail" depuis="2 min" t={tr} />),
      texte(<LigneDeVie evenements={[]} etat="arrete" depuis="1 j" t={tr} />),
    ]
    for (const r of rendus) {
      // Une clé non traduite se rend telle quelle (« statut.envoyee ») : c'est
      // délibéré, et c'est ce motif qu'on cherche ici.
      expect(r, r.slice(0, 80)).not.toMatch(/\b(statut|palier|score|approbation|agent|commun|fraicheur)\.[a-z-]+\b/)
    }
  })

  it('toutes les formes de statut sont distinctes une fois rendues', () => {
    const svgs = Object.values(STATUSES).map((s) =>
      html(<LigneDeVie evenements={[{ id: '1', statut: 'envoyee', quoi: 'x', quand: 'y' }]} etat="au-travail" depuis="—" t={t} />)
        .length && s.shape,
    )
    expect(new Set(svgs).size).toBe(Object.keys(STATUSES).length)
  })
})
