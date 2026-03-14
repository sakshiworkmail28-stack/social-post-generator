require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Explicit root route ───────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── API keys & feature flags ──────────────────────────────────────────────────
const ANTHROPIC_KEY   = (process.env.ANTHROPIC_API_KEY || '').trim();
const HF_TOKEN        = (process.env.HF_TOKEN          || '').trim();
const RESEND_KEY      = (process.env.RESEND_API_KEY    || '').trim();
const RESEND_FROM_ENV = (process.env.RESEND_FROM       || '').trim();

if (!ANTHROPIC_KEY) {
  console.warn('⚠  ANTHROPIC_API_KEY is not set — post generation will fail until it is added.');
}

const anthropicConfigured = ANTHROPIC_KEY.length > 0;
const hfConfigured        = HF_TOKEN.length > 0 && !HF_TOKEN.startsWith('hf_your');
const emailConfigured     = RESEND_KEY.length > 0 && !RESEND_KEY.startsWith('re_your');

const RESEND_FROM = (RESEND_FROM_ENV && !RESEND_FROM_ENV.includes('yourdomain'))
  ? RESEND_FROM_ENV
  : 'Social Post Generator <onboarding@resend.dev>';

// ── Clients ───────────────────────────────────────────────────────────────────
const anthropic = anthropicConfigured
  ? new Anthropic({ apiKey: ANTHROPIC_KEY })
  : null;
const resend = new Resend(RESEND_KEY || 'placeholder');

console.log('\n✦ Social Post Generator');
console.log(`  Claude  : ${anthropicConfigured ? '✓ configured' : '✗ ANTHROPIC_API_KEY missing'}`);
console.log(`  Images  : ${hfConfigured        ? '✓ HuggingFace configured'  : '✗ HF_TOKEN missing — image posts disabled'}`);
console.log(`  Email   : ${emailConfigured     ? '✓ Resend configured'       : '✗ RESEND_API_KEY missing — email disabled'}`);

// ── HTML escape helper ────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Map dimension label → HF pixel sizes ─────────────────────────────────────
function getDimForHF(dimStr) {
  const match = dimStr.match(/(\d+)[×x](\d+)/);
  if (!match) return { w: 1024, h: 1024 };
  const ratio = parseInt(match[1]) / parseInt(match[2]);
  if (ratio >= 1.6)  return { w: 1024, h: 576  };
  if (ratio >= 0.95) return { w: 1024, h: 1024 };
  if (ratio >= 0.7)  return { w: 832,  h: 1024 };
  return                     { w: 576,  h: 1024 };
}

// ── Generate image via HuggingFace ────────────────────────────────────────────
async function generateImageHF(prompt, w, h) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  try {
    const resp = await fetch(
      'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
      {
        method:  'POST',
        signal:  controller.signal,
        headers: {
          Authorization:      `Bearer ${HF_TOKEN}`,
          'Content-Type':     'application/json',
          'x-wait-for-model': 'true',
        },
        body: JSON.stringify({
          inputs:     prompt,
          parameters: { width: w, height: h, num_inference_steps: 4, guidance_scale: 0 },
        }),
      }
    );

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`HF API ${resp.status} — ${body.slice(0, 200)}`);
    }

    const buf = await resp.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const ct  = resp.headers.get('content-type') || 'image/jpeg';
    return `data:${ct};base64,${b64}`;
  } finally {
    clearTimeout(timer);
  }
}

// ── Build HTML email ──────────────────────────────────────────────────────────
function buildEmailHtml({ posts, platform, dimension }) {
  const platformLabel = platform
    ? platform.charAt(0).toUpperCase() + platform.slice(1)
    : 'Social';

  const cards = posts.map((post, i) => {
    const tags = (post.hashtags || [])
      .map(h => `<span style="display:inline-block;background:#ede9fe;color:#5b21b6;border-radius:12px;padding:3px 10px;font-size:12px;margin:2px 3px 2px 0;">${esc(h)}</span>`)
      .join('');

    const imgHtml = post.image_url && !post.image_url.startsWith('data:')
      ? `<div style="margin:14px 0 10px;border-radius:10px;overflow:hidden;">
           <img src="${esc(post.image_url)}" alt="Generated image"
                style="width:100%;max-width:520px;height:auto;display:block;border-radius:10px;" />
         </div>`
      : post.image_url
        ? `<div style="background:#f8f5ff;border:1px dashed #c4b5fd;border-radius:8px;
                       padding:10px 14px;margin:14px 0 10px;font-size:12px;color:#6d28d9;">
             🖼 AI image generated — view and download it in the web app.
           </div>`
        : '';

    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;
                  padding:20px 22px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <span style="background:linear-gradient(135deg,#6c63ff,#8b5cf6);color:#fff;
                       border-radius:50%;width:26px;height:26px;display:inline-flex;
                       align-items:center;justify-content:center;font-size:12px;
                       font-weight:700;flex-shrink:0;">${i + 1}</span>
          <span style="font-weight:600;color:#4a5568;font-size:13px;">Post ${i + 1}</span>
          <span style="font-size:11px;font-weight:600;background:#e8f4ff;color:#2563eb;
                       border-radius:10px;padding:2px 9px;">${esc(platformLabel)}</span>
        </div>
        ${imgHtml}
        <p style="color:#1a202c;font-size:15px;line-height:1.65;margin:0 0 14px;
                  white-space:pre-wrap;">${esc(post.post_text)}</p>
        <div>${tags}</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f9;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto 48px;background:#fff;border-radius:18px;
              overflow:hidden;box-shadow:0 4px 28px rgba(0,0,0,.09);">
    <div style="background:linear-gradient(135deg,#6c63ff 0%,#8b5cf6 100%);padding:30px 32px;">
      <h1 style="color:#fff;margin:0 0 6px;font-size:22px;font-weight:700;">✦ Your Social Posts Are Ready</h1>
      <p style="color:rgba(255,255,255,.85);margin:0;font-size:13px;">
        ${posts.length} ${esc(platformLabel)} post${posts.length > 1 ? 's' : ''}
        ${dimension ? ` &nbsp;·&nbsp; ${esc(dimension)}` : ''}
      </p>
    </div>
    <div style="padding:26px 32px 32px;">
      ${cards}
      <p style="color:#a0aec0;font-size:11px;text-align:center;margin:24px 0 0;">
        Generated by Social Post Generator
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── GET /api/status ───────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json({
    claude: anthropicConfigured ? 'configured' : 'missing — set ANTHROPIC_API_KEY',
    images: hfConfigured        ? 'configured' : 'missing — set HF_TOKEN',
    email:  emailConfigured     ? 'configured' : 'missing — set RESEND_API_KEY',
  });
});

// ── POST /api/generate ────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  if (!anthropicConfigured) {
    return res.status(503).json({ error: 'Server not configured: ANTHROPIC_API_KEY is missing.' });
  }

  const {
    idea, email, platform, dimension,
    postType, textLength, charLimit, tone, numPosts,
  } = req.body;

  if (!idea?.trim())  return res.status(400).json({ error: 'Idea is required.' });
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });
  if (!platform)      return res.status(400).json({ error: 'Platform is required.' });

  const count = Math.min(Math.max(parseInt(numPosts) || 3, 1), 5);
  const limit = Math.min(Math.max(parseInt(charLimit) || 280, 50), 63206);

  const lengthMap   = { short: '1–2 sentences', medium: '3–4 sentences', long: '5–7 sentences' };
  const lengthDesc  = lengthMap[textLength] || '3–4 sentences';
  const platformCap = platform.charAt(0).toUpperCase() + platform.slice(1);

  const imageInstruction = postType === 'image'
    ? 'Each post MUST include a detailed image_description — a vivid AI image-generator prompt describing subject, style, lighting, mood, colors, and composition.'
    : 'Set image_description to an empty string "".';

  const systemPrompt =
    'You are an expert social media copywriter. Respond ONLY with valid JSON — no markdown, no code fences, no extra text.';

  const userPrompt = `Generate ${count} unique ${platformCap} social media post${count > 1 ? 's' : ''}.

BRIEF:
- Topic: ${idea.trim()}
- Platform: ${platformCap}
- Dimension: ${dimension}
- Post type: ${postType === 'image' ? 'Image post' : 'Text post'}
- Tone: ${tone}
- Text length: ${lengthDesc}
- Character limit: ${limit} chars (post_text only, not hashtags)
${imageInstruction}

Return a JSON array of exactly ${count} objects:
[{ "post_number": 1, "post_text": "...", "hashtags": ["#tag1"], "image_description": "..." }]

Rules:
- post_text ≤ ${limit} characters
- 3–6 hashtags per post
- Each post must have a distinct angle or hook
- Tone: ${tone}`;

  // 1. Generate post text via Claude
  let posts;
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 2048,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const raw   = msg.content.find(b => b.type === 'text')?.text || '';
    const match = raw.match(/\[[\s\S]*\]/);
    posts = JSON.parse(match ? match[0] : raw);
    if (!Array.isArray(posts)) throw new Error('Response was not a JSON array');
  } catch (err) {
    console.error('Claude error:', err.message);
    return res.status(502).json({ error: 'Failed to generate posts. Please try again.' });
  }

  // 2. Generate images via HuggingFace (parallel, server-side)
  if (postType === 'image') {
    if (!hfConfigured) {
      posts.forEach(p => { p.image_url = null; p.image_error = 'HF_TOKEN not configured'; });
    } else {
      const { w, h } = getDimForHF(dimension);
      await Promise.all(posts.map(async post => {
        const desc = (post.image_description || post.post_text || '').trim();
        if (!desc) return;
        try {
          post.image_url = await generateImageHF(desc, w, h);
        } catch (err) {
          console.error(`Image failed for post ${post.post_number}:`, err.message);
          post.image_url   = null;
          post.image_error = 'Image generation failed — try again';
        }
      }));
    }
  }

  // 3. Send email via Resend
  let emailStatus = 'skipped';

  if (emailConfigured) {
    try {
      const subject  = `Your ${posts.length} ${platformCap} Post${posts.length > 1 ? 's' : ''} — Social Post Generator`;
      const textBody = posts.map((p, i) => {
        const tags = (p.hashtags || []).join(' ');
        return `POST ${i + 1}\n${'─'.repeat(40)}\n${p.post_text}\n\n${tags}`;
      }).join('\n\n') + '\n\n— Social Post Generator';

      const { error } = await resend.emails.send({
        from:    RESEND_FROM,
        to:      [email.trim()],
        subject,
        text:    textBody,
        html:    buildEmailHtml({ posts, platform, dimension }),
      });

      if (error) throw new Error(JSON.stringify(error));

      emailStatus = 'sent';
      console.log(`✉  Email sent → ${email}`);
    } catch (err) {
      console.error('✗  Email error:', err.message);
      emailStatus = 'failed';
    }
  }

  res.json({ posts, emailStatus });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`  Server running on port ${PORT}\n`);
});
