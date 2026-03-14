import { useState } from 'react'

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQ = [
  {
    q: 'What file formats can I upload?',
    a: 'The suite accepts SDF (V2000/V3000), CSV (must have a SMILES column named "smiles", "SMILES", or "canonical_smiles"), and SMILES files (.smi, .smiles, .txt — one SMILES per line, optional tab-delimited label).',
  },
  {
    q: 'How does the pipeline choose between R-group, scaffold-family, and MMP analysis?',
    a: 'The CoreDetectionAgent runs MCS (Maximum Common Substructure) analysis. If the MCS covers >60% of atoms across the series, R-group decomposition is recommended. If multiple distinct Murcko scaffold families are detected (no single scaffold dominates >50%), scaffold-family analysis is used. Otherwise, matched molecular pair (MMP) analysis is selected.',
  },
  {
    q: 'What is a matched molecular pair (MMP)?',
    a: 'A matched molecular pair is a pair of compounds that differ by a single well-defined structural change (one bond cut). The MMP analysis identifies which structural transformations correlate with property changes — for example, "replacing H with F at position X increases logP by 0.8 on average".',
  },
  {
    q: 'What is an activity cliff?',
    a: 'An activity cliff is a pair of structurally similar molecules (high Tanimoto similarity) that have very different activity values. The suite uses the Structure-Activity Landscape Index (SALI = |ΔActivity| / (1 − Tanimoto)) to score cliff severity. High SALI values indicate steep cliffs where small structural changes cause large activity jumps.',
  },
  {
    q: 'Do I need activity/property data for R-group analysis?',
    a: 'No. R-group decomposition works on structure alone. Property data is optional and enables SAR ranking (ANOVA F-scores per position), MMP property delta analysis, and activity cliff detection.',
  },
  {
    q: 'How does virtual library enumeration work?',
    a: 'The EnumerationAgent uses the detected common core and combines it with R-group substituents observed in the dataset, plus optional built-in libraries (aromatic rings, aliphatic chains, polar groups, halogens). The Cartesian product across all positions generates the virtual library, filtered by property constraints (MW, LogP, Lipinski rules).',
  },
  {
    q: 'What Claude model is used?',
    a: 'The suite uses claude-opus-4-6 for all agent reasoning, interpretation, and natural language generation. Tool execution (RDKit computations) runs locally — the LLM only sees summarized inputs and outputs, not full molecule lists.',
  },
  {
    q: 'Can the chat agent run the full pipeline?',
    a: 'Yes. Upload a file in the Chat tab and ask "run the full analysis" or "detect the core and do SAR". The chat agent will call the same tools as the GUI pipeline and explain the results conversationally.',
  },
  {
    q: 'Is my data sent to Anthropic?',
    a: 'SMILES strings and property values may be included in prompts sent to the Anthropic API for agent interpretation steps. Tool computations (RDKit) run entirely locally. Consult Anthropic\'s data processing terms for API data handling details.',
  },
  {
    q: 'What does "MCS coverage" mean?',
    a: 'MCS coverage is the fraction of molecules in the series that match the Maximum Common Substructure. A coverage of 0.85 means 85% of your compounds share the detected core. Low coverage (<40%) suggests structurally diverse compounds that may be better analyzed as scaffold families or matched pairs.',
  },
]

// ── Tool reference data ───────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'standardize_molecule',
    icon: '⚗',
    color: 'var(--teal)',
    badge: 'preprocessing',
    desc: 'Cleans and normalizes SMILES: removes salt fragments (largest fragment), normalizes functional groups, optionally neutralizes charges. Returns canonical SMILES, InChIKey, MW, LogP, HBD, HBA, TPSA, and a Lipinski pass/fail flag.',
    params: ['smiles_list', 'remove_salts (bool)', 'normalize (bool)', 'neutralize (bool)'],
    returns: 'List of {canonical_smiles, inchikey, MW, LogP, HBD, HBA, TPSA, lipinski_pass, error?}',
  },
  {
    name: 'detect_series_core',
    icon: '◎',
    color: 'var(--blue)',
    badge: 'strategy',
    desc: 'Finds the Maximum Common Substructure (MCS) using rdFMCS with a configurable timeout. Also computes Murcko scaffold frequencies. Returns the MCS SMARTS, coverage stats, scaffold distribution, and a recommended strategy: rgroup | scaffold_family | mmp.',
    params: ['smiles_list', 'mcs_timeout (seconds, default 10)'],
    returns: '{mcs_smarts, mcs_coverage, num_scaffold_families, scaffold_distribution, recommended_approach}',
  },
  {
    name: 'rgroup_decompose_series',
    icon: '⊕',
    color: 'var(--blue)',
    badge: 'decomposition',
    desc: 'Uses RDKit RGroupDecompose to break each molecule into a core scaffold + labelled R-group substituents (R1, R2, …). Auto-detects core via MCS if core_smarts is not provided. Returns a decomposition table, R-group frequency counts, and substituent diversity stats.',
    params: ['smiles_list', 'core_smarts? (SMARTS)', 'labels?', 'properties?'],
    returns: '{decomposition_table, rgroup_positions, rgroup_frequency, num_decomposed, num_input}',
  },
  {
    name: 'rank_rgroup_vs_property',
    icon: '↑',
    color: 'var(--green)',
    badge: 'SAR',
    desc: 'Given a decomposition table and a property column, computes one-way ANOVA F-scores for each R-group position to measure how much variability the substituents explain. Returns ranked substituents per position with mean property values.',
    params: ['decomposition (from rgroup_decompose)', 'property_name', 'higher_is_better (bool)', 'min_count (int)'],
    returns: '{position_importance, ranked_substituents, best_substituents, worst_substituents}',
  },
  {
    name: 'mine_mmp_transforms',
    icon: '⇄',
    color: 'var(--purple)',
    badge: 'MMP',
    desc: 'Mines matched molecular pairs using RDKit rdMMPA single-cut fragmentation. Builds a core index for efficient pair lookup. For each unique transformation (sidechain A → sidechain B at a common core), aggregates mean property deltas across all matched pairs.',
    params: ['smiles_list', 'properties?', 'labels?', 'max_fragment_heavy_atoms (default 13)'],
    returns: '{num_pairs, transforms, top_transforms_by_property}',
  },
  {
    name: 'enumerate_substituent_swaps',
    icon: '∑',
    color: 'var(--amber)',
    badge: 'enumeration',
    desc: 'Generates a virtual compound library from a core SMARTS and R-group libraries using itertools.product across positions. Supports custom SMILES libraries per position and built-in categories (aromatic, aliphatic, polar, halogens). Filters by MW, LogP, and Lipinski constraints.',
    params: ['core_smarts', 'rgroup_library?', 'builtin_library_categories?', 'constraints?', 'max_compounds (default 10000)'],
    returns: '{num_enumerated, library_smiles, property_stats, filter_stats}',
  },
  {
    name: 'detect_activity_cliffs',
    icon: '⚡',
    color: 'var(--red)',
    badge: 'SAR',
    desc: 'Computes all-pairs Tanimoto similarity (Morgan radius-2 FPs) and identifies pairs where similarity > threshold and |ΔActivity| > threshold. Scores each pair with SALI = |ΔActivity| / (1 − Tanimoto). Returns cliff pairs sorted by SALI, plus landscape statistics.',
    params: ['smiles_list', 'activity_values', 'labels?', 'similarity_threshold (default 0.7)', 'activity_diff_threshold (default 1.0)'],
    returns: '{cliff_pairs, num_cliff_pairs, cliff_sensitivity, landscape_stats, most_promiscuous_cliffs}',
  },
  {
    name: 'build_scaffold_tree',
    icon: '⤵',
    color: 'var(--teal)',
    badge: 'scaffold',
    desc: 'Computes Murcko scaffolds for all molecules using RDKit MurckoScaffold, then builds a generic scaffold hierarchy by progressively stripping ring substituents. Returns a tree structure showing scaffold frequencies, member molecules, and per-scaffold property profiles.',
    params: ['smiles_list', 'labels?', 'properties?'],
    returns: '{scaffold_tree, num_unique_scaffolds, most_populated_scaffolds, generic_scaffold_map}',
  },
  {
    name: 'diversity_analysis',
    icon: '◈',
    color: 'var(--green)',
    badge: 'diversity',
    desc: 'Computes chemical diversity using Morgan fingerprints. Selects a maximally diverse subset via MaxMin picking. Clusters molecules by Tanimoto similarity using leader clustering. Returns diversity score (mean pairwise distance), cluster assignments, and the diverse subset.',
    params: ['smiles_list', 'labels?', 'n_diverse (default 10)', 'cluster_cutoff (default 0.65)'],
    returns: '{diversity_score, diverse_subset, clusters, num_clusters, coverage_stats}',
  },
]

const AGENTS = [
  { name: 'OrchestratorAgent', role: 'Pipeline coordinator', desc: 'Routes molecules to the right sub-agents based on structural analysis. Runs all mandatory steps (standardization, activity cliffs, diversity, report) and the strategy-specific pipeline.' },
  { name: 'StandardizationAgent', role: 'Preprocessing', desc: 'Batch-standardizes all molecules, flags duplicates, invalid SMILES, and salt-stripping results.' },
  { name: 'CoreDetectionAgent', role: 'Strategy selection', desc: 'Runs detect_series_core and optionally asks Claude to validate or adjust the recommended strategy for borderline cases.' },
  { name: 'DecompositionAgent', role: 'R-group decomposition', desc: 'Runs rgroup_decompose_series and asks Claude for a 2–3 sentence interpretation of the decomposition results.' },
  { name: 'SARAgent', role: 'SAR analysis', desc: 'Runs rank_rgroup_vs_property and asks Claude to write a SAR narrative and design hypothesis.' },
  { name: 'MMPAgent', role: 'MMP analysis', desc: 'Runs mine_mmp_transforms and asks Claude to identify key transforms and write actionable recommendations.' },
  { name: 'EnumerationAgent', role: 'Virtual library', desc: 'Builds a virtual library from observed R-groups and optional built-in libraries; capped at 5000 compounds.' },
  { name: 'ActivityCliffAgent', role: 'Cliff detection', desc: 'Runs detect_activity_cliffs and asks Claude for interpretation, cliff sensitivity rating, and optimization guidance.' },
  { name: 'ScaffoldAgent', role: 'Scaffold analysis', desc: 'Runs build_scaffold_tree + diversity_analysis, asks Claude to classify dataset type (focused / diverse / mixed).' },
  { name: 'ReportAgent', role: 'Report generation', desc: 'Aggregates all pipeline results and asks Claude to generate an executive summary, key findings, next steps, and SAR insights.' },
  { name: 'ChatAgent', role: 'Conversational interface', desc: 'Wraps all 9 tools into a single conversational agent. Maintains chat history, handles mid-conversation file uploads, and streams tool call progress to the UI in real-time.' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, sub, children }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: '1.1rem', letterSpacing: '0.04em',
        color: 'var(--text-bright)', marginBottom: 4,
      }}>{title}</div>
      {sub && (
        <div style={{
          fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.85rem',
          color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6,
        }}>{sub}</div>
      )}
      {children}
    </section>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      borderBottom: '1px solid var(--border-dim)',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          cursor: 'pointer', padding: '14px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}
      >
        <span style={{
          fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.9rem', fontWeight: 600,
          color: 'var(--text-primary)', lineHeight: 1.4,
        }}>{q}</span>
        <span style={{
          color: 'var(--blue)', fontSize: '1rem', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
        }}>▾</span>
      </button>
      {open && (
        <div style={{
          fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.85rem',
          color: 'var(--text-secondary)', lineHeight: 1.65,
          paddingBottom: 14,
        }}>{a}</div>
      )}
    </div>
  )
}

function ToolCard({ tool }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)',
      background: 'var(--bg-card)',
      overflow: 'hidden',
      marginBottom: 10,
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{tool.icon}</span>
        <code style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
          color: tool.color, flex: 1,
        }}>{tool.name}</code>
        <span className={`badge badge-${tool.badge === 'SAR' ? 'green' : tool.badge === 'MMP' ? 'purple' : tool.badge === 'enumeration' ? 'amber' : tool.badge === 'decomposition' ? 'blue' : 'teal'}`}
          style={{ fontSize: '0.6rem', letterSpacing: '0.06em' }}>
          {tool.badge}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 4 }}>
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border-dim)',
          padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <p style={{
            fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.83rem',
            color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0,
          }}>{tool.desc}</p>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '0.6rem',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 6,
            }}>Parameters</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {tool.params.map(p => (
                <code key={p} style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                  color: 'var(--text-code)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-dim)',
                  borderRadius: 4, padding: '2px 7px',
                }}>{p}</code>
              ))}
            </div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '0.6rem',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 4,
            }}>Returns</div>
            <code style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              color: 'var(--teal)',
            }}>{tool.returns}</code>
          </div>
        </div>
      )}
    </div>
  )
}

function AgentRow({ agent }) {
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '12px 0',
      borderBottom: '1px solid var(--border-dim)',
      alignItems: 'flex-start',
    }}>
      <div style={{ minWidth: 180, flexShrink: 0 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '0.72rem', fontWeight: 700,
          color: 'var(--blue-l)', letterSpacing: '0.04em',
        }}>{agent.name}</div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '0.6rem',
          color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase',
          marginTop: 2,
        }}>{agent.role}</div>
      </div>
      <div style={{
        fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.82rem',
        color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1,
      }}>{agent.desc}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('getting-started')

  const NAV = [
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'file-formats',    label: 'File Formats' },
    { id: 'pipeline',        label: 'Analysis Pipeline' },
    { id: 'tools',           label: 'Tool Reference' },
    { id: 'agents',          label: 'Agent Reference' },
    { id: 'chat',            label: 'Chat Agent' },
    { id: 'faq',             label: 'FAQ' },
  ]

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - var(--header-h))',
      overflow: 'hidden',
    }}>
      {/* ── Sidebar ── */}
      <nav style={{
        width: 200, flexShrink: 0,
        borderRight: '1px solid var(--border-dim)',
        padding: '24px 0',
        overflowY: 'auto',
        background: 'var(--bg-surface)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '0.58rem',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--text-muted)', padding: '0 18px', marginBottom: 12,
        }}>
          Documentation
        </div>
        {NAV.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            style={{
              display: 'block', width: '100%',
              textAlign: 'left', background: 'none',
              border: 'none', borderLeft: `2px solid ${activeSection === id ? 'var(--blue)' : 'transparent'}`,
              padding: '8px 18px',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: '0.72rem',
              fontWeight: activeSection === id ? 700 : 400,
              letterSpacing: '0.04em',
              color: activeSection === id ? 'var(--blue-l)' : 'var(--text-secondary)',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Content ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '32px 48px',
        maxWidth: 800,
      }}>

        {activeSection === 'getting-started' && (
          <>
            <Section title="Getting Started"
              sub="R-Group Analysis Suite is a full-stack computational chemistry platform for SAR analysis, scaffold decomposition, MMP mining, and virtual library generation.">
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)', padding: '18px 20px',
                fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                color: 'var(--text-code)', lineHeight: 2, marginBottom: 20,
              }}>
                <div><span style={{ color: 'var(--text-muted)' }}># 1. Set your API key</span></div>
                <div>cp .env.example .env</div>
                <div style={{ color: 'var(--text-muted)' }}># Edit .env → ANTHROPIC_API_KEY=sk-ant-...</div>
                <div style={{ marginTop: 8 }}><span style={{ color: 'var(--text-muted)' }}># 2. Start everything</span></div>
                <div>./start.sh</div>
                <div style={{ marginTop: 8 }}><span style={{ color: 'var(--text-muted)' }}># Or separately:</span></div>
                <div>uvicorn backend.main:app --reload</div>
                <div>cd frontend && npm run dev</div>
              </div>
              <ol style={{
                fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.85rem',
                color: 'var(--text-secondary)', lineHeight: 2.2, paddingLeft: 20,
              }}>
                <li>Open <code style={{ color: 'var(--teal)' }}>http://localhost:5173</code> in your browser</li>
                <li>Upload a molecule file (SDF, CSV with SMILES column, or .smi)</li>
                <li>Configure the analysis (property of interest, similarity thresholds)</li>
                <li>Watch the 10-agent pipeline run in real-time via the progress terminal</li>
                <li>Explore results across 8 tabs: Overview, Molecules, R-Groups, SAR, MMP, Cliffs, Scaffolds, Diversity</li>
                <li>Or skip to the Chat tab and talk to the agent directly</li>
              </ol>
            </Section>

            <Section title="System Requirements">
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              }}>
                {[
                  ['Python', '≥ 3.9 with pip'],
                  ['RDKit', '≥ 2023.9.6'],
                  ['Node.js', '≥ 18 with npm'],
                  ['Anthropic API Key', 'claude-opus-4-6 access'],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-dim)', padding: '10px 14px',
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: '0.65rem',
                      fontWeight: 700, color: 'var(--blue-l)',
                    }}>{k}</div>
                    <div style={{
                      fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                    }}>{v}</div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {activeSection === 'file-formats' && (
          <Section title="Supported File Formats">
            {[
              {
                fmt: 'SDF (Structure-Data File)',
                ext: '.sdf',
                color: 'var(--blue)',
                desc: 'Standard cheminformatics format. Both V2000 and V3000 mol blocks are supported. Property fields in the SDF data block are parsed as columns.',
                example: '$$$$\nMultiple molecule blocks, each ending with $$$$\nProperty fields like > <IC50> are auto-parsed',
              },
              {
                fmt: 'CSV (Comma-Separated Values)',
                ext: '.csv',
                color: 'var(--teal)',
                desc: 'Must contain a SMILES column. The parser looks for columns named: smiles, SMILES, Smiles, canonical_smiles, or Canonical_SMILES. All other numeric columns are available as property options.',
                example: 'smiles,IC50_nM,logP\nCc1ccccc1,12.5,2.3\nFc1ccccc1,8.1,2.1',
              },
              {
                fmt: 'SMILES File',
                ext: '.smi .smiles .txt',
                color: 'var(--amber)',
                desc: 'One SMILES per line. Optional tab-delimited label in the second column. No property data — structure-only analysis.',
                example: 'Cc1ccccc1\tcompound_001\nFc1ccccc1\tcompound_002',
              },
            ].map(({ fmt, ext, color, desc, example }) => (
              <div key={fmt} style={{
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
                overflow: 'hidden', marginBottom: 16,
              }}>
                <div style={{
                  background: 'var(--bg-surface)', padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: '1px solid var(--border-dim)',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: '0.8rem', color,
                  }}>{fmt}</span>
                  <code style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                    color: 'var(--text-muted)',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '2px 6px', borderRadius: 4,
                  }}>{ext}</code>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <p style={{
                    fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.83rem',
                    color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px',
                  }}>{desc}</p>
                  <pre style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                    color: 'var(--text-code)', background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-dim)', borderRadius: 6,
                    padding: '10px 14px', margin: 0, overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}>{example}</pre>
                </div>
              </div>
            ))}
          </Section>
        )}

        {activeSection === 'pipeline' && (
          <Section title="Analysis Pipeline"
            sub="The OrchestratorAgent coordinates a 7-step pipeline. Steps 1, 5, 6, and 7 always run. Steps 2–4 depend on the detected strategy.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { n: 1, label: 'Standardization', always: true, color: 'var(--teal)', desc: 'Clean SMILES, remove salts, compute properties. Flags duplicates and invalid structures.' },
                { n: 2, label: 'Core Detection', always: true, color: 'var(--blue)', desc: 'MCS analysis + Murcko scaffold distribution → strategy recommendation.' },
                { n: 3, label: 'R-Group Decomposition', always: false, color: 'var(--blue)', when: 'MCS coverage > 60%', desc: 'Decompose into core + labelled R-groups per position.' },
                { n: 4, label: 'SAR Ranking', always: false, color: 'var(--green)', when: 'property data available', desc: 'ANOVA F-scores per R-group position; best/worst substituents.' },
                { n: '3b', label: 'Scaffold Family Analysis', always: false, color: 'var(--purple)', when: 'Multiple scaffold families', desc: 'Scaffold tree + diversity analysis per family.' },
                { n: '3c', label: 'MMP Analysis', always: false, color: 'var(--amber)', when: 'Low structural convergence', desc: 'Mine matched molecular pairs, aggregate property deltas.' },
                { n: 5, label: 'Activity Cliff Detection', always: true, color: 'var(--red)', desc: 'SALI scoring for all structurally similar pairs with large activity differences.' },
                { n: 6, label: 'Diversity Analysis', always: true, color: 'var(--teal)', desc: 'MaxMin diverse subset, leader clustering, diversity score.' },
                { n: 7, label: 'Report Generation', always: true, color: 'var(--green)', desc: 'Executive summary, key findings, next steps, and SAR insights.' },
              ].map(step => (
                <div key={step.n} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 14px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-dim)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: `3px solid ${step.color}`,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: `${step.color}22`,
                    border: `1px solid ${step.color}66`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontSize: '0.65rem',
                    fontWeight: 700, color: step.color,
                  }}>{step.n}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{
                        fontFamily: 'var(--font-display)', fontSize: '0.75rem',
                        fontWeight: 700, color: 'var(--text-primary)',
                      }}>{step.label}</span>
                      {step.always
                        ? <span className="badge badge-teal" style={{ fontSize: '0.55rem' }}>always runs</span>
                        : <span className="badge badge-amber" style={{ fontSize: '0.55rem' }}>when: {step.when}</span>
                      }
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.8rem',
                      color: 'var(--text-secondary)', lineHeight: 1.5,
                    }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {activeSection === 'tools' && (
          <Section title="Tool Reference"
            sub="Tools are pure Python functions with no LLM calls — they use RDKit for all computation. Click any tool to expand its documentation.">
            {TOOLS.map(t => <ToolCard key={t.name} tool={t} />)}
          </Section>
        )}

        {activeSection === 'agents' && (
          <Section title="Agent Reference"
            sub="Agents wrap tools in a Claude tool-use loop for interpretation, narrative generation, and strategy decisions. Each agent has a focused responsibility.">
            {AGENTS.map(a => <AgentRow key={a.name} agent={a} />)}
          </Section>
        )}

        {activeSection === 'chat' && (
          <Section title="Chat Agent"
            sub="The Chat Agent gives you a conversational interface to every tool and pipeline in the suite.">
            <div style={{
              fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.85rem',
              color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 24,
            }}>
              <p>Navigate to the <strong style={{ color: 'var(--blue-l)' }}>Chat</strong> tab to access the conversational agent.
              You can upload a molecule file directly in the chat via the attach button or by dragging a file onto the input box.</p>
              <p>The agent has access to all nine analysis tools and will automatically use the right ones based on your request.
              Tool calls are shown inline in the chat with expandable result data.</p>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '0.65rem',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-muted)', marginBottom: 12,
              }}>Example Queries</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Full pipeline', 'Upload a file, then: "Run the full SAR analysis on these compounds"'],
                  ['Core detection', '"What is the common core of my series, and what strategy do you recommend?"'],
                  ['Targeted tool', '"Decompose these molecules using R1234 as the core SMARTS: [*:1]c1ccccc1[*:2]"'],
                  ['Activity cliffs', '"Find activity cliffs — I have IC50 values in nM (log scale)"'],
                  ['Enumeration', '"Generate 500 virtual analogues using the detected core with aromatic and halogen R-groups"'],
                  ['Comparison', '"Which substituents at R1 are best and worst for logP?"'],
                ].map(([label, query]) => (
                  <div key={label} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
                    borderRadius: 'var(--radius-sm)', padding: '10px 14px',
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                  }}>
                    <span className="badge badge-blue" style={{ fontSize: '0.58rem', flexShrink: 0, marginTop: 2 }}>
                      {label}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.82rem',
                      color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic',
                    }}>"{query}"</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 'var(--radius)', padding: '14px 16px',
            }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '0.65rem',
                fontWeight: 700, color: 'var(--amber)',
                letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
              }}>⚠ Context limit tip</div>
              <div style={{
                fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.82rem',
                color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                For large datasets (&gt;500 molecules), tool results are automatically truncated before being sent to
                Claude. Full results are still shown in tool call cards. If Claude says it can't see all the data,
                ask it to focus on a specific subset or property.
              </div>
            </div>
          </Section>
        )}

        {activeSection === 'faq' && (
          <Section title="Frequently Asked Questions">
            <div style={{ borderTop: '1px solid var(--border-dim)' }}>
              {FAQ.map((item, i) => <FaqItem key={i} {...item} />)}
            </div>
          </Section>
        )}

      </div>
    </div>
  )
}
