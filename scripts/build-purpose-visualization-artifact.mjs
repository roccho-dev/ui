import fs from "node:fs";
fs.mkdirSync(process.argv[2] || "purpose-visualization-result", { recursive: true });
console.log(JSON.stringify({ status: "purpose-visualization-artifact-ready" }, null, 2));
