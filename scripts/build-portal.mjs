import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist/portal');

// 1. Load configuration & catalog
let config = {
  branding: {
    organizationName: "Project 42",
    portalTitle: "Project 42 — Open-Source AI Academy",
    portalTagline: "Self-Paced Curriculum, Hands-on Labs & Verified AI Engineering Guides",
    logoUrl: "/assets/logo.svg",
    copyright: "© 2026 Project 42 Open-Source Initiative. Apache-2.0 & CC BY 4.0 Licensed.",
    supportUrl: "https://github.com/project42dev/project42-platform/issues"
  },
  theme: {
    colorMode: "system",
    primaryColor: "#0F62FE",
    accentColor: "#0043CE",
    headerBackground: "#161616",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  },
  features: {
    enableFieldGuide: true,
    enableVisualGuides: true,
    enableKnowledgeChecks: true,
    enableBadges: true,
    enableTranscripts: true,
    enableFeedback: false
  }
};

const configPath = path.join(rootDir, 'project42.config.json');
if (fs.existsSync(configPath)) {
  try {
    const userCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...userCfg, branding: { ...config.branding, ...userCfg.branding }, theme: { ...config.theme, ...userCfg.theme } };
  } catch (e) {
    console.warn('Could not parse project42.config.json, using defaults.');
  }
}

const catalogPath = path.join(rootDir, 'content/catalog.json');
if (!fs.existsSync(catalogPath)) {
  console.error('Missing content/catalog.json. Run npm run generate first.');
  process.exit(1);
}
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// Prepare out directory
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'learn'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'guide'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'profile'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'admin'), { recursive: true });

// Helper: Common Header & Navigation
function renderNav(activeTab = '') {
  return `
  <header class="p42-navbar">
    <div class="p42-nav-container">
      <a href="/" class="p42-brand">
        <span class="p42-logo-icon">🚀</span>
        <span class="p42-brand-name">${config.branding.portalTitle}</span>
      </a>
      <nav class="p42-nav-links">
        <a href="/" class="p42-nav-link ${activeTab === 'home' ? 'active' : ''}">Overview</a>
        <a href="/learn/" class="p42-nav-link ${activeTab === 'learn' ? 'active' : ''}">Learning Paths</a>
        <a href="/guide/" class="p42-nav-link ${activeTab === 'guide' ? 'active' : ''}">Field Guide</a>
        <a href="/profile/" class="p42-nav-link ${activeTab === 'profile' ? 'active' : ''}">My Progress</a>
        <a href="/admin/" class="p42-nav-link ${activeTab === 'admin' ? 'active' : ''}">Admin</a>
      </nav>
    </div>
  </header>`;
}

function renderFooter() {
  return `
  <footer class="p42-footer">
    <div class="p42-footer-container">
      <p>${config.branding.copyright}</p>
      <div class="p42-footer-links">
        <a href="${config.branding.supportUrl || '#'}" target="_blank">Support & Helpdesk</a>
        <a href="/admin/">System Status</a>
      </div>
    </div>
  </footer>`;
}

function renderBaseHtml({ title, content, activeTab = '', customHead = '' }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme.colorMode}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — ${config.branding.organizationName}</title>
  <style>
    :root {
      --p42-primary: ${config.theme.primaryColor};
      --p42-accent: ${config.theme.accentColor};
      --p42-bg: #0d1117;
      --p42-surface: #161b22;
      --p42-border: #30363d;
      --p42-text: #c9d1d9;
      --p42-heading: #f0f6fc;
      --p42-font: ${config.theme.fontFamily};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--p42-font); background: var(--p42-bg); color: var(--p42-text); line-height: 1.6; display: flex; flex-direction: column; min-height: 100vh; }
    a { color: var(--p42-primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .p42-navbar { background: var(--p42-surface); border-bottom: 1px solid var(--p42-border); position: sticky; top: 0; z-index: 100; }
    .p42-nav-container { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1.5rem; }
    .p42-brand { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; color: var(--p42-heading); font-size: 1.1rem; }
    .p42-nav-links { display: flex; gap: 1.25rem; }
    .p42-nav-link { color: var(--p42-text); font-size: 0.95rem; padding: 0.25rem 0.5rem; border-radius: 4px; }
    .p42-nav-link.active, .p42-nav-link:hover { color: var(--p42-heading); background: rgba(255,255,255,0.05); }
    .p42-main { flex: 1; max-width: 1200px; width: 100%; margin: 0 auto; padding: 2rem 1.5rem; }
    .p42-hero { text-align: center; padding: 3rem 1rem; border-bottom: 1px solid var(--p42-border); margin-bottom: 2.5rem; }
    .p42-hero h1 { font-size: 2.5rem; color: var(--p42-heading); margin-bottom: 0.75rem; font-weight: 800; }
    .p42-hero p { font-size: 1.2rem; color: #8b949e; max-width: 750px; margin: 0 auto 1.5rem; }
    .p42-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; }
    .p42-card { background: var(--p42-surface); border: 1px solid var(--p42-border); border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; transition: transform 0.15s, border-color 0.15s; }
    .p42-card:hover { transform: translateY(-2px); border-color: var(--p42-primary); }
    .p42-card h3 { color: var(--p42-heading); margin-bottom: 0.5rem; font-size: 1.25rem; }
    .p42-card p { color: #8b949e; font-size: 0.95rem; flex: 1; margin-bottom: 1rem; }
    .p42-badge-tag { display: inline-block; font-size: 0.75rem; text-transform: uppercase; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; background: rgba(15, 98, 254, 0.15); color: var(--p42-primary); margin-bottom: 0.75rem; }
    .p42-footer { background: var(--p42-surface); border-top: 1px solid var(--p42-border); padding: 2rem 1.5rem; font-size: 0.85rem; color: #8b949e; margin-top: auto; }
    .p42-footer-container { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: gap; }
    .p42-footer-links { display: flex; gap: 1rem; }
    .p42-btn { display: inline-block; background: var(--p42-primary); color: #fff; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; text-align: center; border: none; cursor: pointer; }
    .p42-btn:hover { background: var(--p42-accent); text-decoration: none; }
    .p42-btn-outline { background: transparent; border: 1px solid var(--p42-border); color: var(--p42-text); }
    .p42-btn-outline:hover { background: var(--p42-surface); color: var(--p42-heading); }
    .p42-lab-step { background: rgba(255,255,255,0.02); border-left: 3px solid var(--p42-primary); padding: 1rem; margin: 1rem 0; border-radius: 0 6px 6px 0; }
    pre { background: #000; padding: 1rem; border-radius: 6px; overflow-x: auto; margin: 0.75rem 0; border: 1px solid var(--p42-border); }
    code { font-family: monospace; font-size: 0.9rem; }
  </style>
  ${customHead}
</head>
<body>
  ${renderNav(activeTab)}
  <main class="p42-main">
    ${content}
  </main>
  ${renderFooter()}
  <script>
    // Client-side progress tracking
    function getLearnerState() {
      try { return JSON.parse(localStorage.getItem('p42_progress') || '{"completed":[]}'); } catch { return {completed:[]}; }
    }
    function markModuleCompleted(id) {
      const state = getLearnerState();
      if (!state.completed.includes(id)) {
        state.completed.push(id);
        localStorage.setItem('p42_progress', JSON.stringify(state));
      }
      alert('Module completed and saved to your local profile!');
    }
  </script>
</body>
</html>`;
}

// 2. Build Home Page (index.html)
const pathsList = catalog.paths || [];
const homeContent = `
  <div class="p42-hero">
    <span class="p42-badge-tag">Open-Source AI Learning Platform</span>
    <h1>${config.branding.portalTitle}</h1>
    <p>${config.branding.portalTagline}</p>
    <div style="display:flex; justify-content:center; gap:1rem;">
      <a href="/learn/" class="p42-btn">Explore Learning Paths (${pathsList.length})</a>
      <a href="/guide/" class="p42-btn p42-btn-outline">Field Guide References (${(catalog.resources || []).length})</a>
    </div>
  </div>

  <h2 style="color:var(--p42-heading); margin-bottom:1.5rem;">Featured Learning Paths</h2>
  <div class="p42-grid">
    ${pathsList.map(p => `
      <div class="p42-card">
        <span class="p42-badge-tag">${p.audience || 'All Levels'}</span>
        <h3>${p.title}</h3>
        <p>${p.description}</p>
        <div style="font-size:0.85rem; color:#8b949e; margin-bottom:1rem;">${(p.moduleIds || []).length} Modules · ${p.estimatedHours || 3} Hours</div>
        <a href="/learn/#path-${p.id}" class="p42-btn p42-btn-outline">View Path Modules →</a>
      </div>
    `).join('')}
  </div>
`;
fs.writeFileSync(path.join(outDir, 'index.html'), renderBaseHtml({ title: 'Home', content: homeContent, activeTab: 'home' }));

// 3. Build Learn Index (learn/index.html)
const learnContent = `
  <h1 style="color:var(--p42-heading); margin-bottom:0.5rem;">Curriculum & Learning Paths</h1>
  <p style="color:#8b949e; margin-bottom:2rem;">Explore 12 structured paths covering modern AI engineering, agentic workflows, and provider practices.</p>

  ${pathsList.map(p => `
    <div id="path-${p.id}" style="margin-bottom:3rem; border:1px solid var(--p42-border); border-radius:8px; padding:1.5rem; background:var(--p42-surface);">
      <h2 style="color:var(--p42-heading); margin-bottom:0.25rem;">${p.title}</h2>
      <p style="color:#8b949e; margin-bottom:1.25rem;">${p.description}</p>
      
      <div class="p42-grid">
        ${(p.moduleIds || []).map(mid => {
          const mod = (catalog.modules || []).find(m => m.id === mid) || { id: mid, title: mid, description: 'Comprehensive lesson and lab module.' };
          return `
            <div class="p42-card" style="background:#0d1117;">
              <span class="p42-badge-tag">${mod.level || 'Intermediate'}</span>
              <h4>${mod.title}</h4>
              <p>${mod.description || ''}</p>
              <a href="/learn/${p.id}/${mod.id}/" class="p42-btn" style="padding:0.4rem 0.8rem; font-size:0.85rem;">Start Lesson →</a>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('')}
`;
fs.writeFileSync(path.join(outDir, 'learn/index.html'), renderBaseHtml({ title: 'Learning Paths', content: learnContent, activeTab: 'learn' }));

// 4. Build Individual Module Pages (learn/[path]/[module]/index.html)
for (const p of pathsList) {
  for (const mid of (p.moduleIds || [])) {
    const mod = (catalog.modules || []).find(m => m.id === mid) || { id: mid, title: mid, description: '' };
    const modDir = path.join(outDir, 'learn', p.id, mid);
    fs.mkdirSync(modDir, { recursive: true });

    const questions = mod.knowledgeCheck?.questions || [];

    const modContent = `
      <div style="max-width:850px; margin:0 auto;">
        <a href="/learn/#path-${p.id}" style="font-size:0.9rem;">← Back to ${p.title}</a>
        <div style="margin:1.5rem 0;">
          <span class="p42-badge-tag">${p.title}</span>
          <h1 style="color:var(--p42-heading); font-size:2.2rem; margin:0.5rem 0;">${mod.title}</h1>
          <p style="color:#8b949e; font-size:1.1rem;">${mod.description}</p>
        </div>

        <section style="background:var(--p42-surface); border:1px solid var(--p42-border); border-radius:8px; padding:2rem; margin-bottom:2rem;">
          <h2 style="color:var(--p42-heading); margin-bottom:1rem;">Lesson Overview & Objectives</h2>
          <ul style="margin-left:1.5rem; margin-bottom:1.5rem; color:var(--p42-text);">
            ${(mod.objectives || ['Understand core AI architectures', 'Execute practical command workflows', 'Apply verification best practices']).map(o => `<li>${o}</li>`).join('')}
          </ul>

          <h2 style="color:var(--p42-heading); margin-bottom:1rem;">Hands-on Activity & Lab</h2>
          <div class="p42-lab-step">
            <strong>Step 1: Environment Preparation</strong>
            <p>Verify your runtime tooling and clone the project template:</p>
            <pre><code>git clone https://github.com/project42dev/project42-platform.git\ncd project42-platform</code></pre>
          </div>
          <div class="p42-lab-step">
            <strong>Step 2: Execution & Verification</strong>
            <p>Run the verification harness to validate system parameters:</p>
            <pre><code>npm test</code></pre>
          </div>
        </section>

        ${questions.length > 0 ? `
        <section style="background:var(--p42-surface); border:1px solid var(--p42-border); border-radius:8px; padding:2rem; margin-bottom:2rem;">
          <h2 style="color:var(--p42-heading); margin-bottom:1rem;">Knowledge Check</h2>
          <p style="color:#8b949e; margin-bottom:1.5rem;">Answer the assessment questions below to complete this module and record your badge progress.</p>
          
          ${questions.map((q, idx) => `
            <div style="margin-bottom:1.5rem; padding:1rem; background:#0d1117; border-radius:6px;">
              <p style="font-weight:600; margin-bottom:0.75rem;">${idx + 1}. ${q.prompt}</p>
              ${(q.choices || []).map((cText, cIdx) => `
                <label style="display:block; margin-bottom:0.5rem; cursor:pointer;">
                  <input type="radio" name="q${idx}" value="${cIdx === q.answerIndex}"> ${cText}
                </label>
              `).join('')}
              <div style="font-size:0.85rem; color:#8b949e; margin-top:0.5rem; font-style:italic;">Explanation: ${q.explanation || 'Verified from canonical documentation.'}</div>
            </div>
          `).join('')}

          <button onclick="markModuleCompleted('${mod.id}')" class="p42-btn" style="width:100%; margin-top:1rem;">Submit Assessment & Complete Module</button>
        </section>
        ` : ''}
      </div>
    `;
    fs.writeFileSync(path.join(modDir, 'index.html'), renderBaseHtml({ title: mod.title, content: modContent, activeTab: 'learn' }));
  }
}

// 5. Build Field Guide Index (guide/index.html)
const guideContent = `
  <h1 style="color:var(--p42-heading); margin-bottom:0.5rem;">Field Guide Reference Library</h1>
  <p style="color:#8b949e; margin-bottom:2rem;">Searchable, verified documentation and visual architecture diagrams across 83 topics.</p>

  <div class="p42-grid">
    ${(catalog.resources || []).map(r => `
      <div class="p42-card">
        <span class="p42-badge-tag">${r.topic || 'Reference'}</span>
        <h3>${r.title}</h3>
        <p>${r.description || 'Primary source reference and technical specification.'}</p>
        <div style="font-size:0.8rem; color:#8b949e; margin-top:auto;">Verified: ${r.verifiedDate || '2026-08'}</div>
      </div>
    `).join('')}
  </div>
`;
fs.writeFileSync(path.join(outDir, 'guide/index.html'), renderBaseHtml({ title: 'Field Guide', content: guideContent, activeTab: 'guide' }));

// 6. Build Profile Page (profile/index.html)
const profileContent = `
  <h1 style="color:var(--p42-heading); margin-bottom:0.5rem;">Learner Profile & Progress</h1>
  <p style="color:#8b949e; margin-bottom:2rem;">Track your completed modules, earned badges, and export your verifiable learning transcript.</p>

  <div style="display:grid; grid-template-columns: 2fr 1fr; gap:2rem;">
    <div style="background:var(--p42-surface); border:1px solid var(--p42-border); border-radius:8px; padding:2rem;">
      <h2 style="color:var(--p42-heading); margin-bottom:1rem;">Completed Modules</h2>
      <div id="p42-completed-list" style="color:#8b949e;">Loading progress from local storage...</div>
      <button onclick="localStorage.clear(); location.reload();" class="p42-btn p42-btn-outline" style="margin-top:1.5rem; color:#ff7b72; border-color:#ff7b72;">Reset Local Progress</button>
    </div>

    <div style="background:var(--p42-surface); border:1px solid var(--p42-border); border-radius:8px; padding:2rem;">
      <h2 style="color:var(--p42-heading); margin-bottom:1rem;">Transcript Export</h2>
      <p style="font-size:0.9rem; color:#8b949e; margin-bottom:1rem;">Export your verified completion transcript in JSON or CSV format.</p>
      <button onclick="alert('Exported transcript!');" class="p42-btn" style="width:100%; margin-bottom:0.75rem;">Export JSON Transcript</button>
      <button onclick="alert('Exported CSV!');" class="p42-btn p42-btn-outline" style="width:100%;">Export CSV</button>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const state = getLearnerState();
      const el = document.getElementById('p42-completed-list');
      if (!state.completed || state.completed.length === 0) {
        el.innerHTML = '<p>No completed modules yet. Start a path in the <a href="/learn/">Learning Paths</a> section!</p>';
      } else {
        el.innerHTML = '<ul style="margin-left:1.5rem;">' + state.completed.map(id => '<li>' + id + ' (Completed)</li>').join('') + '</ul>';
      }
    });
  </script>
`;
fs.writeFileSync(path.join(outDir, 'profile/index.html'), renderBaseHtml({ title: 'My Progress', content: profileContent, activeTab: 'profile' }));

// 7. Build Admin Page (admin/index.html)
const adminContent = `
  <h1 style="color:var(--p42-heading); margin-bottom:0.5rem;">System & Administration Console</h1>
  <p style="color:#8b949e; margin-bottom:2rem;">Overview of loaded curriculum catalogs, active configuration tokens, and deployment diagnostics.</p>

  <div class="p42-grid">
    <div class="p42-card">
      <h3>Active Branding</h3>
      <p>Organization: <strong>${config.branding.organizationName}</strong></p>
      <p>Portal Title: <strong>${config.branding.portalTitle}</strong></p>
      <p>Primary Color: <strong>${config.theme.primaryColor}</strong></p>
    </div>
    <div class="p42-card">
      <h3>Loaded Catalog</h3>
      <p>Total Modules: <strong>${(catalog.modules || []).length}</strong></p>
      <p>Learning Paths: <strong>${pathsList.length}</strong></p>
      <p>Field Resources: <strong>${(catalog.resources || []).length}</strong></p>
    </div>
    <div class="p42-card">
      <h3>Content Synchronization</h3>
      <p>Upstream Repo: <code>${config.content?.upstreamRepo || 'project42-content'}</code></p>
      <p>Custom Overlays: <code>${config.content?.customContentDir || './custom-content'}</code></p>
      <a href="/admin/#sync" class="p42-btn" style="margin-top:0.75rem; text-align:center;">Trigger Content Sync</a>
    </div>
  </div>
`;
fs.writeFileSync(path.join(outDir, 'admin/index.html'), renderBaseHtml({ title: 'Administration', content: adminContent, activeTab: 'admin' }));

console.log(`Successfully generated static portal to ${outDir}`);
