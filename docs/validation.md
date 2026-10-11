# Alpha.3 validation

Validation was performed on Windows x64 with Node.js 24.18.0 and npm 12.0.2. Source and input hashes in the individual reports identify the tested working-tree inputs. The alpha.2 report is preserved separately in [historical validation](validation/alpha2.md); its results do not establish alpha.3 behavior.

## Engineering and boundary checks

The automated suite exercises stable record IDs, SQLite/FTS5 rebuilds, typed links, batch requirement coverage, dependencies, bounded context, interrupted work, evidence applicability, independent review, and documentation gates. Alpha.3 adds:

- Native model acknowledgment, completed inference, signed receipt integrity, reroute rejection, interruption/resumption, bounded waiting, ownership, unavailable-model fallback, and permission blockers.
- Strict source authorship and planning review before worker dispatch, current receipt requirements, repeated-repair Sol reassessment, migration of pending work, and preservation of historical acceptance.
- Invocation-bound role and task scope, approved pinned providers, isolated installs, transitive lock integrity, missing capabilities, and explicit optional substitutions.
- Exact project snapshot bytes, historical verification inputs, binary/deleted files, immutable references, publication recovery, concurrent baseline movement, sensitive-content blockers, and restoration.
- Cornell structure, sources, freshness, runnable practice, preservation of authored solutions, protected recipe inputs, independent expected values, reviewed replacements, workflow binding, and loaded-generator identity.
- Installer preservation of existing configuration, authored overrides, conflicts, managed resource updates, and checks that remain effective without hooks.

Protocol simulations and locally fabricated validation objects used by boundary tests establish rejection and gate mechanics. They do not authenticate an account or perform model inference. Production-injected transports remain labelled `protocol-fixture` and cannot authorize strict acceptance.

The broad local run passed **181 tests**, without failures or skips, in 396.94 seconds. Subsequent audit corrections receive focused regression checks and are included in the final CI source revision. The local result log is `artifacts/alpha3-tests-final.txt`.

## Authenticated native execution

[Native model observations](validation/native-alpha3-report.json) record actual completed requirements and review invocations using `gpt-6.1-sol`, and a bounded developer invocation using `gpt-6-luna`, through the pinned Codex 0.162.1 App Server. Native model/provider acknowledgments, thread/turn identities, completion, and limitations are recorded. There were no fallback or reroute observations in that access demonstration.

The [managed increment report](validation/native-alpha3-managed-report.json) separately records the longer engineering demonstration, including its actual completion state, interruptions, failed gates, and specialist results. Read `increment_acceptance_demonstrated` before treating this run as accepted. Account access alone is insufficient to claim a completed increment, automatic archive publication, or measured routing efficiency.

The native acknowledgment reports the client's selected model; it is not independent backend attestation. Local receipt signatures detect accidental or unauthorized changes within the documented local boundary. They do not defend against a process with unrestricted access to the project and private signing cache. Native permission refusals remain blockers; the bridge never grants a pending approval on the user's behalf.

## Providers and engineering pilots

[Provider observations](validation/tools-alpha3-report.json) record pinned package integrity, actual discovery, availability, and invocation results. CodeGraph Windows C/C++ analysis and freshness were exercised. Context7 performed an actual library lookup without an API key; returned source suitability still needs review. Playwright tool discovery was observed; browser execution is unverified. Exact URL checks cover explicit navigation only; actions and redirects inherit the provider/client network permissions.

[Current pilot evidence](validation/pilots-alpha3-report.json) records twelve passing JavaScript checks, ngspice 46 DC simulation, RISC-V GCC 14.2.0 compilation, and **8,215** executed firmware/reference comparisons using Digital Mars. Source hashes identify the inputs. The embedded demonstration uses ideal circuit simulation and host execution; it does not establish MCU execution, physical board performance, HIL, thermal/EMC behavior, timing, or power-loss durability.

## Packaged installation and consumer upgrade

The local deliverable is `artifacts/verythinker-0.1.0-alpha.3.tgz`. Installed-package smoke verifies resource resolution, all three generated adapters, twelve roles, three recipes, MCP discovery/invocation, strict missing-receipt rejection, and preservation of user edits. A separate explicitly labelled legacy-policy fixture exercises the complete record lifecycle and new-process resumption. The legacy fixture does not establish native model execution.

The smoke report records the exact final tarball hash. Consumer migration preserves authored model/configuration changes as reviewable conflicts and keeps accepted legacy evidence attached to its original baseline. Existing running MCP processes retain the previously loaded package until their owning client reloads them.

[Windows and Ubuntu CI](https://github.com/VuThach3001/VeryThinker/actions/runs/38141739950) passed dependency installation, the full 185-test suite, package inspection/build, and installed-package smoke at source commit `646a4949aded1b1c950418187c30c1690ca58613`. Windows passed 184 tests with one optional host-C check skipped; Ubuntu passed 181 with the Windows file-lock and three Windows CodeGraph checks skipped. There were no failures. [Structured CI observations](validation/ci-alpha3-report.json) preserve those limits. An earlier Windows failure exposed the returned-versus-persisted body mismatch; storage now returns canonical persisted bodies, with a regression test covering CRLF and missing terminal newlines. Local packaging is not npm registry publication.

## Remaining compatibility and evaluation boundaries

Strict execution targets the demonstrated Codex App Server surface first. Claude Code and Copilot resources are generated, but exact Sol/Luna/Terra execution remains restricted until independently verified on those clients. Generated skill/hook files do not establish native picker discovery or hook trust. Core acceptance checks remain mandatory when hooks are disabled.

The eighteen comparative agent trials remain incomplete. Alpha.3 implements the user-selected routing policy; it does not claim demonstrated cost/time savings or a general quality advantage over one strong agent. The V-model and Automotive SPICE mapping are workflow guidance, not a capability rating or formal assessment.

Shared knowledge produces reviewed draft PRs with human merge approval. Private project archives preserve project records and reproducible inputs separately. No automatic merge, public project disclosure, or registry publication is claimed.
