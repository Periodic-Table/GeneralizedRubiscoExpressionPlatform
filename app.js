/*
  Rubisco platform frontend.
  To add a new species, edit rubisco_site_data.json and add a new entry under species.
  All copy and score text is loaded from JSON so the page can be updated without code changes.
*/

const state = {
  data: null,
  speciesKey: null,
  metricIndex: 0,
};

const el = {};

function $(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

function setStatus(message, kind = '') {
  el.status.textContent = message;
  el.status.className = `status ${kind}`;
}

function loadMeasureData() {
  const data = state.data;
  const app = data.app;

  el.sequenceEyebrow.textContent = app.sequence.eyebrow;
  el.sequenceHeadline.textContent = app.sequence.headline;
  el.sequenceSubtitle.textContent = app.sequence.subtitle;
  el.sequenceExamples.textContent = `Examples: ${app.sequence.examples.join(', ')}.`;
  // el.sequenceFooter.textContent = app.sequence.footer;

  el.drylabEyebrow.textContent = app.dryLab.eyebrow;
  el.drylabTitle.textContent = app.dryLab.headline;
  el.drylabSubtitle.textContent = app.dryLab.subtitle;
  el.methodTitle.textContent = app.dryLab.methodology_title;
  el.methodCopy.textContent = app.dryLab.methodology;

  el.speciesSelect.innerHTML = '';
  for (const [key, species] of Object.entries(data.species)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = species.label;
    el.speciesSelect.appendChild(option);
  }

  const firstKey = Object.keys(data.species)[0];
  if (!firstKey) {
    throw new Error('No species available in rubisco_site_data.json.');
  }
  el.speciesSelect.value = firstKey;
  renderSpecies(firstKey);
}

function renderLegend(score) {
  const lines = [
    { label: '80–100', text: 'Strong compatibility', fill: 86 },
    { label: '60–79', text: 'Promising but mixed', fill: 70 },
    { label: 'Below 60', text: 'Needs more validation', fill: 45 },
  ];
  el.scoreLegend.innerHTML = lines.map((item) => `
    <div>
      <div class="legend-row"><span>${escapeHtml(item.label)}</span><span>${escapeHtml(item.text)}</span></div>
      <div class="legend-bar"><span style="width:${item.fill}%"></span></div>
    </div>
  `).join('');
}

function createOverallGauge(score) {
  return `
    <div class="gauge" style="--value: ${Math.max(0, Math.min(100, Number(score) || 0))};">
      <div class="gauge-inner">
        <div class="big">${Number(score).toFixed(1)}</div>
        <div class="unit">/ 100</div>
      </div>
    </div>
  `;
}

function metricTitle(template) {
  return template.title || template.short_title || 'Metric';
}

function resultBadge(metric) {
  return metric.display_result ? escapeHtml(metric.display_result) : 'Pending';
}

function renderHeroSlot(metric, template) {
  if (metric.hero_image_path) {
    return `
      <div class="hero-slot">
        <img src="${escapeHtml(metric.hero_image_path)}" alt="${escapeHtml(metric.hero_image_alt || template.hero_label || template.title)}" />
      </div>
    `;
  }
  return `<div class="hero-slot">${escapeHtml(template.hero_label || 'Hero image slot')}</div>`;
}

function svgWrap(inner, viewBox = '0 0 640 240') {
  return `
    <svg viewBox="${viewBox}" role="img" aria-label="Dry lab graphic">
      ${inner}
    </svg>
  `;
}

function renderGraphic(metricKey, template, metric) {
  const result = metric.display_result || 'Pending';

  if (template.graphic_type === 'deltag') {
    return svgWrap(`
      <defs>
        <linearGradient id="g1" x1="0" x2="1">
          <stop offset="0%" stop-color="#7dd3fc" />
          <stop offset="100%" stop-color="#a78bfa" />
        </linearGradient>
      </defs>
      <rect width="640" height="240" fill="#0b1020" opacity="0.28"></rect>
      <line x1="100" y1="170" x2="540" y2="170" stroke="rgba(255,255,255,0.22)" stroke-width="2" />
      <rect x="145" y="72" width="92" height="98" rx="18" fill="rgba(125,211,252,0.18)" stroke="url(#g1)" />
      <rect x="405" y="52" width="92" height="118" rx="18" fill="rgba(167,139,250,0.18)" stroke="url(#g1)" />
      <path d="M250 90 C300 48, 350 48, 400 90" fill="none" stroke="url(#g1)" stroke-width="4" stroke-linecap="round" />
      <polygon points="394,90 408,82 404,96" fill="#a78bfa" />
      <text x="191" y="194" text-anchor="middle" fill="#e8ecff" font-size="20" font-weight="700">Original</text>
      <text x="451" y="194" text-anchor="middle" fill="#e8ecff" font-size="20" font-weight="700">Mutant</text>
      <text x="320" y="40" text-anchor="middle" fill="#aab4dd" font-size="16">FoldX stability comparison</text>
      <text x="320" y="136" text-anchor="middle" fill="#e8ecff" font-size="22" font-weight="700">${escapeHtml(result)}</text>
    `);
  }

  if (template.graphic_type === 'rmsd') {
    return svgWrap(`
      <rect width="640" height="240" fill="#0b1020" opacity="0.26"></rect>
      <path d="M120 170 C180 88, 250 88, 310 170" fill="none" stroke="rgba(125,211,252,0.55)" stroke-width="9" stroke-linecap="round" />
      <path d="M160 170 C220 78, 290 78, 350 170" fill="none" stroke="rgba(167,139,250,0.55)" stroke-width="9" stroke-linecap="round" />
      <path d="M330 170 C390 90, 460 90, 520 170" fill="none" stroke="rgba(125,211,252,0.25)" stroke-width="9" stroke-linecap="round" />
      <circle cx="245" cy="122" r="70" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-dasharray="6 8" />
      <circle cx="285" cy="122" r="70" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-dasharray="6 8" />
      <text x="320" y="42" text-anchor="middle" fill="#aab4dd" font-size="16">ChimeraX alignment</text>
      <text x="320" y="210" text-anchor="middle" fill="#e8ecff" font-size="22" font-weight="700">${escapeHtml(result)}</text>
    `);
  }

  if (template.graphic_type === 'interface') {
    return svgWrap(`
      <rect width="640" height="240" fill="#0b1020" opacity="0.26"></rect>
      <rect x="76" y="70" width="170" height="82" rx="18" fill="rgba(125,211,252,0.16)" stroke="rgba(125,211,252,0.7)" />
      <rect x="394" y="70" width="170" height="82" rx="18" fill="rgba(167,139,250,0.16)" stroke="rgba(167,139,250,0.7)" />
      <path d="M246 112 L394 112" stroke="rgba(255,255,255,0.35)" stroke-width="10" stroke-linecap="round" />
      <path d="M246 112 L394 112" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-dasharray="4 6" />
      <circle cx="320" cy="112" r="38" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)" />
      <text x="320" y="42" text-anchor="middle" fill="#aab4dd" font-size="16">Interface surface comparison</text>
      <text x="320" y="142" text-anchor="middle" fill="#e8ecff" font-size="22" font-weight="700">${escapeHtml(result)}</text>
    `);
  }

  if (template.graphic_type === 'alignment') {
    return svgWrap(`
      <rect width="640" height="240" fill="#0b1020" opacity="0.26"></rect>
      <rect x="90" y="86" width="190" height="26" rx="13" fill="rgba(125,211,252,0.28)" />
      <rect x="118" y="122" width="190" height="26" rx="13" fill="rgba(125,211,252,0.14)" />
      <rect x="236" y="86" width="190" height="26" rx="13" fill="rgba(167,139,250,0.22)" />
      <rect x="264" y="122" width="190" height="26" rx="13" fill="rgba(167,139,250,0.1)" />
      <path d="M250 44 L390 44" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
      <path d="M250 44 L320 82 L390 44" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
      <text x="320" y="200" text-anchor="middle" fill="#e8ecff" font-size="22" font-weight="700">${escapeHtml(result)}</text>
      <text x="320" y="42" text-anchor="middle" fill="#aab4dd" font-size="16">N-terminus alignment</text>
    `);
  }

  if (template.graphic_type === 'surface') {
    return svgWrap(`
      <rect width="640" height="240" fill="#0b1020" opacity="0.26"></rect>
      <ellipse cx="228" cy="118" rx="92" ry="56" fill="rgba(125,211,252,0.18)" stroke="rgba(125,211,252,0.8)" stroke-width="3" />
      <ellipse cx="342" cy="118" rx="94" ry="58" fill="rgba(167,139,250,0.16)" stroke="rgba(167,139,250,0.8)" stroke-width="3" />
      <ellipse cx="342" cy="118" rx="74" ry="42" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" stroke-dasharray="5 6" />
      <path d="M196 194 C250 174, 390 174, 444 194" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
      <text x="320" y="42" text-anchor="middle" fill="#aab4dd" font-size="16">Surface area comparison</text>
      <text x="320" y="200" text-anchor="middle" fill="#e8ecff" font-size="22" font-weight="700">${escapeHtml(result)}</text>
    `);
  }

  if (template.graphic_type === 'mutation') {
    const cells = [];
    const tones = ['rgba(125,211,252,0.24)', 'rgba(125,211,252,0.38)', 'rgba(167,139,250,0.42)', 'rgba(167,139,250,0.18)'];
    let idx = 0;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const x = 90 + col * 48;
        const y = 72 + row * 30;
        cells.push(`<rect x="${x}" y="${y}" width="36" height="22" rx="5" fill="${tones[(idx + row + col) % tones.length]}" />`);
        idx += 1;
      }
    }
    return svgWrap(`
      <rect width="640" height="240" fill="#0b1020" opacity="0.26"></rect>
      ${cells.join('')}
      <rect x="430" y="62" width="138" height="116" rx="16" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" />
      <text x="499" y="95" text-anchor="middle" fill="#aab4dd" font-size="16">BLOSUM62</text>
      <text x="499" y="128" text-anchor="middle" fill="#e8ecff" font-size="28" font-weight="800">Pending</text>
      <text x="320" y="214" text-anchor="middle" fill="#e8ecff" font-size="20" font-weight="700">${escapeHtml(result)}</text>
      <text x="320" y="42" text-anchor="middle" fill="#aab4dd" font-size="16">Conservation-weighted mutation map</text>
    `);
  }

  if (template.graphic_type === 'codon') {
    return svgWrap(`
      <rect width="640" height="240" fill="#0b1020" opacity="0.26"></rect>
      <rect x="108" y="102" width="380" height="22" rx="11" fill="rgba(255,255,255,0.08)" />
      <rect x="108" y="102" width="270" height="22" rx="11" fill="url(#g2)" />
      <defs>
        <linearGradient id="g2" x1="0" x2="1">
          <stop offset="0%" stop-color="#7dd3fc" />
          <stop offset="100%" stop-color="#a78bfa" />
        </linearGradient>
      </defs>
      <circle cx="500" cy="113" r="42" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.14)" />
      <text x="500" y="118" text-anchor="middle" fill="#e8ecff" font-size="20" font-weight="800">0.708</text>
      <text x="320" y="42" text-anchor="middle" fill="#aab4dd" font-size="16">Codon adaptation</text>
      <text x="320" y="162" text-anchor="middle" fill="#e8ecff" font-size="22" font-weight="700">CAI</text>
      <text x="320" y="190" text-anchor="middle" fill="#aab4dd" font-size="16">E. coli preferred codons</text>
    `);
  }

  return svgWrap(`
    <rect width="640" height="240" fill="#0b1020" opacity="0.26"></rect>
    <text x="320" y="120" text-anchor="middle" fill="#e8ecff" font-size="24" font-weight="700">${escapeHtml(result)}</text>
  `);
}

function buildMetricSlide(metricKey, template, metric, index, total) {
  return `
    <article class="metric-slide" data-metric="${escapeHtml(metricKey)}">
      <div class="metric-top">
        <div>
          <div class="section-label">Metric ${index + 1} of ${total}</div>
          <h3>${escapeHtml(metricTitle(template))}</h3>
        </div>
        <div class="metric-badge">${resultBadge(metric)}</div>
      </div>

      <div class="metric-layout">
        <div class="metric-panel">
          <div class="metric-label">What is being measured?</div>
          <p>${escapeHtml(metric.what)}</p>

          <div class="metric-copy">
            <div>
              <h4>Why does it matter?</h4>
              <p>${escapeHtml(metric.why)}</p>
            </div>
            <div>
              <h4>How was it calculated?</h4>
              <p>${escapeHtml(metric.how)}</p>
            </div>
            <div>
              <h4>Interpretation</h4>
              <p>${escapeHtml(metric.interpretation)}</p>
            </div>
          </div>

          <details class="metric-details">
            <summary>More details</summary>
            <div class="detail-grid">
              <div class="detail-item"><strong>Technical note:</strong> ${escapeHtml(metric.technical_details || 'No technical note supplied yet.')}</div>
              <div class="detail-item"><strong>Raw result:</strong> ${escapeHtml(metric.display_result || 'Pending')}</div>
            </div>
          </details>
        </div>

        <div class="metric-panel">
          <!-- <div class="metric-label">Graphic</div> -->
          <div class="hero-slot">${renderHeroSlot(metric, template)}</div>
          <!-- <div class="metric-graphic" >${renderGraphic(metricKey, template, metric)}</div> -->
          <div class="metric-caption" align="center">${escapeHtml(template.hero_label || '')}</div>
        </div>
      </div>
    </article>
  `;
}

function renderSpecies(speciesKey) {
  const data = state.data;
  const species = data.species[speciesKey];
  if (!species) return;
  state.speciesKey = speciesKey;
  state.metricIndex = 0;

  el.speciesLabel.textContent = species.label;
  el.overallScore.textContent = Number(species.overall_score).toFixed(1);
  el.overallInterpretation.textContent = species.overall_interpretation;
  el.overallSummary.textContent = species.overall_summary;
  el.overallNote.textContent = species.overall_note;
  el.overallGauge.style.setProperty('--value', Math.max(0, Math.min(100, Number(species.overall_score) || 0)));
  el.scoreLegend && renderLegend(species.overall_score);

  const templates = data.app.dryLab.metric_templates;
  const order = data.app.dryLab.metric_order;
  const slides = order.map((key, index) => {
    const template = templates[key];
    const metric = species.metrics[key] || {};
    return buildMetricSlide(key, template, metric, index, order.length);
  });

  el.metricTrack.innerHTML = slides.join('');
  el.metricDots.innerHTML = order.map((_, index) => `<button class="dot${index === 0 ? ' active' : ''}" type="button" aria-label="Go to metric ${index + 1}"></button>`).join('');
  el.metricDots.querySelectorAll('.dot').forEach((dot, index) => {
    dot.addEventListener('click', () => {
      state.metricIndex = index;
      updateCarousel();
    });
  });

  const firstTemplate = templates[order[0]];
  el.metricTitle.textContent = firstTemplate ? firstTemplate.title : 'Metric';
  el.carouselKicker.textContent = `Metric ${state.metricIndex + 1} of ${order.length}`;
  updateCarousel();
}

function updateCarousel() {
  const data = state.data;
  const order = data.app.dryLab.metric_order;
  const templates = data.app.dryLab.metric_templates;
  const idx = Math.max(0, Math.min(order.length - 1, state.metricIndex));
  state.metricIndex = idx;
  el.metricTrack.style.transform = `translateX(-${idx * 100}%)`;
  el.metricTitle.textContent = templates[order[idx]].title;
  el.carouselKicker.textContent = `Metric ${idx + 1} of ${order.length}`;
  el.metricDots.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === idx));
}

function nextMetric(delta) {
  const total = state.data.app.dryLab.metric_order.length;
  state.metricIndex = (state.metricIndex + delta + total) % total;
  updateCarousel();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

async function searchSequence() {
  const query = el.plantName.value.trim();
  if (!query) {
    setStatus('Please enter a plant name.', 'bad');
    return;
  }

  el.searchBtn.disabled = true;
  setStatus('Searching UniProt taxonomy and protein records...', '');
  el.resultHint.textContent = 'Searching...';
  el.fastaOutput.value = '';
  el.metaGrid.hidden = true;

  try {
    const data = await fetchJson(`/api/search?name=${encodeURIComponent(query)}`);
    if (data.error) throw new Error(data.error);

    el.fastaOutput.value = data.fasta || '';
    el.taxonMatch.textContent = data.taxon_display || '-';
    el.accession.textContent = data.accession || '-';
    el.proteinName.textContent = data.protein_name || '-';
    el.organismName.textContent = data.organism_name || '-';
    el.metaGrid.hidden = false;
    el.resultHint.textContent = data.fasta ? 'Ready to copy.' : 'No FASTA returned.';
    setStatus(data.message || 'Done.', 'good');
  } catch (err) {
    console.error(err);
    setStatus(`Search failed: ${err.message}`, 'bad');
    el.resultHint.textContent = 'Error';
  } finally {
    el.searchBtn.disabled = false;
  }
}

function collectElements() {
  const ids = [
    'sequenceEyebrow', 'sequenceHeadline', 'sequenceSubtitle', 'sequenceExamples', 'sequenceFooter',
    'drylabEyebrow', 'drylabTitle', 'drylabSubtitle', 'methodTitle', 'methodCopy',
    'speciesSelect', 'speciesLabel', 'overallGauge', 'overallScore', 'overallInterpretation',
    'overallSummary', 'overallNote', 'scoreLegend', 'metricTrack', 'metricDots', 'metricTitle',
    'carouselKicker', 'plantName', 'searchBtn', 'copyBtn', 'clearBtn', 'status', 'fastaOutput',
    'metaGrid', 'taxonMatch', 'accession', 'proteinName', 'organismName', 'resultHint',
    'prevMetricBtn', 'nextMetricBtn'
  ];
  for (const id of ids) el[id] = document.getElementById(id);
}

async function init() {
  collectElements();
  state.data = await fetchJson('/rubisco_site_data.json');
  loadMeasureData();

  el.speciesSelect.addEventListener('change', (e) => renderSpecies(e.target.value));
  el.prevMetricBtn.addEventListener('click', () => nextMetric(-1));
  el.nextMetricBtn.addEventListener('click', () => nextMetric(1));
  el.searchBtn.addEventListener('click', searchSequence);
  el.plantName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchSequence();
  });

  el.copyBtn.addEventListener('click', async () => {
    if (!el.fastaOutput.value.trim()) {
      setStatus('Nothing to copy yet.', 'bad');
      return;
    }
    try {
      await navigator.clipboard.writeText(el.fastaOutput.value);
      setStatus('FASTA copied to clipboard.', 'good');
    } catch {
      el.fastaOutput.select();
      document.execCommand('copy');
      setStatus('FASTA copied to clipboard.', 'good');
    }
  });

  el.clearBtn.addEventListener('click', () => {
    el.plantName.value = '';
    el.fastaOutput.value = '';
    el.metaGrid.hidden = true;
    setStatus('Ready.', '');
    el.resultHint.textContent = 'No sequence loaded yet.';
    el.plantName.focus();
  });
}

init().catch((err) => {
  console.error(err);
  alert(`Failed to initialize the interface: ${err.message}`);
});
