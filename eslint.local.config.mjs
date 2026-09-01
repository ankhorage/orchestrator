import { createConfig } from '@ankhorage/devtools/eslint';

function legacyRuleExceptions(rule, files) {
  return { files, rules: { [rule]: 'off' } };
}

export default [
  ...createConfig({
    additionalIgnores: ['dist/**', 'coverage/**'],
    allowDefaultProject: ['eslint.config.mjs', 'eslint.local.config.mjs'],
    files: ['src/**/*.ts', 'test/**/*.ts'],
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: import.meta.dirname,
  }),
  legacyRuleExceptions('max-lines', ['test/orchestrator.test.ts']),
  legacyRuleExceptions('max-lines-per-function', [
    'src/orchestrator/actionExecutor.ts',
    'src/orchestrator/uninstall.ts',
    'test/orchestrator.test.ts',
    'test/reconfigureRollback.test.ts',
  ]),
  legacyRuleExceptions('security/detect-object-injection', ['src/actions/jsonPath.ts']),
];
