/**
 * ESLint plugin that bundles custom rules for the letsboulder.com codebase.
 */

import consistentFeatureStructure from './consistent-feature-structure.js'
import noCrossRouteAppImports from './no-cross-route-app-imports.js'
import noServiceRoleImport from './no-service-role-import.js'

const localRulesPlugin = {
  rules: {
    'consistent-feature-structure': consistentFeatureStructure,
    'no-cross-route-app-imports': noCrossRouteAppImports,
    'no-service-role-import': noServiceRoleImport,
  },
}

export default localRulesPlugin
