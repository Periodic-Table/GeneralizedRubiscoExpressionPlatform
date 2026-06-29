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
  // return `<div class="hero-slot">${escapeHtml(template.hero_label || 'Hero image slot')}</div>`;
}

function svgWrap(inner, viewBox = '0 0 640 240') {
  return `
    <svg viewBox="${viewBox}" role="img" aria-label="Dry lab graphic">
      ${inner}
    </svg>
  `;
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
      <div class="metric-panel">
        <div class="metric-layout">
          <div class="metric-copy">
            <div>
              <h4>What is being measured?</h4>
              <p>${escapeHtml(template.what)}</p>
            </div>
            <div>
              <h4>Why does it matter?</h4>
              <p>${escapeHtml(template.why)}</p>
            </div>
            <div>
              <h4>How was it calculated?</h4>
              <p>${escapeHtml(template.how)}</p>
            </div>
            <div>
              <h4>Interpretation</h4>
              <p>${escapeHtml(metric.interpretation)}</p>
            </div>
          </div>
        </div>
        <div class="metric-panel">
            <div class="hero-slot">${renderHeroSlot(metric, template)}</div>
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
