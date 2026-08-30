import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const tests=["domain_test.mjs", "pattern_test.mjs", "view_type_registry_test.mjs", "chart_test.mjs", "protocol_test.mjs", "view_contract_test.mjs", "runtime_test.mjs", "projection_test.mjs", "module_embedding_test.mjs", "artifact_module_bridge_test.mjs", "resource_composition_test.mjs", "url_delivery_test.mjs", "publisher_port_test.mjs", "source_export_test.mjs", "map_semantics_test.mjs", "meaning_recovery_test.mjs", "geo_domain_contract_test.mjs", "geo_spec_url_test.mjs", "theme_contract_test.mjs", "url_contract_test.mjs", "url_performance_test.mjs", "policy_semantics_test.mjs", "example_fixture_test.mjs"];
const results=[];
for(const test of tests){
 const run=spawnSync(process.execPath,[path.join(here,test)],{encoding:"utf8"});
 if(run.status!==0){process.stderr.write(run.stdout??"");process.stderr.write(run.stderr??"");throw new Error(`legacy semantic-map gate failed: ${test}`);}
 const stdout=(run.stdout??"").trim();
 let receipt=null;
 try{receipt=JSON.parse(stdout);}catch{}
 if(!receipt){const lines=stdout.split(/\r?\n/u).filter(Boolean);for(let i=lines.length-1;i>=0;i--){try{receipt=JSON.parse(lines[i]);break;}catch{}}}
 if(!receipt||receipt.status!=="PASS") throw new Error(`legacy semantic-map gate did not emit PASS: ${test}`);
 results.push({test,schema:receipt.schema});
}
console.log(JSON.stringify({schema:"semantic-map-migrated-source-tests/1",status:"PASS",tests:results.length,results}));
