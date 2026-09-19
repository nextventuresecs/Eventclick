@CLAUDE.md

## Dev environment tips

- Use `npm dlx turbo run where <project_name>` to jump to a package instead of scanning with `ls`.
- Run `npm install --filter <project_name>` to add the package to your workspace so Vite, ESLint, and TypeScript can see it.
- Use `npm create vite@latest <project_name> -- --template react-ts` to spin up a new React + Vite package with TypeScript checks ready.
- Check the name field inside each package's package.json to confirm the right name—skip the top-level one.

## Testing instructions

- Find the CI plan in the .github/workflows folder.
- Run `npm turbo run test --filter <project_name>` to run every check defined for that package.
- From the package root you can just call `npm test`. The commit should pass all tests before you merge.
- To focus on one step, add the Vitest pattern: `npm vitest run -t "<test name>"`.
- Fix any test or type errors until the whole suite is green.
- After moving files or changing imports, run `npm lint --filter <project_name>` to be sure ESLint and TypeScript rules still pass.
- Add or update tests for the code you change, even if nobody asked.

## PR instructions

- Title format: [<project_name>] <Title>
- Always run `npm lint` and `npm test` before committing.
