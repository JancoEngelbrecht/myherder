/**
 * Backward-compat shim — Phase 4 renamed cows → animals.
 * Phase 5 will update all view/component imports to use animals.js directly.
 * This file will be deleted after Phase 5 is complete.
 */
export {
  useAnimalsStore as useCowsStore,
  computeLifePhase,
  computeIsReadyToBreed,
} from './animals.js'
