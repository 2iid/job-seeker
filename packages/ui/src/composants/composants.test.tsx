import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TOUCH } from '../tokens'
import { Bouton, Erreur, Module, Squelette, TropDeDonnees, Vide } from './index'

/**
 * Rendu côté serveur, sans DOM : on vérifie ce qui est réellement ÉMIS.
 * Un composant testé sur ses props prouve qu'on a bien passé des props.
 */
const html = (n: React.ReactElement): string => renderToStaticMarkup(n)

describe('G3 — la cible tactile est tenue par construction', () => {
  it('un bouton ne peut pas être plus petit que 44 px', () => {
    // Une règle que chaque écran doit se rappeler d'appliquer est une règle
    // qui sera manquée au douzième écran.
    const s = html(<Bouton>Envoyer</Bouton>)
    expect(s).toContain(`min-height:${TOUCH.min}px`)
    expect(s).toContain(`min-width:${TOUCH.min}px`)
  })

  it('la contrainte tient aussi sur le bouton principal', () => {
    expect(html(<Bouton pleine ton="attente">Approuver</Bouton>)).toContain(`min-height:${TOUCH.min}px`)
  })

  it('un aplat emploie le texte prévu pour un aplat', () => {
    // Le contraste de --text-on-fill est mesuré sur le pire des trois accents.
    expect(html(<Bouton pleine ton="attente">X</Bouton>)).toContain('var(--text-on-fill)')
  })
})

describe('les quatre états existent, et le type les impose', () => {
  it('le squelette a la FORME du contenu, et dit ce qu’il fait', () => {
    const s = html(<Squelette libelle="Je relève 34 sources" lignes={3} />)
    expect(s).toContain('Je relève 34 sources')
    expect(s).toContain('role="status"')
    // Sous mouvement réduit, le texte est la SEULE information d'activité :
    // pas de pulsation, donc pas d'animation dans le rendu.
    expect(s).not.toMatch(/animation/i)
  })

  it('l’état vide PORTE une action — le type ne permet pas de l’oublier', () => {
    const s = html(
      <Vide
        titre="Je ne sais pas encore ce que je cherche pour vous."
        explication="Donnez-moi un intitulé et une zone."
        action={{ libelle: 'Définir mes critères', href: '/criteres' }}
      />,
    )
    expect(s).toContain('Définir mes critères')
    expect(s).toContain('href="/criteres"')
  })

  it('l’erreur dit quoi, depuis quand, et ce que ça N’IMPLIQUE PAS', () => {
    const s = html(
      <Erreur
        quoi="Ashby ne répond plus"
        depuis="depuis 11:40"
        ceQueCaNImpliquePas="Ce n’est pas une absence d’offres : 14 employeurs ne sont pas couverts."
      />,
    )
    expect(s).toContain('Ashby ne répond plus')
    expect(s).toContain('depuis 11:40')
    expect(s).toContain('Ce n’est pas une absence d’offres')
    expect(s).toContain('role="alert"')
  })

  it('l’erreur ne peut pas être vague — les trois champs sont obligatoires', () => {
    // @ts-expect-error : une erreur sans « ce que ça n'implique pas » ne compile pas.
    expect(() => html(<Erreur quoi="Oups" depuis="maintenant" />)).toBeDefined()
  })

  it('« trop de données » dit ce qui est écarté, et que rien n’est caché', () => {
    const s = html(
      <TropDeDonnees total={312} montres={24} critere="au-dessus de 70"
        action={{ libelle: 'Tout afficher' }} />,
    )
    expect(s).toContain('312')
    expect(s).toContain('24')
    expect(s).toContain('pas caché')
    expect(s).toContain('Tout afficher')
  })
})

describe('les modules sont jointifs, comme le veut la direction', () => {
  it('un module porte un seul trait, et son en-tête a sa propre surface', () => {
    const s = html(<Module titre="File d’approbation"><p>x</p></Module>)
    expect(s).toContain('var(--surface-module)')
    expect(s).toContain('var(--surface-chrome)')
    expect(s).toContain('1px solid var(--border-module)')
  })

  it('le titre d’un module est un vrai titre, pas un div stylé', () => {
    // Un lecteur d'écran navigue par titres : un div ne se navigue pas.
    expect(html(<Module titre="Suivi"><p>x</p></Module>)).toContain('<h2')
  })

  it('un module sans titre n’émet pas d’en-tête vide', () => {
    expect(html(<Module><p>x</p></Module>)).not.toContain('<h2')
  })
})

describe('aucune couleur littérale n’est émise', () => {
  it.each([
    ['bouton', html(<Bouton pleine ton="machine">X</Bouton>)],
    ['vide', html(<Vide titre="a" explication="b" action={{ libelle: 'c' }} />)],
    ['erreur', html(<Erreur quoi="a" depuis="b" ceQueCaNImpliquePas="c" />)],
    ['squelette', html(<Squelette libelle="x" />)],
  ])('%s ne contient ni hex ni rgb', (_nom, s) => {
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(s).not.toMatch(/\b(rgba?|hsla?|oklch)\s*\(/)
  })
})
