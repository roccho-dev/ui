const sourceCommit = "179f2e37f6a42ff55b2ec4fa0e95fd73649c8afc";

export const createAdapter = () => Object.freeze({
  id: "graph-reference",
  kind: "reference",
  label: "graph·ref",
  source: Object.freeze({
    commit: sourceCommit,
    css: `https://raw.githubusercontent.com/roccho-dev/ui/${sourceCommit}/packages/policy-ui/assets/graph.css`,
    html: `https://raw.githubusercontent.com/roccho-dev/ui/${sourceCommit}/packages/policy-ui/assets/graph.html`,
    module: `https://raw.githubusercontent.com/roccho-dev/ui/${sourceCommit}/packages/policy-ui/assets/graph.mjs`,
  }),
  view: "graph",
});
