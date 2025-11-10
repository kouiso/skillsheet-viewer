const path = require('path');
const micromatch = require('micromatch');

const buildEslintCommand = (filenames) => `eslint ${filenames.map((f) => path.relative(process.cwd(), f)).join(' ')}`;

module.exports = {
  '*': (allFiles) => {
    console.log('Checking files...', allFiles);
    const eslintFiles = micromatch(allFiles, ['**/*.ts', '**/*.tsx']);
    const prettierFiles = micromatch(allFiles, ['**/*.(js|json|ts|tsx)']);

    const commands = [];

    // Add TypeScript compilation check
    commands.push('tsc --noEmit');

    // Add ESLint command if there are ESLint files
    if (eslintFiles.length) {
      commands.push(buildEslintCommand(eslintFiles));
    }

    // Add Prettier command if there are Prettier files
    if (prettierFiles.length) {
      commands.push(`prettier --write ${prettierFiles.join(' ')}`);
    }

    return commands;
  },
};
