import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig({
  ignoreDependencies: ['@ankhorage/doctor'],
  ignoreFiles: [
    '.prettierrc.js',
    'eslint.config.mjs',
    'eslint.local.config.mjs',
    'prettier.local.config.js',
  ],
});
