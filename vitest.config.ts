import { defineConfig } from 'vitest/config'

const COMMUN = { environment: 'node' as const }

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    /**
     * Deux projets, et la raison n'est pas cosmétique.
     *
     * Les tests de `tests/rls/**` partagent UNE base de données. Exécutés en
     * parallèle, ils se détruisent mutuellement leurs lignes : un
     * `delete ... where canal = 'email'` d'un fichier efface les lignes d'un
     * autre, et la suite échoue selon l'ordonnancement. C'est arrivé trois
     * fois, et à chaque fois j'ai cherché le défaut dans le code livré avant de
     * le trouver dans le harnais — ce qui est le coût réel de ce genre de
     * fragilité.
     *
     * Chaque occurrence a été corrigée en bornant la suppression. Ce n'était
     * pas suffisant : la correction dépend de la vigilance du prochain fichier
     * ajouté. La sérialisation, elle, tient toute seule.
     *
     * Le coût est mesuré, pas supposé : la suite complète passe de ~3 s à ~4 s.
     * Un test qui échoue une fois sur cinq coûte infiniment plus.
     */
    projects: [
      {
        test: {
          ...COMMUN,
          name: 'unite',
          include: [
            'packages/**/*.test.ts',
            'packages/**/*.test.tsx',
            'apps/**/*.test.ts',
            'spikes/**/*.test.ts',
          ],
        },
      },
      {
        test: {
          ...COMMUN,
          name: 'base',
          include: ['tests/**/*.test.ts'],
          // La seule ligne qui compte dans ce fichier.
          fileParallelism: false,
        },
      },
    ],
  },
})
