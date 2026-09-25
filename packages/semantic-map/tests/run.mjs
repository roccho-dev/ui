import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const tests=["../../data-pin/tests/run.mjs", "domain_test.mjs", "reconnect_relation_test.mjs", "pattern_test.mjs", "view_type_registry_test.mjs", "chart_test.mjs", "protocol_test.mjs", "view_contract_test.mjs", "runtime_test.mjs", "projection_test.mjs", "module_embedding_test.mjs", "artifact_module_bridge_test.mjs", "resource_composition_test.mjs", "map_semantics_test.mjs", "graph_semantics_test.mjs", "layout_hint_test.mjs", "layout_bounds_test.mjs", "data_pin_test.mjs", "meaning_recovery_test.mjs", "review_model_test.mjs", "geo_domain_contract_test.mjs", "geo_spec_url_test.mjs", "theme_contract_test.mjs", "policy_semantics_test.mjs", "example_fixture_test.mjs", "renderer_architecture_test.mjs", "authoring_boundary_test.mjs", "graph_editor_retirement_test.mjs", "runtime_data_contract_test.mjs", "transport_retirement_test.mjs"];
const results=[];
for(const test of tests){
 const run=spawnSync(process.execPath,[path.join(here,test)],{encoding:"utf8"});
 if(run.status!==0){process.stderr.write(run.stdout??"");process.stderr.write(run.stderr??"");throw new Error(`semantic-map gate failed: ${test}`);}
 const stdout=(run.stdout??"").trim();
 let receipt=null;
 try{receipt=JSON.parse(stdout);}catch{}
 if(!receipt){const lines=stdout.split(/\r?\n/u).filter(Boolean);for(let i=lines.length-1;i>=0;i--){try{receipt=JSON.parse(lines[i]);break;}catch{}}}
 if(!receipt||receipt.status!=="PASS") throw new Error(`semantic-map gate did not emit PASS: ${test}`);
 results.push({test,schema:receipt.schema});
}
console.log(JSON.stringify({schema:"semantic-map-source-tests/1",status:"PASS",tests:results.length,results}));
