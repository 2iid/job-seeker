import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/.next/**', '**/dist/**', '**/node_modules/**', 'vendor/**', 'docs/**',
      // Engendrés : Next réécrit next-env.d.ts à chaque build, et tokens.css
      // est produit par packages/ui/scripts/build-css.ts.
      '**/next-env.d.ts', 'packages/ui/tokens/**',
      // Runtime engendré par la CLI Supabase à chaque `start` — pas notre code.
      'supabase/.temp/**', 'supabase/.branches/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Le préfixe « _ » dit « je sais que ça ne sert pas » — notamment pour
      // extraire une clé d'un objet par déstructuration du reste.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // Node exécute notre TypeScript en RETIRANT les types, sans compiler.
      // Les syntaxes qui exigent une transformation cassent au démarrage et
      // non à la compilation — donc après le typecheck, donc en production.
      'no-restricted-syntax': ['error',
        { selector: 'TSParameterProperty', message: 'Propriété de constructeur non supportée par le mode strip-only de Node : déclarez le champ puis affectez-le.' },
        { selector: 'TSEnumDeclaration', message: 'enum non supporté par le mode strip-only de Node : employez une union de littéraux ou un objet `as const`.' },
        { selector: 'TSModuleDeclaration', message: 'namespace non supporté par le mode strip-only de Node.' },
      ],
      // Un secret ne se lit jamais depuis process.env ailleurs que dans packages/env.
      'no-restricted-properties': ['error', {
        object: 'process',
        property: 'env',
        message: "Passe par @job-seeker/env — process.env n'est lu qu'à un seul endroit.",
      }],
    },
  },
  { files: ['packages/env/**'], rules: { 'no-restricted-properties': 'off' } },
)
