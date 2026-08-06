/** @type {import('lint-staged').Config} */
export default {
  'src/**/*.{js,jsx,ts,tsx}': (files) => {
    // --no-warn-ignored: eslint ignores test files and the generated
    // graphql.ts, and the "File ignored" notice would otherwise count as a
    // warning under --max-warnings=0.
    const nonTest = files.filter((f) => !f.includes('.test.'));
    return [
      ...(nonTest.length > 0
        ? [
            `npx eslint --fix --max-warnings=0 --no-warn-ignored ${nonTest.join(' ')}`,
          ]
        : []),
      `prettier --write ${files.join(' ')}`,
    ];
  },

  '**/*.{json,css,scss,md,mdx}': ['prettier --write'],
};
