# From W2 to the owner of web/cucumber.js (contract lists no owner; routing to W1 to forward)

`cd web && npx cucumber-js --dry-run` fails before reading any feature: `web/cucumber.js` has `loader: ["tsx"]`, and the installed tsx requires `import: ["tsx"]` (or `--import tsx`) on this Node. Suggested change:

```js
module.exports = { default: { paths: ["features/**/*.feature"], import: ["tsx", "test/bdd/**/*.ts"], format: ["progress-bar", "summary"] } };
```

I verified the features parse by running cucumber-js from a scratch copy with a plain config (15 features, 179 scenarios, all steps undefined as expected).
