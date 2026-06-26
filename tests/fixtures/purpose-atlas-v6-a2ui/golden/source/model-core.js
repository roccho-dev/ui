"use strict";
var BASE_NODES = [
  {
    id: "ceo_exit_thesis",
    layer: "ceo",
    label: "売却仮説",
    entityId: "exit_thesis",
    kind: "purpose",
    x: 128,
    y: 216,
    size: 1.15,
    purposeLabel: "法人売却",
    action: "investigate",
    status: "active",
  },
  {
    id: "ceo_buyer_hypothesis",
    layer: "ceo",
    label: "買い手仮説",
    entityId: "buyer_hypothesis",
    kind: "investigation",
    x: 310,
    y: 112,
    size: 0.95,
    purposeLabel: "法人売却",
    action: "investigate",
    status: "active",
  },
  {
    id: "ceo_valuation_story",
    layer: "ceo",
    label: "価値説明",
    entityId: "valuation_story",
    kind: "purpose",
    x: 516,
    y: 150,
    size: 1.08,
    purposeLabel: "高価値法人",
    action: "target",
    status: "planned",
  },
  {
    id: "ceo_company_sale",
    layer: "ceo",
    label: "法人売却",
    entityId: "company_sale",
    kind: "milestone",
    x: 650,
    y: 292,
    size: 1.22,
    purposeLabel: "Exit",
    action: "target",
    status: "planned",
  },
  {
    id: "cpo_pkg_atlas",
    layer: "cpo",
    label: "pkg:atlas",
    entityId: "pkg_atlas",
    kind: "element",
    x: 328,
    y: 194,
    size: 1.16,
    purposeLabel: "高単価商品",
    action: "investigate",
    status: "active",
  },
  {
    id: "cpo_pkg_ui",
    layer: "cpo",
    label: "pkg:ui",
    entityId: "pkg_ui",
    kind: "element",
    x: 174,
    y: 116,
    size: 0.92,
    purposeLabel: "高単価商品",
    action: "investigate",
    status: "active",
  },
  {
    id: "cpo_high_price_product",
    layer: "cpo",
    label: "高単価商品",
    entityId: "high_price_product",
    kind: "purpose",
    x: 584,
    y: 156,
    size: 1.1,
    purposeLabel: "高単価商品",
    action: "target",
    status: "planned",
  },
  {
    id: "cpo_customer_proof",
    layer: "cpo",
    label: "導入事例",
    entityId: "customer_proof",
    kind: "evidence",
    x: 594,
    y: 316,
    size: 0.95,
    purposeLabel: "価値説明",
    action: "collect",
    status: "planned",
  },
  {
    id: "cto_pkg_core",
    layer: "cto",
    label: "pkg:core",
    entityId: "pkg_core",
    kind: "element",
    x: 146,
    y: 286,
    size: 1.05,
    purposeLabel: "Tech DD",
    action: "investigate",
    status: "active",
  },
  {
    id: "cto_pkg_api",
    layer: "cto",
    label: "pkg:api",
    entityId: "pkg_api",
    kind: "element",
    x: 540,
    y: 118,
    size: 0.96,
    purposeLabel: "Tech DD",
    action: "investigate",
    status: "planned",
  },
  {
    id: "cto_audit_log",
    layer: "cto",
    label: "監査ログ",
    entityId: "audit_log",
    kind: "element",
    x: 626,
    y: 304,
    size: 0.92,
    purposeLabel: "Tech DD",
    action: "build",
    status: "planned",
  },
  {
    id: "cto_tech_dd",
    layer: "cto",
    label: "Tech DD",
    entityId: "tech_dd",
    kind: "milestone",
    x: 338,
    y: 124,
    size: 1.08,
    purposeLabel: "高価値法人",
    action: "target",
    status: "planned",
  },
  {
    id: "coo_pkg_ops",
    layer: "coo",
    label: "pkg:ops",
    entityId: "pkg_ops",
    kind: "element",
    x: 566,
    y: 288,
    size: 1.0,
    purposeLabel: "内部低コスト",
    action: "operate",
    status: "active",
  },
  {
    id: "coo_sop",
    layer: "coo",
    label: "SOP化",
    entityId: "sop",
    kind: "element",
    x: 284,
    y: 310,
    size: 0.96,
    purposeLabel: "運用移管",
    action: "investigate",
    status: "active",
  },
  {
    id: "coo_internal_low_cost",
    layer: "coo",
    label: "内部低コスト",
    entityId: "internal_low_cost",
    kind: "purpose",
    x: 462,
    y: 118,
    size: 1.02,
    purposeLabel: "高利益率",
    action: "target",
    status: "planned",
  },
  {
    id: "coo_handover",
    layer: "coo",
    label: "運用移管",
    entityId: "handover_ops",
    kind: "milestone",
    x: 168,
    y: 154,
    size: 0.9,
    purposeLabel: "買収後PMI",
    action: "target",
    status: "planned",
  },
  {
    id: "cfo_margin_model",
    layer: "cfo",
    label: "粗利モデル",
    entityId: "margin_model",
    kind: "element",
    x: 286,
    y: 118,
    size: 1.03,
    purposeLabel: "高利益率",
    action: "investigate",
    status: "active",
  },
  {
    id: "cfo_monthly_close",
    layer: "cfo",
    label: "月次締め",
    entityId: "monthly_close",
    kind: "element",
    x: 188,
    y: 302,
    size: 0.9,
    purposeLabel: "Financial DD",
    action: "investigate",
    status: "planned",
  },
  {
    id: "cfo_valuation_model",
    layer: "cfo",
    label: "評価モデル",
    entityId: "valuation_model",
    kind: "purpose",
    x: 560,
    y: 174,
    size: 1.08,
    purposeLabel: "高価値法人",
    action: "target",
    status: "planned",
  },
  {
    id: "cfo_finance_dd",
    layer: "cfo",
    label: "Finance DD",
    entityId: "finance_dd",
    kind: "milestone",
    x: 586,
    y: 320,
    size: 0.95,
    purposeLabel: "DD準備",
    action: "target",
    status: "planned",
  },
  {
    id: "review_pkg_core",
    layer: "review_agent",
    label: "core review",
    entityId: "pkg_core",
    kind: "review",
    x: 210,
    y: 252,
    size: 0.96,
    purposeLabel: "品質保証",
    action: "review",
    status: "planned",
  },
  {
    id: "review_quality_gate",
    layer: "review_agent",
    label: "品質ゲート",
    entityId: "quality_gate",
    kind: "review",
    x: 482,
    y: 132,
    size: 1.02,
    purposeLabel: "Tech DD",
    action: "review",
    status: "planned",
  },
  {
    id: "review_risk_register",
    layer: "review_agent",
    label: "リスク台帳",
    entityId: "risk_register",
    kind: "evidence",
    x: 534,
    y: 302,
    size: 0.93,
    purposeLabel: "DD準備",
    action: "collect",
    status: "planned",
  },
  {
    id: "ops_agent_automation",
    layer: "ops_agent",
    label: "運用自動化",
    entityId: "ops_automation",
    kind: "element",
    x: 506,
    y: 288,
    size: 1.0,
    purposeLabel: "内部低コスト",
    action: "operate",
    status: "planned",
  },
  {
    id: "ops_agent_monitoring",
    layer: "ops_agent",
    label: "監視",
    entityId: "monitoring",
    kind: "element",
    x: 230,
    y: 132,
    size: 0.92,
    purposeLabel: "安定運用",
    action: "observe",
    status: "active",
  },
  {
    id: "ops_agent_cost_bot",
    layer: "ops_agent",
    label: "cost bot",
    entityId: "cost_bot",
    kind: "element",
    x: 618,
    y: 152,
    size: 0.93,
    purposeLabel: "高利益率",
    action: "build",
    status: "planned",
  },
];
var BASE_EDGES = [
  {
    id: "e_ceo_1",
    source: "ceo_exit_thesis",
    target: "ceo_company_sale",
    kind: "defines",
    weight: 1.0,
    directed: true,
  },
  {
    id: "e_ceo_2",
    source: "ceo_buyer_hypothesis",
    target: "ceo_valuation_story",
    kind: "informs",
    weight: 0.82,
    directed: true,
  },
  {
    id: "e_ceo_3",
    source: "ceo_valuation_story",
    target: "ceo_company_sale",
    kind: "contributes_to",
    weight: 1.0,
    directed: true,
  },
  {
    id: "e_cpo_1",
    source: "cpo_pkg_atlas",
    target: "cpo_high_price_product",
    kind: "evidence_for",
    weight: 0.92,
    directed: true,
  },
  {
    id: "e_cpo_2",
    source: "cpo_pkg_ui",
    target: "cpo_high_price_product",
    kind: "evidence_for",
    weight: 0.78,
    directed: true,
  },
  {
    id: "e_cpo_3",
    source: "cpo_high_price_product",
    target: "cpo_customer_proof",
    kind: "contributes_to",
    weight: 0.78,
    directed: true,
  },
  {
    id: "e_cpo_ceo",
    source: "cpo_customer_proof",
    target: "ceo_valuation_story",
    kind: "contributes_to",
    weight: 0.86,
    directed: true,
  },
  {
    id: "e_cto_1",
    source: "cto_pkg_core",
    target: "cto_audit_log",
    kind: "evidence_for",
    weight: 0.9,
    directed: true,
  },
  {
    id: "e_cto_2",
    source: "cto_pkg_api",
    target: "cto_audit_log",
    kind: "evidence_for",
    weight: 0.74,
    directed: true,
  },
  {
    id: "e_cto_3",
    source: "cto_audit_log",
    target: "cto_tech_dd",
    kind: "contributes_to",
    weight: 0.86,
    directed: true,
  },
  {
    id: "e_cto_ceo",
    source: "cto_tech_dd",
    target: "ceo_valuation_story",
    kind: "contributes_to",
    weight: 0.9,
    directed: true,
  },
  {
    id: "e_coo_1",
    source: "coo_pkg_ops",
    target: "coo_sop",
    kind: "evidence_for",
    weight: 0.84,
    directed: true,
  },
  {
    id: "e_coo_2",
    source: "coo_sop",
    target: "coo_internal_low_cost",
    kind: "contributes_to",
    weight: 0.78,
    directed: true,
  },
  {
    id: "e_coo_3",
    source: "coo_sop",
    target: "coo_handover",
    kind: "evidence_for",
    weight: 0.72,
    directed: true,
  },
  {
    id: "e_coo_cfo",
    source: "coo_internal_low_cost",
    target: "cfo_margin_model",
    kind: "contributes_to",
    weight: 0.82,
    directed: true,
  },
  {
    id: "e_cfo_1",
    source: "cfo_margin_model",
    target: "cfo_valuation_model",
    kind: "contributes_to",
    weight: 0.86,
    directed: true,
  },
  {
    id: "e_cfo_2",
    source: "cfo_monthly_close",
    target: "cfo_finance_dd",
    kind: "evidence_for",
    weight: 0.78,
    directed: true,
  },
  {
    id: "e_cfo_3",
    source: "cfo_valuation_model",
    target: "cfo_finance_dd",
    kind: "evidence_for",
    weight: 0.76,
    directed: true,
  },
  {
    id: "e_cfo_ceo",
    source: "cfo_finance_dd",
    target: "ceo_valuation_story",
    kind: "contributes_to",
    weight: 0.82,
    directed: true,
  },
  {
    id: "e_review_1",
    source: "cto_pkg_core",
    target: "review_pkg_core",
    kind: "reviewed_by",
    weight: 0.72,
    directed: false,
  },
  {
    id: "e_review_2",
    source: "review_pkg_core",
    target: "review_quality_gate",
    kind: "evidence_for",
    weight: 0.82,
    directed: true,
  },
  {
    id: "e_review_3",
    source: "review_quality_gate",
    target: "review_risk_register",
    kind: "evidence_for",
    weight: 0.76,
    directed: true,
  },
  {
    id: "e_review_cto",
    source: "review_risk_register",
    target: "cto_tech_dd",
    kind: "contributes_to",
    weight: 0.72,
    directed: true,
  },
  {
    id: "e_ops_1",
    source: "ops_agent_monitoring",
    target: "ops_agent_automation",
    kind: "evidence_for",
    weight: 0.72,
    directed: true,
  },
  {
    id: "e_ops_2",
    source: "ops_agent_automation",
    target: "ops_agent_cost_bot",
    kind: "contributes_to",
    weight: 0.82,
    directed: true,
  },
  {
    id: "e_ops_coo",
    source: "ops_agent_cost_bot",
    target: "coo_internal_low_cost",
    kind: "contributes_to",
    weight: 0.8,
    directed: true,
  },
  {
    id: "e_cross_margin",
    source: "cpo_high_price_product",
    target: "cfo_margin_model",
    kind: "contributes_to",
    weight: 0.68,
    directed: true,
  },
];
var EVENTS = [
  {
    t: 1,
    type: "contract.upsert",
    node: "ceo_company_sale",
    context: "company_exit",
    requires: [
      "ceo_valuation_story",
      "cpo_customer_proof",
      "cto_tech_dd",
      "cfo_finance_dd",
      "coo_internal_low_cost",
    ],
    rejects: ["space_mission"],
    role: "terminal_purpose",
    label: "法人売却 contract を確定",
  },
  {
    t: 2,
    type: "purpose.set",
    terminal: "ceo_company_sale",
    context: "company_exit",
    label: "本線: 法人売却",
  },
  {
    t: 3,
    type: "contract.upsert",
    node: "ceo_valuation_story",
    role: "intermediate_purpose",
    validUnder: ["company_exit"],
    domains: ["corporate", "valuation", "exit"],
    tags: ["exit_valuation_only"],
    label: "価値説明を売却文脈に束縛",
  },
  {
    t: 4,
    type: "cxo.activity",
    node: "cfo_margin_model",
    label: "CFO activity: 粗利前提確認",
    member: "cfo",
    activity: "粗利前提と売却倍率の対応を確認中",
  },
  {
    t: 5,
    type: "node.upsert",
    id: "ceo_orbit_mission",
    validUnder: ["space_mission"],
    domains: ["space", "satellite", "mission"],
    label: "衛星軌道投入",
    labelText: "衛星軌道投入 node を追加",
    kind: "purpose",
    layer: "ceo",
    entityId: "orbit_mission",
    x: 650,
    y: 292,
    size: 1.22,
    purposeLabel: "Mission",
    action: "target",
    status: "planned",
  },
  {
    t: 6,
    type: "contract.upsert",
    node: "ceo_orbit_mission",
    context: "space_mission",
    requires: [
      "cto_launch_readiness",
      "cpo_payload_validated",
      "ops_orbit_telemetry",
    ],
    rejects: ["exit_valuation_only", "short_term_margin_maximization"],
    role: "terminal_purpose",
    label: "衛星軌道投入 contract を追加",
  },
  {
    t: 7,
    type: "purpose.set",
    terminal: "ceo_orbit_mission",
    context: "space_mission",
    label: "本線: 衛星軌道投入",
  },
  {
    t: 8,
    type: "cxo.activity",
    node: "ceo_orbit_mission",
    label: "CEO activity: 目的変更レビュー",
    member: "ceo",
    activity: "旧売却構造を mission success へ再接続できるか確認中",
  },
  {
    t: 9,
    type: "node.upsert",
    id: "coo_vehicle_company",
    validUnder: ["space_mission", "business_vehicle"],
    domains: ["corporate", "vehicle", "space_mission"],
    label: "法人ビークル",
    labelText: "法人を売却対象からビークルへ再定義",
    kind: "vehicle",
    layer: "coo",
    entityId: "vehicle_company",
    x: 462,
    y: 118,
    size: 1.02,
    purposeLabel: "Mission vehicle",
    action: "build",
    status: "active",
  },
  {
    t: 10,
    type: "edge.upsert",
    label: "法人ビークルが衛星目的を enable",
    source: "coo_vehicle_company",
    target: "ceo_orbit_mission",
    kind: "enables",
    weight: 0.92,
    directed: true,
  },
  {
    t: 11,
    type: "node.upsert",
    id: "cfo_margin_model",
    validUnder: ["space_mission", "business_vehicle"],
    domains: ["finance", "vehicle", "space_mission"],
    tags: ["vehicle_health"],
    label: "法人健全性",
    labelText: "粗利モデルをビークル健全性へ再解釈",
    kind: "metric",
    layer: "cfo",
    entityId: "vehicle_health",
    purposeLabel: "Mission vehicle",
    action: "review",
    status: "active",
  },
  {
    t: 12,
    type: "edge.upsert",
    label: "法人健全性をビークル証拠へ接続",
    source: "cfo_margin_model",
    target: "coo_vehicle_company",
    kind: "evidence_for",
    weight: 0.8,
    directed: true,
  },
  {
    t: 13,
    type: "node.obsolete",
    id: "ceo_company_sale",
    label: "旧 terminal 法人売却を archive",
  },
  {
    t: 14,
    type: "node.obsolete",
    id: "ceo_valuation_story",
    label: "旧 valuation story を archive",
  },
  {
    t: 15,
    type: "node.upsert",
    id: "cto_launch_readiness",
    validUnder: ["space_mission"],
    domains: ["space", "launch"],
    label: "打上げ即応性",
    labelText: "打上げ即応性 node を追加",
    kind: "capability",
    layer: "cto",
    entityId: "launch_readiness",
    x: 338,
    y: 124,
    size: 1.08,
    purposeLabel: "Mission",
    action: "build",
    status: "active",
  },
  {
    t: 16,
    type: "edge.upsert",
    label: "打上げ即応性が目的を operationalize",
    source: "cto_launch_readiness",
    target: "ceo_orbit_mission",
    kind: "operationalizes",
    weight: 0.9,
    directed: true,
  },
  {
    t: 17,
    type: "node.upsert",
    id: "cpo_payload_validated",
    validUnder: ["space_mission"],
    domains: ["space", "payload", "evidence"],
    label: "Payload検証",
    labelText: "Payload検証 node を追加",
    kind: "evidence",
    layer: "cpo",
    entityId: "payload_validated",
    x: 594,
    y: 316,
    size: 0.95,
    purposeLabel: "Mission evidence",
    action: "review",
    status: "active",
  },
  {
    t: 18,
    type: "edge.upsert",
    label: "Payload検証を mission evidence へ接続",
    source: "cpo_payload_validated",
    target: "ceo_orbit_mission",
    kind: "evidence_for",
    weight: 0.86,
    directed: true,
  },
  {
    t: 19,
    type: "node.upsert",
    id: "ops_orbit_telemetry",
    validUnder: ["space_mission"],
    domains: ["space", "telemetry", "evidence"],
    label: "軌道Telemetry",
    labelText: "軌道Telemetry node を追加",
    kind: "evidence",
    layer: "ops_agent",
    entityId: "orbit_telemetry",
    x: 510,
    y: 142,
    size: 0.94,
    purposeLabel: "Mission evidence",
    action: "observe",
    status: "active",
  },
  {
    t: 20,
    type: "edge.upsert",
    label: "Telemetry を mission evidence へ接続",
    source: "ops_orbit_telemetry",
    target: "ceo_orbit_mission",
    kind: "evidence_for",
    weight: 0.88,
    directed: true,
  },
  {
    t: 21,
    type: "cxo.activity",
    node: "cto_launch_readiness",
    label: "CTO activity: launch dependency check",
    member: "cto",
    activity: "打上げ即応性と軌道テレメトリの依存を確認中",
  },
  {
    t: 22,
    type: "node.obsolete",
    id: "ceo_orbit_mission",
    label: "衛星目的を将来目的の過去成果として archive",
  },
  {
    t: 23,
    type: "node.obsolete",
    id: "coo_vehicle_company",
    label: "法人ビークルを archive",
  },
  {
    t: 24,
    type: "node.obsolete",
    id: "cfo_margin_model",
    label: "法人健全性を archive",
  },
  {
    t: 25,
    type: "node.obsolete",
    id: "cto_launch_readiness",
    label: "打上げ即応性を archive",
  },
  {
    t: 26,
    type: "node.obsolete",
    id: "cpo_payload_validated",
    label: "Payload検証を archive",
  },
  {
    t: 27,
    type: "node.obsolete",
    id: "ops_orbit_telemetry",
    label: "軌道Telemetryを archive",
  },
  {
    t: 28,
    type: "node.upsert",
    id: "ceo_second_partial_sale",
    validUnder: ["legacy_future"],
    domains: ["future", "exit", "capital"],
    label: "2社目事業売却",
    labelText: "将来目的: 2社目事業売却",
    kind: "purpose",
    layer: "ceo",
    entityId: "second_partial_sale",
    x: 620,
    y: 92,
    size: 1.04,
    purposeLabel: "Future exit",
    action: "target",
    status: "active",
  },
  {
    t: 29,
    type: "node.upsert",
    id: "cfo_asset_income",
    validUnder: ["legacy_future"],
    domains: ["asset", "income", "defense"],
    label: "資産防衛",
    labelText: "将来目的: 資産防衛",
    kind: "purpose",
    layer: "cfo",
    entityId: "asset_income",
    x: 620,
    y: 86,
    size: 1.03,
    purposeLabel: "Asset defense",
    action: "target",
    status: "active",
  },
  {
    t: 30,
    type: "node.upsert",
    id: "ceo_health_time",
    validUnder: ["legacy_future"],
    domains: ["health", "time"],
    label: "健康と時間",
    labelText: "将来目的: 健康と時間",
    kind: "purpose",
    layer: "ceo",
    entityId: "health_time",
    x: 500,
    y: 62,
    size: 1.0,
    purposeLabel: "Health/time",
    action: "target",
    status: "active",
  },
  {
    t: 31,
    type: "node.upsert",
    id: "cpo_legacy_giveback",
    validUnder: ["legacy_future"],
    domains: ["legacy", "giveback"],
    label: "継承と還元",
    labelText: "将来目的: 継承と還元",
    kind: "purpose",
    layer: "cpo",
    entityId: "legacy_giveback",
    x: 654,
    y: 72,
    size: 1.0,
    purposeLabel: "Legacy",
    action: "target",
    status: "active",
  },
  {
    t: 32,
    type: "node.upsert",
    id: "ceo_happy_retirement",
    validUnder: ["legacy_future"],
    domains: ["wellbeing", "retirement", "legacy_future"],
    label: "幸せな老後",
    labelText: "最上位目的: 幸せな老後",
    kind: "purpose",
    layer: "ceo",
    entityId: "happy_retirement",
    x: 392,
    y: 54,
    size: 1.16,
    purposeLabel: "Ultimate",
    action: "target",
    status: "planned",
  },
  {
    t: 33,
    type: "edge.upsert",
    label: "過去成果から次の出口へ接続",
    source: "ceo_orbit_mission",
    target: "ceo_second_partial_sale",
    kind: "contributes_to",
    weight: 0.7,
    directed: true,
  },
  {
    t: 34,
    type: "edge.upsert",
    label: "2社目事業売却が資産防衛を支える",
    source: "ceo_second_partial_sale",
    target: "cfo_asset_income",
    kind: "contributes_to",
    weight: 0.92,
    directed: true,
  },
  {
    t: 35,
    type: "edge.upsert",
    label: "資産防衛が健康と時間を支える",
    source: "cfo_asset_income",
    target: "ceo_health_time",
    kind: "contributes_to",
    weight: 0.86,
    directed: true,
  },
  {
    t: 36,
    type: "edge.upsert",
    label: "健康と時間が継承と還元を支える",
    source: "ceo_health_time",
    target: "cpo_legacy_giveback",
    kind: "contributes_to",
    weight: 0.82,
    directed: true,
  },
  {
    t: 37,
    type: "edge.upsert",
    label: "継承と還元が幸せな老後を支える",
    source: "cpo_legacy_giveback",
    target: "ceo_happy_retirement",
    kind: "contributes_to",
    weight: 1.0,
    directed: true,
  },
  {
    t: 38,
    type: "contract.upsert",
    node: "ceo_happy_retirement",
    context: "legacy_future",
    requires: [
      "ceo_second_partial_sale",
      "cfo_asset_income",
      "ceo_health_time",
      "cpo_legacy_giveback",
    ],
    rejects: ["short_term_margin_maximization"],
    role: "terminal_purpose",
    domains: ["wellbeing", "retirement", "legacy_future"],
    label: "幸せな老後 contract を追加",
  },
  {
    t: 39,
    type: "purpose.set",
    terminal: "ceo_happy_retirement",
    context: "legacy_future",
    label: "本線: 幸せな老後",
  },
  {
    t: 40,
    type: "cxo.activity",
    node: "cfo_asset_income",
    label: "CFO activity: asset defense current hash",
    member: "cfo",
    activity: "現時点hashで資産防衛の分配前提を更新中",
  },
];
var ROLES = ["CEO", "CTO", "CFO", "CPO", "COO", "REVIEW", "OPS"];
var LAYER_ORDER = {
  ceo: 0,
  cpo: 1,
  cto: 2,
  coo: 3,
  cfo: 4,
  review_agent: 5,
  ops_agent: 6,
  ops: 6,
};
var LAYER_COL = {
  ceo: "#7fb0ff",
  cpo: "#eaa6ff",
  cto: "#9d8cff",
  coo: "#7de6ff",
  cfo: "#ffd166",
  review_agent: "#ff8fb0",
  ops_agent: "#8df0bd",
  ops: "#8df0bd",
};
var LAYER_ACTOR = {
  ceo: "CEO",
  cpo: "CPO",
  cto: "CTO",
  coo: "COO",
  cfo: "CFO",
  review_agent: "REVIEW",
  ops_agent: "OPS",
  ops: "OPS",
};
var ACTOR_LAYER = {
  CEO: "ceo",
  CPO: "cpo",
  CTO: "cto",
  COO: "coo",
  CFO: "cfo",
  REVIEW: "review_agent",
  OPS: "ops_agent",
};
var SUPPORT_KINDS = {
  contributes_to: 1,
  evidence_for: 1,
  enables: 1,
  operationalizes: 1,
  defines: 1,
  informs: 1,
};
var PURPOSE_LABELS = {
  ceo_company_sale: "法人売却",
  ceo_orbit_mission: "衛星軌道投入",
  ceo_happy_retirement: "幸せな老後",
};
var sceneCanvas = document.getElementById("atlasScene"),
  overlayCanvas = document.getElementById("atlasOverlay"),
  canvas = overlayCanvas,
  sceneCtx = sceneCanvas.getContext("2d", { alpha: true, desynchronized: true }),
  overlayCtx = overlayCanvas.getContext("2d", { alpha: true, desynchronized: true }),
  ctx = overlayCtx,
  tip = document.getElementById("tip");
var dpr = 1,
  world = { w: 1180, h: 1020 },
  zoom = 1,
  panX = 0,
  panY = 0,
  gridCell = 7,
  model,
  hover = null,
  selected = null,
  dragging = false,
  moved = false,
  lastPt = null,
  playTimer = null,
  ops = {},
  sessionQueue = [],
  toastTimer = null,
  currentGuard = null,
  missingMap = {};
var mapCache = { key: "", nodes: [], owners: null, cols: 0, rows: 0 },
  responsibilityCache = { key: "", composition: {}, branches: {} };
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch];
  });
}
function actorOf(n) {
  return n && n.actorCategory
    ? n.actorCategory
    : (n ? LAYER_ACTOR[n.layer] : "CEO") || "CEO";
}
function roleFromMember(s) {
  s = String(s || "").toLowerCase();
  if (s.indexOf("cto") === 0) return "CTO";
  if (s.indexOf("cfo") === 0) return "CFO";
  if (s.indexOf("cpo") === 0) return "CPO";
  if (s.indexOf("coo") === 0) return "COO";
  if (s.indexOf("ops") === 0) return "OPS";
  if (s.indexOf("review") === 0) return "REVIEW";
  return "CEO";
}
function hash01(str) {
  var h = 2166136261;
  str = String(str);
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
function jitter(id, span) {
  return (hash01(id) - 0.5) * span;
}
function radius(n) {
  return Math.max(28, 42 * Number(n.size || 1));
}
function labelFromId(id) {
  return (
    PURPOSE_LABELS[id] ||
    String(id)
      .replace(/^(ceo|cfo|cto|cpo|coo|ops)_/, "")
      .replace(/_/g, " ")
  );
}
function supportDistances(m) {
  var dist = {},
    q = [],
    incoming = {},
    eid,
    e;
  if (!m.currentPurpose || !m.nodes[m.currentPurpose]) return dist;
  for (eid in m.edges) {
    e = m.edges[eid];
    if (!SUPPORT_KINDS[e.kind] || !m.nodes[e.source] || !m.nodes[e.target])
      continue;
    (incoming[e.target] || (incoming[e.target] = [])).push(e.source);
  }
  dist[m.currentPurpose] = 0;
  q.push(m.currentPurpose);
  while (q.length) {
    var t = q.shift(),
      arr = incoming[t] || [];
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (dist[s] != null) continue;
      dist[s] = dist[t] + 1;
      q.push(s);
    }
  }
  return dist;
}
function fallbackMetaRank(n, m) {
  if (n.id === m.currentPurpose) return 0;
  if (n.role === "terminal_purpose") return 1;
  if (n.kind === "purpose" || n.kind === "milestone") return 2;
  if (
    n.kind === "vehicle" ||
    n.kind === "capability" ||
    n.kind === "investigation"
  )
    return 3;
  if (n.kind === "evidence" || n.kind === "metric" || n.kind === "review")
    return 4;
  return 5;
}
function applyMetaLayout(m) {
  var dist = supportDistances(m),
    id,
    n,
    rank,
    li;
  for (id in m.nodes) {
    n = m.nodes[id];
    rank = dist[id] != null ? dist[id] : fallbackMetaRank(n, m);
    rank = Math.max(0, Math.min(8, rank));
    li = LAYER_ORDER[n.layer];
    if (li == null) li = 3;
    n.metaRank = rank;
    n.metaBasis =
      dist[id] != null ? "support_path_to_current_purpose" : "fallback_kind";
    n.ax = 132 + rank * 146 + li * 10 + jitter("x:" + id, 44);
    n.ay = 185 + rank * 64 + li * 24 + jitter("y:" + id, 34);
    if (n.status === "archived") {
      n.ax += 28;
      n.ay += 18;
    }
    n.x = n.ax;
    n.y = n.ay;
    n.r = radius(n);
  }
  relaxLayout(m);
}
function relaxLayout(m) {
  var nodes = [],
    id;
  for (id in m.nodes) nodes.push(m.nodes[id]);
  var axisX = 0.915,
    axisY = 0.401,
    normX = -axisY,
    normY = axisX;
  for (var it = 0; it < 96; it++) {
    var fx = [],
      fy = [],
      i,
      j;
    for (i = 0; i < nodes.length; i++) {
      fx[i] = 0;
      fy[i] = 0;
    }
    for (i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      for (j = i + 1; j < nodes.length; j++) {
        var b = nodes[j],
          dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.sqrt(dx * dx + dy * dy),
          need = a.r + b.r + 14;
        if (d >= need) continue;
        var ux, uy;
        if (d < 0.01) {
          var ang = hash01(a.id + "|" + b.id) * Math.PI * 2;
          ux = Math.cos(ang);
          uy = Math.sin(ang);
        } else {
          ux = dx / d;
          uy = dy / d;
        }
        var ov = (need - d) / 2,
          sx = ux,
          sy = uy;
        if (Math.abs(a.metaRank - b.metaRank) <= 1) {
          var sign = ux * normX + uy * normY >= 0 ? 1 : -1;
          sx = normX * sign * 0.86 + ux * 0.14;
          sy = normY * sign * 0.86 + uy * 0.14;
          var sm = Math.sqrt(sx * sx + sy * sy);
          sx /= sm;
          sy /= sm;
        }
        fx[i] -= sx * ov;
        fy[i] -= sy * ov;
        fx[j] += sx * ov;
        fy[j] += sy * ov;
      }
    }
    var moved = 0;
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i],
        dx0 = n.ax - n.x,
        dy0 = n.ay - n.y,
        da = dx0 * axisX + dy0 * axisY,
        dn = dx0 * normX + dy0 * normY,
        vx = fx[i] * 0.42 + axisX * da * 0.12 + normX * dn * 0.035,
        vy = fy[i] * 0.42 + axisY * da * 0.12 + normY * dn * 0.035,
        mag = Math.sqrt(vx * vx + vy * vy);
      if (mag > 14) {
        vx *= 14 / mag;
        vy *= 14 / mag;
      }
      n.x += vx;
      n.y += vy;
      moved += Math.abs(vx) + Math.abs(vy);
      var margin = n.r + 18;
      n.x = Math.max(margin, Math.min(world.w - margin, n.x));
      n.y = Math.max(margin, Math.min(world.h - margin, n.y));
    }
    if (moved < 0.05) break;
  }
}
function blankModel() {
  var cxo = {};
  ROLES.forEach(function (r) {
    cxo[r] = { count: 0, latest: "未受信" };
  });
  return {
    t: 0,
    nodes: {},
    edges: {},
    contracts: {},
    currentPurpose: null,
    lastEvent: null,
    activities: [],
    cxo: cxo,
    eventLog: [],
  };
}
function makeModel(t) {
  var m = blankModel();
  BASE_NODES.forEach(function (n) {
    upsertNode(m, n, true);
  });
  BASE_EDGES.forEach(function (e) {
    upsertEdge(m, e, true);
  });
  for (var i = 0; i < t && i < EVENTS.length; i++) applyEvent(m, EVENTS[i]);
  applyMetaLayout(m);
  return m;
}
function upsertNode(m, n, base) {
  var old = m.nodes[n.id] || {},
    out = {},
    k;
  for (k in old) out[k] = old[k];
  for (k in n) out[k] = n[k];
  out.status = n.status || old.status || (base ? "active" : "active");
  out.createdAt = out.createdAt || m.t;
  out.base = !!base;
  out.actorCategory =
    n.actorCategory || old.actorCategory || LAYER_ACTOR[out.layer] || "CEO";
  out.r = radius(out);
  m.nodes[out.id] = out;
  return out;
}
function upsertEdge(m, e, base) {
  var id = e.id || e.source + "__" + e.target + "__" + e.kind;
  m.edges[id] = {
    id: id,
    source: e.source,
    target: e.target,
    kind: e.kind || "link",
    weight: e.weight || 0.7,
    directed: e.directed !== false,
    label: e.label || "",
    base: !!base,
    createdAt: m.t,
    status: "active",
  };
}
function ensureContractNode(m, id, ev) {
  if (!m.nodes[id]) {
    var layer = String(id).split("_")[0] || "ceo";
    upsertNode(
      m,
      {
        id: id,
        label: labelFromId(id),
        layer: layer,
        kind: "purpose",
        size: 1,
        status: "planned",
      },
      false,
    );
  }
  if (ev && ev.role) m.nodes[id].role = ev.role;
}
function applyEvent(m, ev) {
  m.t = ev.t;
  m.lastEvent = ev;
  m.eventLog.unshift(
    "t" +
      ev.t +
      " " +
      ev.type +
      " " +
      (ev.label || ev.labelText || ev.id || ev.node || ev.terminal || ""),
  );
  if (m.eventLog.length > 8) m.eventLog.pop();
  if (ev.type === "contract.upsert") {
    ensureContractNode(m, ev.node, ev);
    m.contracts[ev.node] = {
      node: ev.node,
      role: ev.role,
      context: ev.context,
      requires: ev.requires || [],
      rejects: ev.rejects || [],
      label: ev.label || "",
    };
    m.nodes[ev.node].contract = true;
    m.nodes[ev.node].status =
      m.nodes[ev.node].status === "archived" ? "archived" : "active";
  } else if (ev.type === "purpose.set") {
    m.currentPurpose = ev.terminal;
    ensureContractNode(m, ev.terminal, ev);
    m.nodes[ev.terminal].status = "active";
    m.nodes[ev.terminal].terminal = true;
  } else if (ev.type === "node.upsert") upsertNode(m, ev, false);
  else if (ev.type === "edge.upsert") upsertEdge(m, ev, false);
  else if (ev.type === "node.obsolete") {
    var oid = ev.node || ev.id;
    if (m.nodes[oid]) {
      m.nodes[oid].status = "archived";
      m.nodes[oid].archivedAt = ev.t;
    }
  } else if (ev.type === "cxo.activity") {
    var role = roleFromMember(ev.member || ev.node),
      target = m.nodes[ev.node];
    if (!m.cxo[role]) m.cxo[role] = { count: 0, latest: "未受信" };
    m.cxo[role].count++;
    m.cxo[role].latest = ev.activity || ev.label || "";
    m.activities.unshift({
      role: role,
      node: ev.node,
      activity: ev.activity || ev.label || "",
      t: ev.t,
    });
    if (target)
      target.lastActivity = {
        role: role,
        text: ev.activity || ev.label || "",
        t: ev.t,
      };
  }
}
function activeNodes() {
  var arr = [];
  for (var id in model.nodes) {
    var n = model.nodes[id];
    if (n.status === "archived" && zoom < 0.72 && id !== model.currentPurpose)
      continue;
    arr.push(n);
  }
  return arr;
}
function activeEdges() {
  var out = [];
  for (var id in model.edges) {
    var e = model.edges[id];
    if (model.nodes[e.source] && model.nodes[e.target]) out.push(e);
  }
  return out;
}
function pathExists(src, target) {
  if (!model.nodes[src] || !model.nodes[target]) return false;
  if (src === target) return true;
  var q = [src],
    seen = {};
  seen[src] = 1;
  var es = activeEdges();
  while (q.length) {
    var a = q.shift();
    for (var i = 0; i < es.length; i++) {
      var e = es[i];
      if (e.source !== a || !SUPPORT_KINDS[e.kind]) continue;
      var b = e.target;
      if (seen[b]) continue;
      if (b === target) return true;
      seen[b] = 1;
      q.push(b);
    }
  }
  return false;
}
function guard() {
  if (!model.currentPurpose)
    return {
      status: "warn",
      text: "terminal purposeが未設定",
      owner: "CEO",
      missing: [],
      action: "contract を定義",
    };
  var c = model.contracts[model.currentPurpose];
  if (!c)
    return {
      status: "warn",
      text: labelFromId(model.currentPurpose) + " contract未登録",
      owner: "CEO",
      missing: [],
      action: "定義と登録が必要",
    };
  var missing = [];
  for (var i = 0; i < c.requires.length; i++) {
    var r = c.requires[i],
      n = model.nodes[r];
    if (!n || n.status === "archived" || !pathExists(r, model.currentPurpose))
      missing.push(r);
  }
  if (missing.length) {
    var f = labelFromId(missing[0]);
    return {
      status: "missing",
      text: f + "が条件未達成",
      owner: roleFromMember(missing[0]),
      missing: missing,
      action: f + "の接続経路確立が必要",
    };
  }
  return {
    status: "ok",
    text: "全要件が接続・充足",
    owner: "CEO",
    missing: [],
    action: "定期確認継続",
  };
}
function responsibilityData(rootId) {
  var key = model.t + "|" + activeEdges().length + "|" + rootId;
  if (responsibilityCache.key === key) return responsibilityCache;
  var incoming = {},
    es = activeEdges(),
    i,
    e;
  for (i = 0; i < es.length; i++) {
    e = es[i];
    if (!SUPPORT_KINDS[e.kind]) continue;
    (incoming[e.target] || (incoming[e.target] = [])).push(e);
  }
  var memo = {};
  function mergeSets(dst, src) {
    for (var k in src) dst[k] = 1;
    return dst;
  }
  function rec(id, stack) {
    if (memo[id]) return cloneActorSets(memo[id]);
    if (stack[id]) return {};
    var next = {},
      k;
    for (k in stack) next[k] = 1;
    next[id] = 1;
    var arr = incoming[id] || [],
      out = {};
    if (!arr.length) {
      var leafActor = actorOf(model.nodes[id]);
      out[leafActor] = {};
      out[leafActor][id] = 1;
      memo[id] = out;
      return cloneActorSets(out);
    }
    for (var j = 0; j < arr.length; j++) {
      var edge = arr[j],
        child = edge.source,
        a = actorOf(model.nodes[child]);
      if (!out[a]) out[a] = {};
      out[a][child] = 1;
      var sub = rec(child, next);
      for (var actor in sub) {
        if (!out[actor]) out[actor] = {};
        mergeSets(out[actor], sub[actor]);
      }
    }
    memo[id] = out;
    return cloneActorSets(out);
  }
  var sets = rec(rootId, {}),
    composition = {},
    branches = {};
  for (var actor in sets) {
    composition[actor] = Object.keys(sets[actor]).length;
    var edgeSet = {};
    for (i = 0; i < es.length; i++) {
      e = es[i];
      if (!SUPPORT_KINDS[e.kind]) continue;
      if (
        sets[actor][e.source] &&
        (sets[actor][e.target] || e.target === rootId)
      )
        edgeSet[e.id] = 1;
    }
    branches[actor] = { nodes: sets[actor], edges: edgeSet };
  }
  responsibilityCache = {
    key: key,
    composition: composition,
    branches: branches,
  };
  return responsibilityCache;
}
function cloneActorSets(x) {
  var o = {};
  for (var actor in x) {
    o[actor] = {};
    for (var id in x[actor]) o[actor][id] = 1;
  }
  return o;
}
function cloneCounts(x) {
  var o = {};
  for (var k in x) o[k] = x[k];
  return o;
}
function compositionEntries(id) {
  var d = responsibilityData(id).composition,
    arr = [],
    sum = 0,
    k;
  for (k in d) sum += d[k];
  for (k in d)
    arr.push({ actor: k, value: d[k], ratio: sum ? d[k] / sum : 0 });
  arr.sort(function (a, b) {
    return (
      b.value - a.value || ROLES.indexOf(a.actor) - ROLES.indexOf(b.actor)
    );
  });
  return arr;
}
function actorColor(actor, a) {
  var layer = ACTOR_LAYER[actor] || "ceo",
    hex = LAYER_COL[layer] || "#93a6c9",
    rgb = hexToRgb(hex);
  return (
    "rgba(" +
    rgb.r +
    "," +
    rgb.g +
    "," +
    rgb.b +
    "," +
    (a == null ? 1 : a) +
    ")"
  );
}
function ringSpec(n) {
  var entries = compositionEntries(n.id),
    r = Math.max(18, n.r * 0.55),
    line = Math.max(4, 6 / Math.max(0.7, zoom)),
    start = -Math.PI / 2,
    gap = 0.045,
    total = entries.length ? Math.PI * 2 - gap * entries.length : 0,
    arr = [];
  for (var i = 0; i < entries.length; i++) {
    var span = total * entries[i].ratio,
      from = start,
      to = start + span;
    arr.push({
      actor: entries[i].actor,
      from: from,
      to: to,
      ratio: entries[i].ratio,
      value: entries[i].value,
    });
    start = to + gap;
  }
  return { r: r, line: line, segments: arr };
}
function ringVisible(n) {
  var focus = focusNode();
  return (
    n.id === model.currentPurpose ||
    n.contract ||
    n.kind === "purpose" ||
    n.kind === "milestone" ||
    (focus && focus.id === n.id) ||
    zoom > 1.25
  );
}
function focusNode() {
  var f = selected || hover;
  if (!f) return null;
  return f.type === "responsibility" ? f.node : f;
}
function focusActor() {
  var f = selected || hover;
  return f && f.type === "responsibility" ? f.actor : null;
}
function focusBranch() {
  var f = selected || hover;
  if (!f || f.type !== "responsibility") return null;
  return responsibilityData(f.node.id).branches[f.actor] || null;
}
function setT(t) {
  model = makeModel(Math.max(0, Math.min(EVENTS.length, t)));
  mapCache.key = "";
  responsibilityCache.key = "";
  selected = null;
  hover = null;
  tipPinned = false;
  tip.classList.remove("show");
  updateUI();
  renderInspectorOverview();
  invalidateScene("timeline");
}
function step(delta) {
  setT(Math.max(0, Math.min(EVENTS.length, model.t + delta)));
  toast("t" + model.t + " を投影しました");
}
function play() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    document.getElementById("playBtn").textContent = "▶";
    return;
  }
  document.getElementById("playBtn").textContent = "Ⅱ";
  playTimer = setInterval(function () {
    if (model.t >= EVENTS.length) {
      play();
      return;
    }
    step(1);
  }, 420);
}
function updateUI() {
  var g = guard();
  currentGuard = g;
  missingMap = {};
  for (var mi = 0; mi < (g.missing || []).length; mi++)
    missingMap[g.missing[mi]] = 1;
  document.getElementById("currentPurpose").textContent = model.currentPurpose
    ? labelFromId(model.currentPurpose)
    : "未設定";
  var badge = document.getElementById("statusBadge");
  badge.className = "pill " + (g.status === "ok" ? "ok" : "warn");
  badge.textContent = g.status === "ok" ? "一致" : "ズレあり";
  document.getElementById("decisionCopy").textContent =
    g.text + (g.action ? " · " + g.action : "");
  document.getElementById("nextOwner").textContent =
    "次に: " +
    g.owner +
    (g.missing && g.missing.length ? " → " + labelFromId(g.missing[0]) : "");
  document.getElementById("eventProgress").textContent =
    "t" + model.t + "/" + EVENTS.length;
  document.getElementById("lastEvent").textContent = model.lastEvent
    ? model.lastEvent.label ||
      model.lastEvent.labelText ||
      model.lastEvent.type
    : "初期投影";
  var comp = model.currentPurpose
    ? compositionEntries(model.currentPurpose)
    : [];
  document.getElementById("railSummary").textContent =
    (model.lastEvent
      ? "last: " + (model.lastEvent.label || model.lastEvent.type)
      : "t0") +
    " / nodes " +
    activeNodes().length +
    " / edges " +
    activeEdges().length +
    " / responsibility " +
    comp.length;
  document.getElementById("guardText").textContent = g.text;
  document.getElementById("visibleNodes").textContent = String(
    activeNodes().length,
  );
  document.getElementById("visibleEdges").textContent = String(
    activeEdges().length,
  );
  document.getElementById("responsibilityState").textContent =
    JSON.stringify(comp);
  updateOpsDisplay();
  drawTicks();
}
