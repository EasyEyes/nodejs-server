# Security update: 2026-10-23

Node.js 22.23.4 is selected in `.nvmrc` and `engines.node`. This includes the October 21 security patches. Application source behavior is unchanged except for required build integration configuration.

Source: [Node.js October security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).

## Verification and limitations

Clean installation and production netlify-lambda build pass.

Native npm audit: 0 critical, 12 high, 4 moderate, 5 low findings. Counts represent affected dependency packages, not unique CVEs.

Remaining findings are deferred to a separate compatibility/reachability review by 2026-10-30. High findings are not claimed fixed or harmless. Many are inherited from braces/micromatch, test tooling, development servers, or discontinued packages; runtime exposure must be assessed before release.

| Package | Severity | Remediation status | Advisory |
| --- | --- | --- | --- |
| `braces` | high | No native fix available | [Uncontrolled resource consumption in braces](https://github.com/advisories/GHSA-grv7-fg5c-xmjg); [braces vulnerable to stack-exhaustion denial of service through deeply nested patterns](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| `chokidar` | high | No native fix available | Inherited from vulnerable dependency |
| `fast-glob` | high | No native fix available | Inherited from vulnerable dependency |
| `globby` | high | No native fix available | Inherited from vulnerable dependency |
| `micromatch` | high | No native fix available | [Regular Expression Denial of Service (ReDoS) in micromatch](https://github.com/advisories/GHSA-952p-6rrq-rcjv) |
| `netlify-lambda` | high | No native fix available | Inherited from vulnerable dependency |
| `serialize-javascript` | high | No native fix available | [Serialize JavaScript is Vulnerable to RCE via RegExp.flags and Date.prototype.toISOString()](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) |
| `terser-webpack-plugin` | high | No native fix available | Inherited from vulnerable dependency |
| `toml` | high | No native fix available | [toml-node: Uncontrolled Recursion](https://github.com/advisories/GHSA-82x6-q7mm-w9cf); [toml-node: Prototype Pollution Leads to `Object.prototype` Corruption via `__proto__` Key-Path Desynchronization](https://github.com/advisories/GHSA-v5mp-jgw5-2x6j); [toml-node: Quadratic-complexity DoS via many array-of-tables headers in toml.parse()](https://github.com/advisories/GHSA-4qx8-w7c3-pj3p); [toml-node: Quadratic-complexity DoS via long dotted keys or table paths in toml.parse()](https://github.com/advisories/GHSA-9j65-hcg3-gc64); [toml-node: Uncontrolled resource consumption (CPU DoS) via unbounded-length integer literals in toml.parse()](https://github.com/advisories/GHSA-9qmh-m7c6-f92p) |
| `watchpack` | high | No native fix available | Inherited from vulnerable dependency |
| `watchpack-chokidar2` | high | No native fix available | Inherited from vulnerable dependency |
| `webpack` | high | No native fix available | Inherited from vulnerable dependency |

## Verification scenario

Use the pinned Node version. Install from the authoritative lockfile with dependency scripts disabled first, review native/postinstall scripts, and run only those required by the package. Run the documented test/build commands. Repeat the native audit before release. In a preview, exercise the package's normal entry point and check browser/server errors. A successful build does not prove production integration.
