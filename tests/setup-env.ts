/**
 * Charge `.env` avant les tests.
 *
 * L'application le fait déjà — `apps/web/next.config.ts` appelle dotenv sur le
 * fichier de la RACINE, parce qu'un monorepo n'a qu'un seul environnement. Les
 * tests, eux, ne le faisaient pas : ils tournaient donc dans un environnement
 * différent de celui du produit, et un module qui lit un secret y échouait avec
 * un message qui n'avait rien à voir avec ce qu'on testait.
 *
 * `quiet` et l'absence d'`override` : un `.env` ne doit jamais écraser une
 * variable posée par la CI ou par la ligne de commande.
 */
import { join } from 'node:path'
import { config } from 'dotenv'

config({ path: join(import.meta.dirname, '..', '.env'), quiet: true })
