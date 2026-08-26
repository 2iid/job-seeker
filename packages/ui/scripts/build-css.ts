/**
 * Engendre tokens.css depuis tokens.ts. Le CSS n'est jamais édité à la main :
 * deux sources de vérité pour une même couleur, c'est une divergence qui attend.
 * Le test de parité échoue si le fichier engendré ne correspond plus.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { DURATION, RADIUS, SPACE, TOKENS, TOUCH } from '../src/tokens.ts'

export function renderCss(): string {
  const block = (theme: 'dark' | 'light', indent: string): string =>
    Object.entries(TOKENS)
      .map(([name, role]) => `${indent}--${name}: ${role[theme]};`)
      .join('\n')

  return `/* ENGENDRÉ par packages/ui/scripts/build-css.ts — ne pas éditer à la main.
   Source : packages/ui/src/tokens.ts · système : docs/design/design-system.md */

:root {
${block('light', '  ')}

${SPACE.map((v, i) => `  --space-${i + 1}: ${v}px;`).join('\n')}
${Object.entries(RADIUS).map(([k, v]) => `  --radius-${k}: ${v}px;`).join('\n')}
${Object.entries(DURATION).map(([k, v]) => `  --duration-${k}: ${v}ms;`).join('\n')}
  --touch-min: ${TOUCH.min}px;
  --touch-gap: ${TOUCH.gap}px;
  --touch-row: ${TOUCH.row}px;
}

/* Le sombre est le mode d'origine : l'agent travaille la nuit, l'interface aussi. */
@media (prefers-color-scheme: dark) {
  :root {
${block('dark', '    ')}
  }
}

/* Le choix explicite prime sur la préférence système, dans les deux sens. */
:root[data-theme='dark'] {
${block('dark', '  ')}
}

:root[data-theme='light'] {
${block('light', '  ')}
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-toggle: 0ms;
    --duration-state: 0ms;
    --duration-panel: 0ms;
  }
}
`
}

// N'écrit QUE si ce fichier est lancé directement. Sans ce garde-fou, le simple
// fait d'importer `renderCss` depuis un test réécrivait tokens.css — un test
// qui modifie un fichier suivi périme le reçu de vérification à chaque
// exécution, et la porte se met à bloquer sans raison visible.
const lanceDirectement =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (lanceDirectement) {
  const here = dirname(fileURLToPath(import.meta.url))
  writeFileSync(join(here, '..', 'tokens', 'tokens.css'), renderCss())
  process.stdout.write('tokens.css engendré\n')
}
