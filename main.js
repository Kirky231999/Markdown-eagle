const plugin = async (context) => {
  const { eagle, powersdk } = context;
  const container = powersdk?.container || document.body;
  const storage = powersdk?.storage || {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
  };

  const fs = (() => {
    try {
      if (typeof window !== 'undefined' && typeof window.require === 'function') {
        return window.require('fs');
      }
      if (typeof require === 'function') {
        return require('fs');
      }
    } catch (err) {
      console.error('Could not load fs module:', err);
    }
    return null;
  })();

  const defaults = {
    endpoint: storage.get('endpoint') || 'http://127.0.0.1:1234/v1/chat/completions',
    model: storage.get('model') || 'local-model',
    apiKey: storage.get('apiKey') || 'lm-studio',
    renameTitle: String(storage.get('renameTitle') ?? 'true') === 'true',
    appendSummary: String(storage.get('appendSummary') ?? 'true') === 'true',
    overwriteAnnotation: String(storage.get('overwriteAnnotation') ?? 'false') === 'true',
    maxChars: Number(storage.get('maxChars') || 12000),
  };

  container.innerHTML = `
    <div style="font-family: Inter, system-ui, sans-serif; padding: 16px; color: #111827; max-width: 860px;">
      <div style="border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; background: #ffffff; box-shadow: 0 4px 18px rgba(0,0,0,0.05);">
        <h2 style="margin: 0 0 8px; font-size: 20px;">Markdown AI V1</h2>
        <p style="margin: 0 0 16px; color: #4b5563; line-height: 1.5;">
          Reads selected <code>.md</code> files, sends the text to a local OpenAI-compatible endpoint,
          then writes back a cleaned title, summary, and tags into Eagle.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
            Endpoint
            <input id="pe-endpoint" type="text" value="${escapeHtml(defaults.endpoint)}" style="padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px;" />
          </label>
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
            Model
            <input id="pe-model" type="text" value="${escapeHtml(defaults.model)}" style="padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px;" />
          </label>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 140px; gap: 12px; margin-bottom: 12px;">
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
            API key
            <input id="pe-apiKey" type="password" value="${escapeHtml(defaults.apiKey)}" style="padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px;" />
          </label>
          <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
            Max chars
            <input id="pe-maxChars" type="number" value="${defaults.maxChars}" min="1000" max="50000" step="500" style="padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px;" />
          </label>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 16px; margin: 10px 0 16px; font-size: 13px;">
          <label><input id="pe-renameTitle" type="checkbox" ${defaults.renameTitle ? 'checked' : ''} /> Rename title</label>
          <label><input id="pe-appendSummary" type="checkbox" ${defaults.appendSummary ? 'checked' : ''} /> Append summary to annotation</label>
          <label><input id="pe-overwriteAnnotation" type="checkbox" ${defaults.overwriteAnnotation ? 'checked' : ''} /> Overwrite annotation</label>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 14px;">
          <button id="pe-run" style="padding: 10px 14px; border: 0; border-radius: 10px; background: #111827; color: white; cursor: pointer;">Analyze selected Markdown</button>
          <button id="pe-copy" style="padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 10px; background: white; cursor: pointer;">Copy last result</button>
        </div>

        <div id="pe-status" style="margin-bottom: 12px; padding: 10px 12px; border-radius: 10px; background: #f3f4f6; color: #374151;">Ready.</div>
        <pre id="pe-output" style="white-space: pre-wrap; word-break: break-word; padding: 12px; margin: 0; border: 1px solid #e5e7eb; border-radius: 12px; background: #fafafa; min-height: 180px; max-height: 420px; overflow: auto;"></pre>
      </div>
    </div>
  `;

  const el = {
    endpoint: container.querySelector('#pe-endpoint'),
    model: container.querySelector('#pe-model'),
    apiKey: container.querySelector('#pe-apiKey'),
    maxChars: container.querySelector('#pe-maxChars'),
    renameTitle: container.querySelector('#pe-renameTitle'),
    appendSummary: container.querySelector('#pe-appendSummary'),
    overwriteAnnotation: container.querySelector('#pe-overwriteAnnotation'),
    run: container.querySelector('#pe-run'),
    copy: container.querySelector('#pe-copy'),
    status: container.querySelector('#pe-status'),
    output: container.querySelector('#pe-output'),
  };

  let lastResultText = '';

  el.copy.addEventListener('click', async () => {
    if (!lastResultText) {
      setStatus('Nothing to copy yet.', 'warn');
      return;
    }
    try {
      await navigator.clipboard.writeText(lastResultText);
      setStatus('Copied last result.', 'success');
    } catch (err) {
      console.error(err);
      setStatus(`Copy failed: ${err.message}`, 'error');
    }
  });

  el.run.addEventListener('click', async () => {
    try {
      if (!fs?.promises) {
        throw new Error('Node fs access is unavailable in this plugin runtime.');
      }

      persistSettings();

      setStatus('Reading selected items...', 'info');
      el.output.textContent = '';
      lastResultText = '';

      const selected = await eagle.item.getSelected();
      const markdownItems = (selected || []).filter((item) => {
        const ext = String(item.ext || '').toLowerCase();
        return ext === 'md' || ext === 'markdown';
      });

      if (!markdownItems.length) {
        setStatus('No selected Markdown items found. Select one or more .md files in Eagle first.', 'warn');
        return;
      }

      const results = [];
      for (let i = 0; i < markdownItems.length; i += 1) {
        const item = markdownItems[i];
        setStatus(`Processing ${i + 1} of ${markdownItems.length}: ${item.name || item.filePath}`, 'info');

        const raw = await fs.promises.readFile(item.filePath, 'utf8');
        const trimmed = raw.slice(0, Number(el.maxChars.value || 12000));
        const analysis = await analyzeMarkdown({
          endpoint: el.endpoint.value.trim(),
          model: el.model.value.trim(),
          apiKey: el.apiKey.value,
          item,
          markdown: trimmed,
        });

        applyAnalysisToItem(item, analysis, {
          renameTitle: el.renameTitle.checked,
          appendSummary: el.appendSummary.checked,
          overwriteAnnotation: el.overwriteAnnotation.checked,
        });

        await item.save();

        const resultBlock = [
          `# ${item.name || analysis.title || 'Untitled'}`,
          `Saved to item: ${item.name || '(untitled)'}`,
          '',
          `Title: ${analysis.title || ''}`,
          `Summary: ${analysis.summary || ''}`,
          `Tags: ${(analysis.tags || []).join(', ')}`,
          '---',
        ].join('\n');

        results.push(resultBlock);
      }

      lastResultText = results.join('\n\n');
      el.output.textContent = lastResultText;
      setStatus(`Finished. Updated ${markdownItems.length} Markdown item(s).`, 'success');
      await eagle.notification.show({
        title: 'Markdown AI V1',
        description: `Updated ${markdownItems.length} item(s).`,
      });
    } catch (err) {
      console.error(err);
      el.output.textContent += `\n\nERROR: ${err.stack || err.message}`;
      setStatus(`Failed: ${err.message}`, 'error');
      try {
        await eagle.notification.show({
          title: 'Markdown AI V1 error',
          description: err.message,
        });
      } catch (_) {}
    }
  });

  function persistSettings() {
    storage.set('endpoint', el.endpoint.value.trim());
    storage.set('model', el.model.value.trim());
    storage.set('apiKey', el.apiKey.value);
    storage.set('renameTitle', String(el.renameTitle.checked));
    storage.set('appendSummary', String(el.appendSummary.checked));
    storage.set('overwriteAnnotation', String(el.overwriteAnnotation.checked));
    storage.set('maxChars', String(el.maxChars.value || 12000));
  }

  async function analyzeMarkdown({ endpoint, model, apiKey, item, markdown }) {
    const systemPrompt = [
      'You analyze Markdown research or note files and return strict JSON only.',
      'Return an object with keys: title, summary, tags.',
      'title: short cleaned title string, no markdown, max 80 characters.',
      'summary: 2 to 4 sentences, plain text, concise.',
      'tags: array of 5 to 10 short lowercase tags, no hashtags, no duplicates.',
      'Do not include commentary outside JSON.'
    ].join(' ');

    const userPrompt = [
      `File name: ${item.name || ''}`,
      `Extension: ${item.ext || ''}`,
      'Markdown content follows:',
      markdown,
    ].join('\n\n');

    const payload = {
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey || 'lm-studio'}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Model request failed (${response.status}): ${text.slice(0, 500)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Model returned no content.');
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      const extracted = extractJsonObject(content);
      parsed = JSON.parse(extracted);
    }

    const normalized = {
      title: cleanTitle(parsed.title || item.name || ''),
      summary: String(parsed.summary || '').trim(),
      tags: normalizeTags(parsed.tags),
    };

    if (!normalized.summary) {
      throw new Error('Model response did not include a usable summary.');
    }

    return normalized;
  }

  function applyAnalysisToItem(item, analysis, options) {
    const existingTags = Array.isArray(item.tags) ? item.tags : [];
    const mergedTags = uniqueStrings([...existingTags, ...analysis.tags, 'ai-processed']);
    item.tags = mergedTags;

    if (options.renameTitle && analysis.title) {
      item.name = analysis.title;
    }

    if (options.appendSummary || options.overwriteAnnotation) {
      const stamp = new Date().toISOString().slice(0, 10);
      const block = [
        `AI Summary (${stamp})`,
        analysis.summary,
      ].join('\n');

      if (options.overwriteAnnotation) {
        item.annotation = block;
      } else {
        const previous = String(item.annotation || '').trim();
        item.annotation = previous ? `${previous}\n\n${block}` : block;
      }
    }
  }

  function cleanTitle(value) {
    return String(value || '')
      .replace(/^#+\s*/g, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  function normalizeTags(tags) {
    if (!Array.isArray(tags)) {
      if (typeof tags === 'string' && tags.trim()) {
        tags = tags.split(',');
      } else {
        return [];
      }
    }
    return uniqueStrings(
      tags
        .map((tag) => String(tag || '').trim().toLowerCase())
        .map((tag) => tag.replace(/^#+/, ''))
        .filter(Boolean)
        .slice(0, 10)
    );
  }

  function uniqueStrings(values) {
    return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
  }

  function extractJsonObject(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Could not find JSON object in model response.');
    }
    return text.slice(start, end + 1);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(message, tone = 'info') {
    const colors = {
      info: { bg: '#eff6ff', text: '#1d4ed8' },
      success: { bg: '#ecfdf5', text: '#047857' },
      warn: { bg: '#fffbeb', text: '#b45309' },
      error: { bg: '#fef2f2', text: '#b91c1c' },
    };
    const color = colors[tone] || colors.info;
    el.status.textContent = message;
    el.status.style.background = color.bg;
    el.status.style.color = color.text;
  }
};
