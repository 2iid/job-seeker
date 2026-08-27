import type pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { admin, creerCompte } from '@job-seeker/testing'
import { deciderReprise, reclamer, reprendre } from '../../apps/worker/src/envoi/idempotence.ts'
import { traiterEnvoi } from '../../apps/worker/src/envoi/traiter.ts'
import { verifierDestination } from '../../apps/worker/src/envoi/destination.ts'
import type { Transport } from '../../apps/worker/src/envoi/envoyer.ts'
import type { EtatEnvoi } from '@job-seeker/profil'

/**
 * JOB-051 — « même après un incident ou un redémarrage du worker ».
 *
 * Ces sept mots sont la raison d'être de ce fichier. Le reste de l'idempotence
 * se raisonne et se teste en mémoire ; celle-ci ne se prouve qu'en base, parce
 * que la garantie EST une contrainte d'unicité et un ordre d'écriture.
 */
let c: pg.Client
let profil: string
let opportunite: string

beforeAll(async () => {
  c = await admin()
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@idem.test'")
  const u = await creerCompte(c, 'alice@idem.test')
  profil = (await c.query<{ id: string }>(
    'select id from public.profiles where user_id = $1', [u])).rows[0]!.id
  const offre = (await c.query<{ id: string }>(
    `insert into public.offres (source, palier, identifiant_source, employeur_canonique,
                                employeur_affiche, titre, url_candidature)
     values ('test', 'a', 'ref-idem-1', 'exemple', 'Exemple', 'Infirmier',
             'https://exemple.fr/1') returning id`)).rows[0]!.id
  opportunite = (await c.query<{ id: string }>(
    `insert into public.opportunites (profile_id, offre_id) values ($1, $2) returning id`,
    [profil, offre])).rows[0]!.id
}, 30_000)

beforeEach(async () => { await c.query('delete from public.dossiers') })

afterAll(async () => {
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@idem.test'")
  await c.query("delete from public.offres where identifiant_source = 'ref-idem-1'")
  await c.end()
})

const params = (parQui: string, bailSecondes = 60) => ({
  profileId: profil, opportuniteId: opportunite, canal: 'email' as const, parQui, bailSecondes,
})

describe('réclamer avant d’envoyer', () => {
  it('la première réclamation est tenue', async () => {
    const r = await reclamer(c, params('w1'))
    expect(r.tenue).toBe(true)
  })

  it('la seconde ne l’est pas, et dit ce qui existe', async () => {
    await reclamer(c, params('w1'))
    const r = await reclamer(c, params('w2'))
    expect(r.tenue).toBe(false)
    expect(r.etat?.issue).toBe('en-cours')
    expect(r.etat?.reclamePar).toBe('w1')
  })

  it('DEUX WORKERS SIMULTANÉS : un seul obtient la réclamation', async () => {
    // Le test que la logique en mémoire ne peut pas rendre. La garantie n'est
    // ni dans le code ni dans l'ordre des appels : elle est dans la contrainte
    // d'unicité, et c'est la seule chose qui tienne quand deux processus
    // arrivent à la même milliseconde.
    const clients = await Promise.all([admin(), admin(), admin(), admin(), admin()])
    try {
      const r = await Promise.all(
        clients.map((x, i) => reclamer(x, params(`w${String(i)}`))))
      expect(r.filter((x) => x.tenue)).toHaveLength(1)
    } finally {
      await Promise.all(clients.map((x) => x.end()))
    }
  })
})

describe('le worker meurt entre la réclamation et l’envoi', () => {
  const tuerLeWorker = async () =>
    // Le bail expire : c'est exactement ce que laisse derrière lui un worker
    // qui ne revient pas.
    c.query(
      `update public.dossiers set bail_jusqu_a = now() - interval '1 minute'
        where opportunite_id = $1`, [opportunite])

  it('la réclamation N’EST PAS rendue à un autre worker', async () => {
    await reclamer(c, params('w1'))
    await tuerLeWorker()
    const r = await reclamer(c, params('w2'))
    expect(r.tenue).toBe(false)
  })

  it('et l’état lu conduit à « incertain », jamais à « envoyer »', async () => {
    await reclamer(c, params('w1'))
    await tuerLeWorker()
    const r = await reclamer(c, params('w2'))
    const d = deciderReprise(r.etat, new Date())
    expect(d.action).toBe('incertain')
  })

  it('reprendre() refuse une réclamation abandonnée', async () => {
    // La reprise ne vaut que pour 'prepare' et 'refuse' — les deux seules
    // issues dont on sait que rien n'est sorti. La condition est DANS le
    // `where` : décidée en mémoire puis écrite sans condition, elle rouvrirait
    // la course qu'on vient de fermer.
    await reclamer(c, params('w1'))
    await tuerLeWorker()
    expect(await reprendre(c, { ...params('w2'), opportuniteId: opportunite })).toBe(false)
  })

  it('mais l’accepte après une préparation, qui n’a rien fait sortir', async () => {
    await reclamer(c, params('w1'))
    await c.query("update public.dossiers set issue = 'prepare' where opportunite_id = $1", [opportunite])
    expect(await reprendre(c, { ...params('w2'), opportuniteId: opportunite })).toBe(true)
  })
})

describe('après un envoi réussi', () => {
  beforeEach(async () => {
    await reclamer(c, params('w1'))
    await c.query(
      `update public.dossiers
          set issue = 'envoye', confirmation_reference = 'msg-1',
              destination_adresse = 'rh@exemple.fr'
        where opportunite_id = $1`, [opportunite])
  })

  it('une nouvelle tentative est un DOUBLON', async () => {
    const r = await reclamer(c, params('w2'))
    expect(r.tenue).toBe(false)
    expect(deciderReprise(r.etat, new Date()).action).toBe('doublon')
  })

  it('survit à un « redémarrage » : la garantie est en base, pas en mémoire', async () => {
    // Une connexion neuve ne partage rien avec la précédente — c'est ce qu'est
    // un redémarrage, du point de vue du processus.
    const neuf = await admin()
    try {
      const r = await reclamer(neuf, params('w-apres-redemarrage'))
      expect(deciderReprise(r.etat, new Date()).action).toBe('doublon')
    } finally { await neuf.end() }
  })

  it('reprendre() ne peut pas rouvrir un envoi', async () => {
    expect(await reprendre(c, { ...params('w2'), opportuniteId: opportunite })).toBe(false)
  })
})

describe('la contrainte de réclamation', () => {
  it('REFUSE un « en-cours » sans bail ni détenteur', async () => {
    // Une réclamation qui ne dit pas jusqu'à quand n'est pas exploitable au
    // redémarrage — et le redémarrage est précisément le moment où on la lit.
    await expect(
      c.query(
        `insert into public.dossiers (profile_id, opportunite_id, canal, issue)
         values ($1, $2, 'email', 'en-cours')`, [profil, opportunite]),
    ).rejects.toThrow(/dossiers_reclamation_complete/)
  })
})

describe('le transport n’est atteint qu’une fois — la propriété, pas sa forme', () => {
  const ETAT: EtatEnvoi = {
    suppressionDemandeeLe: null, arretUrgenceLe: null,
    parcoursTermineLe: '2026-08-01T00:00:00Z', cranDuCanal: 'agir-seul',
    mandats: [{
      canal: 'email', cran: 'agir-seul', accordeLe: '2026-08-01T00:00:00Z',
      expireLe: null, revoqueLe: null, apercuEmpreinte: 'a',
    }],
    quotaQuotidien: 99, envoyesAujourdHui: 0,
    plageDebutMinutes: 0, plageFinMinutes: 1440, minutesLocales: 600,
  }
  const DEST = (() => {
    const r = verifierDestination('rh@exemple.fr', {
      contacts: [{ adresse: 'rh@exemple.fr', provenance: 'contact-enregistre' }],
      domainesEmployeur: ['exemple.fr'],
    })
    if (!('verifiee' in r)) throw new Error('destination de test invalide')
    return r.verifiee
  })()
  const DOSSIER = {
    opportuniteId: '', canal: 'email' as const, questionsSansReponse: [],
    pieces: [
      { nature: 'cv' as const, intitule: 'CV', contenu: 'x', relue: true },
      { nature: 'lettre' as const, intitule: 'lettre', contenu: 'y', relue: true },
    ],
  }

  it('DEUX TRAITEMENTS SIMULTANÉS n’envoient qu’une seule candidature', async () => {
    // Le test qui compte. Il ne regarde ni l'ordre des lignes ni la forme du
    // SQL : il compte les fois où quelque chose est réellement SORTI.
    let envois = 0
    const transport: Transport = async () => {
      envois += 1
      await new Promise((r) => setTimeout(r, 30))
      return { reference: 'msg', recuLe: new Date().toISOString() }
    }
    const clients = await Promise.all([admin(), admin(), admin()])
    try {
      const issues = await Promise.all(
        clients.map((x, i) =>
          traiterEnvoi(x, {
            etat: ETAT, canal: 'email', dossier: { ...DOSSIER, opportuniteId: opportunite },
            destination: DEST, transport,
            profileId: profil, opportuniteId: opportunite, parQui: `w${String(i)}`,
            cible: { employeurCanonique: 'exemple', titre: 'Infirmier' },
          })),
      )
      expect(envois).toBe(1)
      expect(issues.filter((i) => i.type === 'envoye')).toHaveLength(1)
    } finally {
      await Promise.all(clients.map((x) => x.end()))
    }
  })

  it('une seconde exécution, plus tard, est un doublon et n’envoie rien', async () => {
    let envois = 0
    const transport: Transport = async () => {
      envois += 1
      return { reference: 'msg', recuLe: new Date().toISOString() }
    }
    const travail = {
      etat: ETAT, canal: 'email' as const,
      dossier: { ...DOSSIER, opportuniteId: opportunite },
      destination: DEST, transport,
      profileId: profil, opportuniteId: opportunite, parQui: 'w1',
      cible: { employeurCanonique: 'exemple', titre: 'Infirmier' },
    }
    const premier = await traiterEnvoi(c, travail)
    expect(premier.type).toBe('envoye')
    const second = await traiterEnvoi(c, travail)
    expect(second.type).toBe('refuse')
    if (second.type === 'refuse') expect(second.motif).toBe('doublon')
    expect(envois).toBe(1)
  })

  it('un canal ATS ne réclame rien et reste rejouable', async () => {
    // Une préparation n'a pas d'effet de bord à protéger. Poser une réclamation
    // dessus empêcherait simplement de la refaire — une protection qui ne
    // protège de rien et qui gêne.
    const travail = {
      etat: ETAT, canal: 'ats' as const,
      dossier: { ...DOSSIER, canal: 'ats' as const, opportuniteId: opportunite },
      transport: (async () => { throw new Error('un ATS ne doit jamais atteindre le transport') }) as Transport,
      profileId: profil, opportuniteId: opportunite, parQui: 'w1',
      cible: { employeurCanonique: 'exemple', titre: 'Infirmier' },
    }
    expect((await traiterEnvoi(c, travail)).type).toBe('prepare')
    expect((await traiterEnvoi(c, travail)).type).toBe('prepare')
  })
})

describe('un blocage PASSAGER ne doit pas devenir définitif', () => {
  const ETAT2: EtatEnvoi = {
    suppressionDemandeeLe: null, arretUrgenceLe: null,
    parcoursTermineLe: '2026-08-01T00:00:00Z', cranDuCanal: 'agir-seul',
    mandats: [{
      canal: 'email', cran: 'agir-seul', accordeLe: '2026-08-01T00:00:00Z',
      expireLe: null, revoqueLe: null, apercuEmpreinte: 'a',
    }],
    quotaQuotidien: 5, envoyesAujourdHui: 0,
    plageDebutMinutes: 0, plageFinMinutes: 1440, minutesLocales: 600,
  }
  const DEST2 = (() => {
    const r = verifierDestination('rh@exemple.fr', {
      contacts: [{ adresse: 'rh@exemple.fr', provenance: 'contact-enregistre' }],
      domainesEmployeur: ['exemple.fr'],
    })
    if (!('verifiee' in r)) throw new Error('destination de test invalide')
    return r.verifiee
  })()

  it('une candidature repoussée par le quota part au tour suivant', async () => {
    // LE défaut que ce test aurait dû empêcher, et qui n'avait aucun test :
    // la trace du refus d'hier barrait la route à la tentative d'aujourd'hui.
    // Invisible en test unitaire — il demande DEUX passages, et le premier
    // avait l'air correct.
    let envois = 0
    const transport: Transport = async () => {
      envois += 1
      return { reference: 'msg', recuLe: new Date().toISOString() }
    }
    const travail = (etat: EtatEnvoi) => ({
      etat, canal: 'email' as const, destination: DEST2, transport,
      dossier: {
        opportuniteId: opportunite, canal: 'email' as const, questionsSansReponse: [],
        pieces: [
          { nature: 'cv' as const, intitule: 'CV', contenu: 'x', relue: true },
          { nature: 'lettre' as const, intitule: 'lettre', contenu: 'y', relue: true },
        ],
      },
      profileId: profil, opportuniteId: opportunite, parQui: 'w1',
      cible: { employeurCanonique: 'exemple', titre: 'Infirmier' },
    })

    // Jour 1 : quota atteint. La candidature attend, elle n'est pas perdue.
    const jour1 = await traiterEnvoi(c, travail({ ...ETAT2, envoyesAujourdHui: 5 }))
    expect(jour1.type).toBe('refuse')
    if (jour1.type === 'refuse') expect(jour1.motif).toBe('quota-atteint')
    expect(envois).toBe(0)

    // Jour 2 : le quota est libre. Elle doit partir.
    const jour2 = await traiterEnvoi(c, travail({ ...ETAT2, envoyesAujourdHui: 0 }))
    expect(jour2.type, JSON.stringify(jour2)).toBe('envoye')
    expect(envois).toBe(1)
  })

  it('mais un envoi PARTI ne se rouvre pas, lui', async () => {
    // Autonome : le beforeEach efface les dossiers entre les tests, et
    // s'appuyer sur l'état laissé par le précédent rendait ce test dépendant
    // d'un ordre d'exécution que rien ne garantit.
    await reclamer(c, { profileId: profil, opportuniteId: opportunite, canal: 'email',
      parQui: 'w1', bailSecondes: 60 })
    await c.query(
      `update public.dossiers set issue = 'envoye', confirmation_reference = 'm',
              destination_adresse = 'rh@exemple.fr', reclame_le = null,
              reclame_par = null, bail_jusqu_a = null
        where opportunite_id = $1`, [opportunite])
    expect(await reprendre(c, {
      opportuniteId: opportunite, canal: 'email', parQui: 'w2', bailSecondes: 60,
    })).toBe(false)
  })
})
