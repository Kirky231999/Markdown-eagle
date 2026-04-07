# Markdown AI V1 for Power Eagle

A lightweight Power Eagle plugin that reads selected Markdown files in Eagle, sends the text to a local OpenAI-compatible endpoint such as LM Studio, then writes back:

- a cleaned title
- a short summary
- useful tags
- an `ai-processed` tag

## Files

- `plugin.json`
- `main.js`

## What it does

1. Reads the selected Eagle items
2. Filters for `.md` and `.markdown`
3. Reads the actual file text from `item.filePath`
4. Sends the text to a local model endpoint
5. Expects strict JSON back with:
   - `title`
   - `summary`
   - `tags`
6. Saves the result back into Eagle by updating:
   - `item.name`
   - `item.annotation`
   - `item.tags`

## Default endpoint

The default endpoint is:

`http://127.0.0.1:1234/v1/chat/completions`

That matches a common LM Studio local server setup.

## Expected model behavior

The plugin sends a JSON-mode request and expects a response shaped like:

```json
{
  "title": "clean short title",
  "summary": "2 to 4 sentence summary.",
  "tags": ["tag-one", "tag-two", "tag-three"]
}
```

## Install with Power Eagle

1. Put `plugin.json` and `main.js` into one folder
2. Zip the folder
3. Host the zip somewhere public
4. In Power Eagle, install from the hosted zip URL

## Use

1. Select one or more Markdown files in Eagle
2. Open the plugin
3. Confirm endpoint and model name
4. Click **Analyze selected Markdown**
5. Review the output panel
6. The plugin saves the changes back into Eagle automatically

## Current limits

- This V1 is meant for Markdown only
- It reads at most the configured max character count per file
- It assumes your endpoint is OpenAI-compatible
- It has not been runtime-tested in your exact Eagle + Power Eagle environment yet

## Good next upgrades

- frontmatter-aware processing
- chunking for long notes
- preset modes like paper, meeting-notes, literature-note
- manual review before save
- PDF text path
