// Dev helper config: run selected features only.
//   NODE_OPTIONS="--import tsx" npx cucumber-js -c test/bdd/one.cjs features/health.feature
module.exports = { default: { import: ["test/bdd/**/*.ts"], format: ["progress"] } };
