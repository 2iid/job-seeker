'use client'

/**
 * JOB-032 — l'écran où l'on relit ce qu'une machine a compris.
 *
 * Deux règles portent tout le reste.
 *
 * 1. **Un champ à vérifier se voit sans la couleur** (G5). La marque est un
 *    triangle ET le mot « à vérifier », pas un liseré orange. Quelqu'un qui ne
 *    distingue pas l'orange du gris — ou qui regarde l'écran au soleil — doit
 *    voir exactement la même information.
 *
 * 2. **Chaque champ montre d'où il vient.** Le passage du CV est consultable
 *    sous le champ. Une extraction qu'on ne peut pas remonter à sa source
 *    n'est pas vérifiable, elle est seulement affirmée — et relire vingt champs
 *    en faisant confiance, ce n'est pas relire.
 */

import { useActionState, useState } from 'react'
import { Bouton, Module } from '@job-seeker/ui'
import { PLAFOND_OCTETS, type Champ, type Proposition } from '@job-seeker/parsing/client'
import { analyser, confirmer, type EtatImport } from './actions'

const MO = Math.round(PLAFOND_OCTETS / (1024 * 1024))

function Marque({ champ }: { champ: Champ<unknown> }) {
  if (champ.confiance === 'sure') return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--accent-attente)',
      }}
    >
      {/* La forme ET le libellé : G5 interdit qu'un statut tienne à la couleur. */}
      <span aria-hidden="true">▲</span> à vérifier
    </span>
  )
}

function ChampTexte({
  nom, libelle, champ, multiligne = false,
}: {
  nom: string
  libelle: string
  champ: Champ<string | null>
  multiligne?: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const style = {
    width: '100%',
    minHeight: '44px', // G3
    padding: 'var(--space-2) var(--space-3)',
    fontSize: '15px',
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
    background: 'var(--surface-page)',
    border: '1px solid var(--border-control)',
    borderRadius: 'var(--radius-control)',
  } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <label htmlFor={nom} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {libelle}
        </label>
        <Marque champ={champ} />
      </div>
      {multiligne ? (
        <textarea id={nom} name={nom} defaultValue={champ.valeur ?? ''} rows={3} style={style} />
      ) : (
        <input id={nom} name={nom} defaultValue={champ.valeur ?? ''} style={style} />
      )}
      {champ.citation !== '' && (
        <>
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            aria-expanded={ouvert}
            style={{
              alignSelf: 'flex-start',
              minHeight: '44px',
              padding: 0,
              fontSize: '12px',
              fontFamily: 'inherit',
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {ouvert ? 'masquer le passage du CV' : 'voir le passage du CV'}
          </button>
          {ouvert && (
            <blockquote
              style={{
                margin: 0,
                padding: 'var(--space-2) var(--space-3)',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                background: 'var(--surface-module)',
                borderLeft: '2px solid var(--border-control)',
                borderRadius: 'var(--radius-control)',
              }}
            >
              {champ.citation}
            </blockquote>
          )}
        </>
      )}
    </div>
  )
}

function Depot() {
  return (
    <Module titre="Importer votre CV">
      <p style={{ margin: '0 0 var(--space-3)', fontSize: '14px', color: 'var(--text-secondary)' }}>
        PDF ou Word (.docx), {MO} Mo au plus. Vous relirez chaque information avant qu’elle ne soit
        enregistrée — rien n’est écrit tant que vous n’avez pas confirmé.
      </p>
      <input
        type="file"
        name="fichier"
        accept=".pdf,.docx"
        required
        style={{ fontSize: '14px', minHeight: '44px' }}
      />
      <div style={{ marginTop: 'var(--space-4)' }}>
        <Bouton type="submit" ton="machine" pleine>
          Lire ce CV
        </Bouton>
      </div>
    </Module>
  )
}

function Refus({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: 'var(--space-4)',
        fontSize: '14px',
        color: 'var(--text-primary)',
        background: 'var(--surface-module)',
        border: '1px solid var(--accent-critique)',
        borderRadius: 'var(--radius-module)',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 600 }}>
        ▲ Ce fichier n’a pas pu être lu
      </strong>
      {message}
      <p style={{ margin: 'var(--space-3) 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
        Votre profil n’a pas été modifié.
      </p>
    </div>
  )
}

function Relecture({ etat }: { etat: Extract<EtatImport, { etape: 'propose' }> }) {
  const [resultat, action] = useActionState(confirmer, null)
  const p: Proposition = etat.proposition

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <input type="hidden" name="documentId" value={etat.documentId} />
      <input type="hidden" name="nomOrigine" value={etat.nomOrigine} />
      {/* Le type vient du VERDICT du serveur sur les octets, pas de
          l'extension du nom : c'est toute la règle de `examiner()`, et la
          redéduire ici la contredirait. */}
      <input type="hidden" name="type" value={etat.type} />
      <input type="hidden" name="taille" value={etat.taille} />

      <div
        style={{
          padding: 'var(--space-4)',
          fontSize: '14px',
          background: 'var(--surface-module)',
          borderRadius: 'var(--radius-module)',
        }}
      >
        {/* On annonce le nombre AVANT la liste : quelqu'un qui sait qu'il y a
            trois choses à vérifier les cherche. Sans ce compte, on fait
            défiler et on confirme. */}
        {p.aVerifier === 0 ? (
          <>Chaque information a été retrouvée mot pour mot dans votre CV. Relisez-les tout de même :
          c’est votre profil qui en dépend.</>
        ) : (
          <>
            <strong style={{ fontWeight: 600 }}>
              {p.aVerifier} information{p.aVerifier > 1 ? 's' : ''} à vérifier
            </strong>{' '}
            — nous n’avons pas retrouvé {p.aVerifier > 1 ? 'ces passages' : 'ce passage'} tel quel dans
            votre CV. {p.aVerifier > 1 ? 'Elles sont marquées' : 'Elle est marquée'} ci-dessous.
          </>
        )}
        {p.contenuSuspect && (
          <p style={{ margin: 'var(--space-3) 0 0', fontSize: '13px' }}>
            ▲ Ce document contient du texte qui ressemble à une consigne adressée à un logiciel. Il a
            été traité comme du texte ordinaire, mais relisez-le avec attention.
          </p>
        )}
      </div>

      <Module titre="Identité">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <ChampTexte nom="nomComplet" libelle="Nom complet" champ={p.nomComplet} />
          <ChampTexte nom="titreAccroche" libelle="Intitulé actuel" champ={p.titreAccroche} />
          <ChampTexte nom="email" libelle="Adresse e-mail" champ={p.email} />
          <ChampTexte nom="telephone" libelle="Téléphone" champ={p.telephone} />
          <ChampTexte nom="localisation" libelle="Localisation" champ={p.localisation} />
        </div>
      </Module>

      {p.experiences.length > 0 && (
        <Module titre="Parcours">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {p.experiences.map((e, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <ChampTexte nom={`exp.${i}.employeur`} libelle="Employeur" champ={e.employeur} />
                <ChampTexte nom={`exp.${i}.intitule`} libelle="Intitulé du poste" champ={e.intitule} />
                <ChampTexte nom={`exp.${i}.debut`} libelle="Début" champ={e.debut} />
                <ChampTexte nom={`exp.${i}.fin`} libelle="Fin (vide si en cours)" champ={e.fin} />
                <ChampTexte nom={`exp.${i}.resume`} libelle="Ce que vous y faites" champ={e.resume} multiligne />
              </div>
            ))}
          </div>
        </Module>
      )}

      {p.competences.length > 0 && (
        <Module titre="Compétences">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {p.competences.map((c, i) => (
              <ChampTexte key={i} nom={`comp.${i}`} libelle={`Compétence ${i + 1}`} champ={c} />
            ))}
          </div>
        </Module>
      )}

      {resultat !== null && (
        <div role="alert" style={{ fontSize: '14px', color: 'var(--accent-critique)' }}>
          {resultat.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Bouton type="submit" ton="machine" pleine>
          Enregistrer ce profil
        </Bouton>
        <a href="/profil/import" style={{ textDecoration: 'none' }}>
          <Bouton>Recommencer avec un autre fichier</Bouton>
        </a>
      </div>
    </form>
  )
}

export function Formulaire() {
  const [etat, action, enCours] = useActionState<EtatImport, FormData>(analyser, { etape: 'vierge' })

  if (etat.etape === 'propose') return <Relecture etat={etat} />

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {etat.etape === 'refuse' && <Refus message={etat.message} />}
      <Depot />
      {enCours && (
        // REQ-003 en version import : on dit ce qui se passe, avec sa durée
        // attendue. Un écran muet pendant quinze secondes se lit « c'est cassé ».
        <p role="status" style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
          Lecture du CV en cours — cela prend une dizaine de secondes.
        </p>
      )}
    </form>
  )
}
