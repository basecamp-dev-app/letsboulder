/**
 * ESLint plugin that bundles custom rules for the letsboulder.com codebase.
 */

import consistentFeatureStructure from './consistent-feature-structure.js'

export default {
  rules: {
    'consistent-feature-structure': consistentFeatureStructure,
  },
}
