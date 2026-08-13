PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('official','company','institution','media','secondary','unknown')),
  url TEXT,
  publication_date TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('A','B','C','D')),
  archived_path TEXT,
  retrieved_at TEXT,
  sha256 TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS entity (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('country','province','city','industry','company','project','government')),
  name TEXT NOT NULL,
  parent_entity_id TEXT REFERENCES entity(entity_id),
  aliases_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS indicator_definition (
  indicator_id TEXT PRIMARY KEY,
  indicator_name TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('world','industry','company','project','government','talent','infrastructure')),
  value_type TEXT NOT NULL CHECK (value_type IN ('number','text','boolean')),
  canonical_unit TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS observation (
  observation_id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicator_definition(indicator_id),
  entity_id TEXT NOT NULL REFERENCES entity(entity_id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  value_number REAL,
  value_text TEXT,
  unit TEXT,
  source_id TEXT REFERENCES source(source_id),
  publication_date TEXT,
  effective_date TEXT NOT NULL,
  information_available_date TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('A','B','C','D')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified','provisional','needs_verification')),
  notes TEXT,
  derivation_formula TEXT,
  CHECK ((value_number IS NOT NULL) <> (value_text IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_observation_context
  ON observation(entity_id, indicator_id, information_available_date);
CREATE INDEX IF NOT EXISTS idx_observation_period
  ON observation(period_start, period_end);

CREATE TABLE IF NOT EXISTS case_library (
  case_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  archetype TEXT NOT NULL,
  decision_date TEXT,
  outcome TEXT CHECK (outcome IN ('success','failure','mixed','unknown')),
  case_status TEXT NOT NULL CHECK (case_status IN ('verified','partially_verified','needs_verification')),
  player_visible_outcome INTEGER NOT NULL DEFAULT 0 CHECK (player_visible_outcome IN (0,1)),
  research_question TEXT NOT NULL,
  source_id TEXT REFERENCES source(source_id),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS case_milestone (
  milestone_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES case_library(case_id),
  milestone_date TEXT NOT NULL,
  stage TEXT NOT NULL,
  description TEXT NOT NULL,
  source_id TEXT REFERENCES source(source_id),
  information_available_date TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('A','B','C','D')),
  is_withheld_outcome INTEGER NOT NULL DEFAULT 0 CHECK (is_withheld_outcome IN (0,1))
);

CREATE TABLE IF NOT EXISTS historical_event (
  event_id TEXT PRIMARY KEY,
  event_date TEXT NOT NULL,
  announced_at TEXT,
  effective_from TEXT,
  effective_to TEXT,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_industries_json TEXT NOT NULL DEFAULT '[]',
  affected_variables_json TEXT NOT NULL DEFAULT '[]',
  magnitude TEXT,
  duration TEXT,
  information_available_date TEXT,
  source_id TEXT REFERENCES source(source_id),
  confidence TEXT NOT NULL CHECK (confidence IN ('A','B','C','D'))
);

CREATE TABLE IF NOT EXISTS policy_library (
  policy_id TEXT PRIMARY KEY,
  policy_date TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  title TEXT NOT NULL,
  issuer TEXT,
  effective_date TEXT,
  expiry_date TEXT,
  target_industries_json TEXT NOT NULL DEFAULT '[]',
  eligible_entities_json TEXT NOT NULL DEFAULT '[]',
  tool_type TEXT,
  tool_value_or_strength TEXT,
  conditions TEXT,
  policy_effects_json TEXT NOT NULL DEFAULT '[]',
  information_available_date TEXT,
  source_id TEXT REFERENCES source(source_id),
  confidence TEXT NOT NULL CHECK (confidence IN ('A','B','C','D'))
);

CREATE TABLE IF NOT EXISTS data_gap (
  gap_id TEXT PRIMARY KEY,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 5),
  domain TEXT NOT NULL,
  entity_or_case TEXT NOT NULL,
  period TEXT NOT NULL,
  missing_fields_json TEXT NOT NULL,
  required_source TEXT NOT NULL,
  blocks_replay INTEGER NOT NULL CHECK (blocks_replay IN (0,1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  notes TEXT
);

CREATE VIEW IF NOT EXISTS agent_visible_observations AS
SELECT * FROM observation
WHERE information_available_date IS NOT NULL
  AND verification_status <> 'needs_verification';

CREATE VIEW IF NOT EXISTS database_completeness AS
SELECT domain,
       COUNT(*) AS observation_count,
       SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) AS verified_count,
       SUM(CASE WHEN verification_status = 'provisional' THEN 1 ELSE 0 END) AS provisional_count,
       SUM(CASE WHEN information_available_date IS NULL THEN 1 ELSE 0 END) AS missing_cutoff_count
FROM observation o JOIN indicator_definition i USING (indicator_id)
GROUP BY domain;
