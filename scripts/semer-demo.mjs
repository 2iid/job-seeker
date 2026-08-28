#!/usr/bin/env node
// =============================================================================
//  semer-demo.mjs — de quoi REGARDER le produit.
//
//  Une base vide montre des écrans vides. Ils sont soignés — le composant
//  `Vide` exige une conduite à tenir — mais on ne peut pas juger un produit sur
//  ses états vides.
//
//  ── Deux règles que ce fichier s'impose ──
//
//  1. Les données semées doivent SURVIVRE AUX CONTRÔLES DU PRODUIT. Chaque
//     citation d'une correspondance figure mot pour mot dans la description de
//     l'annonce, parce que `citationPresente()` le vérifie. Semer des preuves
//     que le produit rejetterait donnerait une démonstration flatteuse et
//     fausse.
//
//  2. Le jeu montre les CAS QUI FÂCHENT autant que les autres : une
//     candidature dont on ignore si elle est partie, une escalade, une offre
//     écartée. Une démonstration qui n'affiche que des succès ne dit rien du
//     produit — et cache justement les écrans les plus travaillés.
//
//  Usage :
//    node scripts/semer-demo.mjs [--adresse <courriel>] [--effacer]
// =============================================================================
import pg from 'pg'

const args = process.argv.slice(2)
const lire = (nom, defaut) => {
  const i = args.indexOf(nom)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : defaut
}
const ADRESSE = lire('--adresse', 'demo@cabine.test')
const EFFACER = args.includes('--effacer')
const MARQUE = 'demo-cabine'

const db = new pg.Client(
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54522/postgres',
)

// ---------------------------------------------------------------------------
//  Les annonces. La description est le texte que le produit CITE ; les preuves
//  plus bas en sont extraites littéralement.
// ---------------------------------------------------------------------------
const OFFRES = [
  {
    ref: 'gh-1', source: 'greenhouse', palier: 'a',
    employeur: 'Northwind Analytics', titre: 'Ingénieure back-end (H/F)',
    lieu: 'Lyon', pays: 'FR', teletravail: 'Hybride, 2 jours sur site',
    salaire: [48000_00, 58000_00],
    description:
      "Nous cherchons une ingénieure back-end pour renforcer l'équipe plateforme. " +
      'Vous travaillerez principalement en TypeScript et Node.js sur nos services de données. ' +
      "Une expérience de PostgreSQL en production est attendue. Le poste est en hybride, " +
      'deux jours sur site à Lyon. Rémunération entre 48 et 58 k€ selon expérience.',
  },
  {
    ref: 'lv-2', source: 'lever', palier: 'a',
    employeur: 'Atelier Vif', titre: 'Développeuse Node.js — plateforme',
    lieu: 'Télétravail', pays: 'FR', teletravail: 'Télétravail complet',
    salaire: [52000_00, 62000_00],
    description:
      "Atelier Vif recrute une développeuse Node.js pour sa plateforme interne. " +
      'Le télétravail est complet et la société est distribuée sur trois fuseaux. ' +
      "Nous attachons de l'importance à la revue de code et aux tests automatisés. " +
      'Contact : recrutement@ateliervif.example',
  },
  {
    ref: 'ab-3', source: 'ashby', palier: 'a',
    employeur: 'Meridian Labs', titre: 'Staff Engineer — données',
    lieu: 'Paris', pays: 'FR', teletravail: 'Hybride',
    salaire: [70000_00, 85000_00],
    description:
      'Meridian Labs cherche un ou une Staff Engineer pour son domaine données. ' +
      "Vous définirez l'architecture des pipelines et accompagnerez trois équipes. " +
      'Le poste demande une expérience confirmée de PostgreSQL et de la modélisation.',
  },
  {
    ref: 'wk-4', source: 'workable', palier: 'a',
    employeur: 'Sablier', titre: 'Développeuse Python — facturation',
    lieu: 'Nantes', pays: 'FR', teletravail: 'Hybride, 3 jours sur site',
    salaire: [45000_00, 52000_00],
    description:
      'Sablier renforce son équipe facturation. Python, PostgreSQL, et une attention ' +
      'particulière portée à la justesse des montants. Trois jours sur site à Nantes.',
  },
  {
    ref: 'sr-5', source: 'smartrecruiters', palier: 'a',
    employeur: 'Groupe Vireo', titre: 'Lead Backend',
    lieu: 'Bordeaux', pays: 'FR', teletravail: 'Hybride',
    salaire: [60000_00, 72000_00],
    description:
      'Groupe Vireo recherche un Lead Backend pour encadrer une équipe de cinq personnes. ' +
      'Stack Node.js et PostgreSQL. Encadrement et contribution technique à parts égales.',
  },
  {
    ref: 'jt-6', source: 'jobtech-se', palier: 'a',
    employeur: 'Nordvik AB', titre: 'Backend Developer (remote, EU)',
    lieu: 'Stockholm', pays: 'SE', teletravail: 'Remote within EU',
    salaire: [55000_00, 65000_00],
    description:
      'Nordvik AB is hiring a backend developer. The role is remote within the EU. ' +
      'We work with TypeScript, Node.js and PostgreSQL. Application deadline is in three weeks.',
  },
  {
    ref: 'pc-7', source: 'plateforme-assistee', palier: 'c',
    employeur: 'Fondation Clairval', titre: 'Développeuse — système de dons',
    lieu: 'Marseille', pays: 'FR', teletravail: 'Sur site',
    salaire: [40000_00, 46000_00],
    description:
      'La Fondation Clairval recrute via une plateforme que nous ne savons pas lire ' +
      'automatiquement. Le poste porte sur le système de dons.',
  },
  {
    ref: 'rd-8', source: 'greenhouse', palier: 'a',
    employeur: 'Pergame SA', titre: 'Développeur PHP — présentiel 5 jours',
    lieu: 'Lille', pays: 'FR', teletravail: 'Présentiel intégral',
    salaire: [38000_00, 42000_00],
    description:
      'Pergame SA recrute en présentiel intégral, cinq jours par semaine sur site à Lille. ' +
      'Stack PHP historique. Astreintes le week-end une semaine sur quatre.',
  },
]

const CV = `Camille Roussel — Ingénieure back-end
Lyon · camille.roussel@exemple.fr

EXPÉRIENCE
2021–2026  Ingénieure back-end, Halcyon Data (Lyon)
           Services de données en TypeScript et Node.js. PostgreSQL en production,
           du schéma aux plans de requête. Revue de code quotidienne.
2018–2021  Développeuse, Petit Atelier Numérique (Lyon)
           API internes, migrations de données, tests automatisés.

FORMATION
2018       Master Informatique, Université Claude-Bernard Lyon 1

COMPÉTENCES
TypeScript · Node.js · PostgreSQL · tests automatisés · revue de code`

const LETTRE = (employeur, titre) =>
  `Madame, Monsieur,

Votre annonce pour le poste de ${titre} chez ${employeur} correspond à ce que je fais
depuis huit ans : des services de données en TypeScript et Node.js, adossés à PostgreSQL,
avec une exigence de revue et de tests.

Je serais heureuse d'en parler avec vous.

Camille Roussel`

async function effacer() {
  await db.query("select set_config('app.suppression_compte', 'true', false)")
  const { rowCount } = await db.query(
    `delete from public.offres where identifiant_source like $1`, [`${MARQUE}-%`],
  )
  console.log(`  offres de démonstration supprimées : ${rowCount ?? 0}`)
  console.log('  (les opportunités, dossiers, reçus et incidents suivent en cascade)')
}

async function semer() {
  const { rows: u } = await db.query('select id from auth.users where email = $1', [ADRESSE])
  if (u.length === 0) {
    console.error(
      `\n✗ Aucun compte pour « ${ADRESSE} » sur cette base.\n` +
      `  Demandez d'abord un lien depuis /connexion avec cette adresse — le compte naît à ce\n` +
      `  moment-là — puis relancez. Ou passez --adresse <votre courriel>.\n`,
    )
    process.exitCode = 1
    return
  }
  const { rows: p } = await db.query('select id from public.profiles where user_id = $1', [u[0].id])
  const profil = p[0].id

  await db.query('begin')

  // ── Le profil, complet : les écrans de profil ne sont pas des formulaires vides
  await db.query(
    `update public.profiles
        set display_name = 'Camille Roussel',
            titre_accroche = 'Ingénieure back-end — TypeScript, Node.js, PostgreSQL',
            locale = 'fr', fuseau = 'Europe/Paris',
            cran_autonomie = 'agir-apres-accord',
            parcours_termine_le = now() - interval '9 days',
            quota_quotidien = 5, plage_debut_minutes = 480, plage_fin_minutes = 1200
      where id = $1`, [profil],
  )
  await db.query('delete from public.experiences where profile_id = $1', [profil])
  await db.query(
    `insert into public.experiences (profile_id, employeur, intitule, lieu, debut, fin, description, ordre)
     values ($1,'Halcyon Data','Ingénieure back-end','Lyon','2021-03-01',null,
             'Services de données en TypeScript et Node.js. PostgreSQL en production.',1),
            ($1,'Petit Atelier Numérique','Développeuse','Lyon','2018-09-01','2021-02-28',
             'API internes, migrations de données, tests automatisés.',2)`, [profil],
  )
  await db.query('delete from public.formations where profile_id = $1', [profil])
  await db.query(
    `insert into public.formations (profile_id, etablissement, intitule, obtenue_en)
     values ($1,'Université Claude-Bernard Lyon 1','Master Informatique',2018)`, [profil],
  )
  await db.query('delete from public.competences where profile_id = $1', [profil])
  await db.query(
    `insert into public.competences (profile_id, libelle)
     select $1, x from unnest(array['TypeScript','Node.js','PostgreSQL','tests automatisés','revue de code']) x`,
    [profil],
  )

  await db.query('delete from public.criteres_recherche where profile_id = $1', [profil])
  await db.query(
    `insert into public.criteres_recherche
       (profile_id, version, intitules, seniorite, presence, zones,
        salaire_min_unites_mineures, salaire_devise, secteurs, langues, mots_redhibitoires)
     values ($1, 1, array['ingénieure back-end','développeuse'], 'confirmé',
             array['télétravail','hybride'], array['FR','EU'], 4500000, 'EUR',
             array['logiciel'], array['fr','en'], array['présentiel intégral','astreinte'])`,
    [profil],
  )

  // ── Un mandat sur le courriel : sans lui, l'envoi autonome n'a pas d'assise
  await db.query('delete from public.mandats where profile_id = $1', [profil])
  await db.query(
    `insert into public.mandats (profile_id, canal, cran, apercu_empreinte, accorde_le, expire_le)
     values ($1,'email','agir-seul','sha256:demo', now() - interval '8 days', now() + interval '22 days')`,
    [profil],
  )

  // ── Les annonces
  const idOffre = {}
  for (const o of OFFRES) {
    const { rows } = await db.query(
      `insert into public.offres
         (source, palier, identifiant_source, employeur_canonique, employeur_affiche, titre,
          url_candidature, lieu, pays, teletravail_texte, description,
          salaire_min_unites_mineures, salaire_max_unites_mineures, salaire_devise, salaire_periode,
          publiee_le, vue_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'EUR','an',
               now() - interval '6 days', now() - interval '2 days')
       returning id`,
      [o.source, o.palier, `${MARQUE}-${o.ref}`,
       o.employeur.toLowerCase().replace(/[^a-z0-9]+/g, '-'), o.employeur, o.titre,
       `https://exemple.invalid/${o.ref}`, o.lieu, o.pays, o.teletravail, o.description,
       o.salaire[0], o.salaire[1]],
    )
    idOffre[o.ref] = rows[0].id
  }

  /** Une preuve n'est valable que si la citation figure DANS l'annonce. */
  const preuve = (ref, libelle, citation) => {
    const texte = OFFRES.find((o) => o.ref === ref).description
    if (!texte.includes(citation)) {
      throw new Error(`citation absente de l'annonce ${ref} : « ${citation} »`)
    }
    return { libelle, citation }
  }

  const opp = async (ref, o) => {
    const { rows } = await db.query(
      `insert into public.opportunites
         (profile_id, offre_id, statut, score, correspondances, manques, redhibitoires,
          citations_rejetees, exclue, criteres_version, approbation_expire_le, motif_refus)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,1,$10,$11) returning id`,
      [profil, idOffre[ref], o.statut, o.score ?? null,
       JSON.stringify(o.corr ?? []), JSON.stringify(o.manques ?? []),
       JSON.stringify(o.redhib ?? []), o.rejetees ?? 0, o.exclue ?? false, o.expire ?? null,
       o.motif ?? null],
    )
    return rows[0].id
  }

  const oGh = await opp('gh-1', {
    statut: 'prete-a-envoyer', score: 86, rejetees: 1,
    corr: [
      preuve('gh-1', 'TypeScript et Node.js', 'principalement en TypeScript et Node.js'),
      preuve('gh-1', 'PostgreSQL en production', "expérience de PostgreSQL en production est attendue"),
      preuve('gh-1', 'Salaire au-dessus de votre plancher', 'entre 48 et 58 k€ selon expérience'),
    ],
    manques: [{ libelle: 'Deux jours sur site à Lyon, alors que vous visez le télétravail' }],
  })

  const oLv = await opp('lv-2', {
    statut: 'envoyee', score: 91,
    corr: [
      preuve('lv-2', 'Télétravail complet', 'Le télétravail est complet'),
      preuve('lv-2', 'Revue de code et tests', "l'importance à la revue de code et aux tests automatisés"),
    ],
  })

  const oAb = await opp('ab-3', {
    statut: 'incertaine', score: 74,
    corr: [preuve('ab-3', 'PostgreSQL confirmé', 'une expérience confirmée de PostgreSQL')],
    manques: [{ libelle: 'Encadrement de trois équipes — absent de votre parcours' }],
  })

  const oWk = await opp('wk-4', {
    statut: 'en-file', score: 68,
    corr: [preuve('wk-4', 'Python et PostgreSQL', 'Python, PostgreSQL')],
    manques: [{ libelle: 'Trois jours sur site à Nantes' }],
  })

  const oSr = await opp('sr-5', {
    statut: 'escalade', score: 79,
    corr: [preuve('sr-5', 'Node.js et PostgreSQL', 'Stack Node.js et PostgreSQL')],
  })

  await opp('jt-6', {
    statut: 'detectee', score: 88,
    expire: new Date(Date.now() + 36 * 3600_000),
    corr: [
      preuve('jt-6', 'Télétravail dans l’UE', 'The role is remote within the EU'),
      preuve('jt-6', 'TypeScript, Node.js, PostgreSQL', 'TypeScript, Node.js and PostgreSQL'),
    ],
  })

  await opp('pc-7', {
    statut: 'detectee', exclue: true,
    redhib: [{ type: 'plateforme-assistee',
      explication: 'Cette plateforme ne se lit pas automatiquement : je vous assiste, je ne postule pas.' }],
  })

  await opp('rd-8', {
    // `ecartee` EXIGE un motif : la contrainte `refus_porte_son_motif` existe
    // parce que REQ-006 apprend des refus, et qu'un refus sans motif ne lui
    // apprend rien. Le semoir s'y plie plutôt que de la contourner.
    statut: 'ecartee', exclue: true, motif: 'lieu',
    redhib: [{ type: 'exclusion', motif: 'présentiel intégral',
      citation: 'Pergame SA recrute en présentiel intégral' }],
  })

  // ── Un dossier PRÊT, sur un canal ATS : l'issue nominale de l'ADR-0003
  const pieces = (emp, tit) => JSON.stringify([
    { nature: 'cv', intitule: 'votre CV adapté', contenu: CV, relue: true },
    { nature: 'lettre', intitule: 'la lettre', contenu: LETTRE(emp, tit), relue: true },
  ])

  await db.query(
    `insert into public.dossiers (profile_id, opportunite_id, canal, pieces, pret, issue)
     values ($1,$2,'ats',$3::jsonb,true,'prepare')`,
    [profil, oGh, pieces('Northwind Analytics', 'Ingénieure back-end')],
  )

  // ── Un dossier ENVOYÉ, par courriel, avec sa preuve
  await db.query(
    `insert into public.dossiers
       (profile_id, opportunite_id, canal, pieces, pret, issue,
        confirmation_reference, confirmation_recue_le, destination_adresse, destination_provenance)
     values ($1,$2,'email',$3::jsonb,true,'envoye',
             '<20260826.7f21@ateliervif.example>', now() - interval '30 hours',
             'recrutement@ateliervif.example','contact-enregistre')`,
    [profil, oLv, pieces('Atelier Vif', 'Développeuse Node.js')],
  )
  await db.query(
    `insert into public.recus
       (profile_id, opportunite_id, canal, cv_texte, message_texte, cran_au_moment, resultat, envoye_le)
     values ($1,$2,'email',$3,$4,'agir-seul','envoye', now() - interval '30 hours')`,
    [profil, oLv, CV,
     `## la lettre\n\n${LETTRE('Atelier Vif', 'Développeuse Node.js')}`],
  )

  // ── Une réclamation ABANDONNÉE, et l'incident qu'elle produit.
  //    C'est l'écran le plus important du jeu : il montre ce que le produit
  //    fait quand il NE SAIT PAS.
  await db.query(
    `insert into public.dossiers
       (profile_id, opportunite_id, canal, pieces, pret, issue, reclame_le, reclame_par, bail_jusqu_a)
     values ($1,$2,'email',$3::jsonb,true,'en-cours',
             now() - interval '5 hours','worker-1', now() - interval '4 hours')`,
    [profil, oAb, pieces('Meridian Labs', 'Staff Engineer')],
  )
  await db.query(
    `insert into public.incidents (profile_id, opportunite_id, genre, constat, conduite, detecte_le)
     values ($1,$2,'action-sans-preuve',
       'Une candidature à « Staff Engineer — données » a été interrompue au moment de l’envoi. Je ne peux pas dire si elle est partie.',
       'Regardez vos messages envoyés, ou l’espace candidat de cet employeur. Dites-moi ensuite si je dois candidater ou classer sans suite — je ne recommence pas seul.',
       now() - interval '4 hours')`,
    [profil, oAb],
  )

  // ── Une escalade : destination non vérifiée
  await db.query(
    `insert into public.dossiers (profile_id, opportunite_id, canal, pieces, pret, issue, issue_motif)
     values ($1,$2,'email',$3::jsonb,true,'refuse','destination-non-verifiee')`,
    [profil, oSr, pieces('Groupe Vireo', 'Lead Backend')],
  )

  // ── Une en file : quota du jour atteint
  await db.query(
    `insert into public.dossiers (profile_id, opportunite_id, canal, pieces, pret, issue, issue_motif)
     values ($1,$2,'ats',$3::jsonb,true,'prepare','quota-atteint')`,
    [profil, oWk, pieces('Sablier', 'Développeuse Python')],
  )

  await db.query('commit')

  console.log(`\n✓ Jeu de démonstration semé pour ${ADRESSE}`)
  console.log('    profil complet · 8 annonces · 8 opportunités · 5 dossiers · 1 reçu · 1 incident')
  console.log('\n  À regarder, dans cet ordre :')
  console.log('    /profil        le profil et son parcours')
  console.log('    /criteres      ce qui est rédhibitoire')
  console.log('    /opportunites  8 offres, dont 2 écartées et pourquoi')
  console.log('    /approbations  une offre qui attend votre accord (36 h)')
  console.log('    /recus         un envoi prouvé — ET une candidature sans preuve')
  console.log('\n  Pour tout retirer :  node scripts/semer-demo.mjs --effacer\n')
}

await db.connect()
try {
  if (EFFACER) await effacer()
  else await semer()
} catch (e) {
  await db.query('rollback').catch(() => {})
  console.error('\n✗', e.message, '\n')
  process.exitCode = 1
} finally {
  await db.end()
}
