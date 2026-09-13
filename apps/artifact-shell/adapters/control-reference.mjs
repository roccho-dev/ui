const sourceCommit = "179f2e37f6a42ff55b2ec4fa0e95fd73649c8afc";

export const createAdapter = () => Object.freeze({
  id: "control-reference",
  kind: "reference",
  label: "control·ref",
  source: Object.freeze({
    commit: sourceCommit,
    html: `https://raw.githubusercontent.com/roccho-dev/ui/${sourceCommit}/packages/policy-ui/assets/control.html`,
    module: `https://raw.githubusercontent.com/roccho-dev/ui/${sourceCommit}/packages/policy-ui/assets/control.mjs`,
  }),
  view: "control",
});
