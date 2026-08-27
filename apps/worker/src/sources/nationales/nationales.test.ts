import { describe, expect, it } from 'vitest'
import { analyser, connecteurTheMuse, lieuConcorde } from './themuse.ts'
import { analyserJobTech, connecteurJobTech, echeances } from './jobtech.ts'
import { couvertureAffirmable, estAveugle, valider } from '../contract.ts'

const offre = (nom: string, lieux: string[], id = 1) => ({
  id, name: nom, publication_date: '2026-08-26T10:00:00Z',
  company: { name: 'Employeur' },
  locations: lieux.map((name) => ({ name })),
  refs: { landing_page: `https://themuse.test/${id}` },
  contents: '<p>Description <b>en HTML</b></p>',
})

describe('lieuConcorde — « Paris, TX » n’est pas Paris', () => {
  it('accepte la ville ET le pays', () => {
    expect(lieuConcorde('Paris, France', 'Paris, France')).toBe(true)
    expect(lieuConcorde('Bangalore, India', 'Bangalore, India')).toBe(true)
  })

  it('refuse la bonne ville dans le mauvais pays', () => {
    // « Paris, TX » existe, il est au Texas, et la source le rend volontiers
    // quand on demande Paris.
    expect(lieuConcorde('Paris, TX', 'Paris, France')).toBe(false)
  })

  it('sans lieu demandé, tout concorde', () => {
    expect(lieuConcorde('Dallas, TX', null)).toBe(true)
  })

  it('la ville seule suffit quand aucun pays n’est demandé', () => {
    expect(lieuConcorde('Lyon, France', 'Lyon')).toBe(true)
    expect(lieuConcorde('Dallas, TX', 'Lyon')).toBe(false)
  })
})

describe('analyser — on ne croit pas le filtre de la source', () => {
  it('écarte ce qui ne concerne PAS le lieu demandé', () => {
    // Le piège mesuré : « Dakar » rend 33 offres dont zéro au Sénégal —
    // vingt « Flexible / Remote » et le reste au Texas.
    const charge = {
      results: [
        offre('Poste au Texas', ['Dallas, TX'], 1),
        offre('Poste à Dakar', ['Dakar, Senegal'], 2),
        offre('Poste à Lockhart', ['Lockhart, TX'], 3),
      ],
    }
    const r = analyser(charge, 'Dakar, Senegal', false)
    expect(r.rendues).toBe(3)
    expect(r.offres.map((o) => o.titre)).toEqual(['Poste à Dakar'])
  })

  it('garde le distanciel quand la personne l’accepte', () => {
    const charge = { results: [offre('Poste distanciel', ['Flexible / Remote'], 1)] }
    expect(analyser(charge, 'Dakar, Senegal', true).offres).toHaveLength(1)
    expect(analyser(charge, 'Dakar, Senegal', false).offres).toEqual([])
  })

  it('marque le distanciel comme tel', () => {
    const r = analyser({ results: [offre('X', ['Flexible / Remote'])] }, null, true)
    expect(r.offres[0]!.teletravailTexte).toBe('distanciel')
  })

  it('rend la description en TEXTE, pas en HTML', () => {
    // Elle finira dans un contexte de modèle : transporter du balisage double
    // la taille pour rien et déplace un problème.
    const r = analyser({ results: [offre('X', ['Paris, France'])] }, null, true)
    expect(r.offres[0]!.description).toBe('Description en HTML')
  })

  it('ne tombe pas sur une réponse malformée', () => {
    expect(analyser(null, null, true)).toEqual({ offres: [], rendues: 0 })
    expect(analyser({ results: 'pas un tableau' }, null, true)).toEqual({ offres: [], rendues: 0 })
    expect(analyser({ results: [{ name: 'sans url ni id' }] }, null, true).offres).toEqual([])
  })
})

describe('le connecteur dit ce qu’il a VRAIMENT retenu', () => {
  const reponse = (charge: unknown, statut = 200): Response =>
    new Response(JSON.stringify(charge), { status: statut, headers: { 'content-type': 'application/json' } })

  it('« partiel » dès qu’on a écarté quelque chose', () => {
    // Reprendre le `page_count` de la source pour annoncer « 6 340 offres à
    // Dakar » serait un mensonge pur — le genre qu'on ne découvre qu'en
    // ouvrant la troisième offre.
    const c = connecteurTheMuse({
      fetch: (async () => reponse({
        results: [offre('Texas', ['Dallas, TX'], 1), offre('Paris', ['Paris, France'], 2)],
      })) as never,
    })
    return c.recolter({ requete: 'x', pays: 'Paris, France' }).then((r) => {
      expect(r.etat).toBe('partiel')
      expect(couvertureAffirmable(r.etat)).toBe(false)
      expect(r.note).toMatch(/n'est pas fiable/)
      expect(r.offres).toHaveLength(1)
    })
  })

  it('une réponse pleine dont RIEN ne concerne le lieu le dit', async () => {
    const c = connecteurTheMuse({
      fetch: (async () => reponse({ results: [offre('Texas', ['Dallas, TX'])] })) as never,
    })
    const r = await c.recolter({ requete: 'x', pays: 'Dakar, Senegal' })
    expect(r.etat).toBe('aucun-resultat')
    expect(r.note).toMatch(/aucune ne concerne Dakar/)
  })

  it('une source injoignable n’est pas une absence d’offres', async () => {
    const c = connecteurTheMuse({ fetch: (async () => { throw new Error('ECONNREFUSED') }) as never })
    const r = await c.recolter({ requete: 'x' })
    expect(estAveugle(r.etat)).toBe(true)
  })

  it('du JSON illisible est un changement de format', async () => {
    const c = connecteurTheMuse({
      fetch: (async () => new Response('pas du json', { status: 200 })) as never,
    })
    expect((await c.recolter({ requete: 'x' })).etat).toBe('format-change')
  })

  it('satisfait le contrat avant d’entrer dans le registre', () => {
    expect(valider(connecteurTheMuse())).toEqual([])
  })
})

describe('JobTech — le portail public suédois', () => {
  const hit = (o: Record<string, unknown> = {}) => ({
    id: 'abc123',
    headline: 'Sjuksköterska',
    employer: { name: 'VÄSTRA GÖTALANDSREGIONEN' },
    workplace_address: { municipality: 'Bengtsfors', region: 'Västra Götalands län' },
    application_details: { url: 'https://employeur.se/postuler/1' },
    webpage_url: 'https://arbetsformedlingen.se/annons/1',
    publication_date: '2026-08-20T00:01:23',
    application_deadline: '2026-09-06T23:59:59',
    description: { text: 'Vi söker en sjuksköterska.' },
    ...o,
  })

  it('lit une offre locale et non-tech', () => {
    // Ce qu'aucune source précédente n'a su rendre : un métier ordinaire, dans
    // une commune donnée, sur place.
    const o = analyserJobTech({ hits: [hit()] })[0]!
    expect(o.titre).toBe('Sjuksköterska')
    expect(o.employeur).toContain('VÄSTRA')
    expect(o.lieu).toBe('Bengtsfors, Västra Götalands län')
  })

  it('préfère le formulaire de l’employeur à l’annonce du portail', () => {
    expect(analyserJobTech({ hits: [hit()] })[0]!.urlCandidature).toBe('https://employeur.se/postuler/1')
  })

  it('… et se rabat sur l’annonce, mais jamais sur rien', () => {
    // Une offre sans lien remplirait le flux de choses sur lesquelles on ne
    // peut pas agir.
    const sansForm = analyserJobTech({ hits: [hit({ application_details: {} })] })[0]!
    expect(sansForm.urlCandidature).toBe('https://arbetsformedlingen.se/annons/1')
    expect(analyserJobTech({ hits: [hit({ application_details: {}, webpage_url: undefined })] }))
      .toEqual([])
  })

  it('rend la DATE LIMITE, que nulle autre source ne donne', () => {
    // C'est exactement ce dont JOB-048 a besoin pour archiver un élément de
    // file plutôt que de l'envoyer après coup. Jusqu'ici cette échéance était
    // toujours nulle, donc la règle ne s'appliquait jamais.
    const m = echeances({ hits: [hit()] })
    expect(m.get('abc123')).toBe('2026-09-06T23:59:59')
  })

  it('une offre sans date limite n’en invente pas', () => {
    expect(echeances({ hits: [hit({ application_deadline: undefined })] }).size).toBe(0)
  })

  it('`remote_work: false` ne devient PAS « présentiel »', () => {
    // `false` peut vouloir dire « présentiel » comme « personne n'a coché ».
    expect(analyserJobTech({ hits: [hit({ remote_work: false })] })[0]!.teletravailTexte).toBeUndefined()
    expect(analyserJobTech({ hits: [hit({ remote_work: true })] })[0]!.teletravailTexte).toBe('distanciel')
  })

  it('une forme inattendue rend une liste vide, jamais une exception', () => {
    expect(analyserJobTech(null)).toEqual([])
    expect(analyserJobTech({ hits: 'pas un tableau' })).toEqual([])
    expect(echeances(null).size).toBe(0)
  })

  it('un conteneur PLEIN dont rien n’est lisible n’est pas une absence', async () => {
    const c = connecteurJobTech({
      fetch: (async () => new Response(JSON.stringify({ hits: [{ forme: 'inconnue' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })) as never,
    })
    const r = await c.recolter({ requete: 'x' })
    expect(r.etat).toBe('format-change')
    expect(estAveugle(r.etat)).toBe(true)
  })

  it('déclaré palier B, pas A', () => {
    // Le portail date la publication CHEZ LUI, pas chez l'employeur. Le
    // déclarer palier A ferait promettre une primeur qu'on n'a pas.
    const c = connecteurJobTech()
    expect(c.palier).toBe('b')
    expect(c.pays).toEqual(['SE'])
    expect(valider(c)).toEqual([])
  })
})
