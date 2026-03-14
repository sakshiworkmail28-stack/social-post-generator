/* ── State ───────────────────────────────────────────────────────────────── */
let platform = 'facebook';
let postType = 'text';

const FB_DIMS = [
  'Feed (1200×628)',
  'Story (1080×1920)',
  'Square (1080×1080)',
  'Cover Photo (851×315)',
  'Event Banner (1920×1005)',
];
const IG_DIMS = [
  'Square (1080×1080)',
  'Portrait (1080×1350)',
  'Landscape (1080×566)',
  'Story / Reel (1080×1920)',
];

/* ── Platform / post-type toggles ────────────────────────────────────────── */
function selectPlatform(btn) {
  platform = btn.dataset.value;
  document.getElementById('platform').value = platform;
  document.querySelectorAll('#platformGroup .toggle-btn')
    .forEach(b => b.classList.remove('active-fb', 'active-ig'));
  btn.classList.add(platform === 'facebook' ? 'active-fb' : 'active-ig');
  const sel = document.getElementById('dimension');
  sel.innerHTML = (platform === 'facebook' ? FB_DIMS : IG_DIMS)
    .map(d => `<option value="${d}">${d}</option>`).join('');
}

function selectPostType(btn) {
  postType = btn.dataset.value;
  document.getElementById('postType').value = postType;
  document.querySelectorAll('#postTypeGroup .toggle-btn')
    .forEach(b => b.classList.remove('active-accent'));
  btn.classList.add('active-accent');
  document.getElementById('imageNote').style.display =
    postType === 'image' ? 'block' : 'none';
}

/* ── Utilities ───────────────────────────────────────────────────────────── */
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function charClass(count, limit) {
  if (count > limit)       return 'char-over';
  if (count / limit > 0.9) return 'char-warn';
  return 'char-ok';
}

function showError(msg) {
  const el = document.getElementById('errorBox');
  el.textContent = msg;
  el.hidden = false;
}
function clearError() {
  document.getElementById('errorBox').hidden = true;
}

/* ── Text overlay controls ───────────────────────────────────────────────── */
function updateOverlay(idx, prop, val) {
  const overlay = document.getElementById(`overlay${idx}`);
  if (!overlay) return;

  if (prop === 'size') {
    overlay.style.fontSize = val + 'px';
    const el = document.getElementById(`sizeVal${idx}`);
    if (el) el.textContent = val + 'px';

  } else if (prop === 'color') {
    overlay.style.color = val;

  } else if (prop === 'pos') {
    overlay.dataset.pos    = val;
    overlay.style.top      = val === 'top'    ? '0'     : val === 'center' ? '50%' : 'auto';
    overlay.style.bottom   = val === 'bottom' ? '0'     : 'auto';
    overlay.style.transform = val === 'center' ? 'translateY(-50%)' : '';

    // Sync active button state
    const card = overlay.closest('.post-card-body');
    if (card) {
      card.querySelectorAll('.pos-btn').forEach(b =>
        b.classList.toggle('active-pos', b.dataset.pos === val)
      );
    }
  }
}

/* ── Download image only (no text) ──────────────────────────────────────── */
function downloadImg(idx) {
  const post = (window._generatedPosts || [])[idx];
  if (!post?.image_url) return;
  const a = document.createElement('a');
  a.href     = post.image_url;
  a.download = `post-image-${idx + 1}.png`;
  a.click();
}

/* ── Download composited image (image + text baked in via Canvas) ────────── */
function downloadComposite(idx) {
  const post    = (window._generatedPosts || [])[idx];
  const overlay = document.getElementById(`overlay${idx}`);
  const imgEl   = document.getElementById(`postImg${idx}`);
  if (!post?.image_url || !overlay || !imgEl) return;

  const canvas  = document.createElement('canvas');
  canvas.width  = imgEl.naturalWidth  || 1024;
  canvas.height = imgEl.naturalHeight || 1024;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);

  // Scale factors from display size to natural resolution
  const scaleX = canvas.width  / (imgEl.offsetWidth  || canvas.width);
  const scaleY = canvas.height / (imgEl.offsetHeight || canvas.height);
  const scale  = Math.max(scaleX, scaleY);

  const fontSize = parseFloat(overlay.style.fontSize) || 22;
  const color    = overlay.style.color  || '#ffffff';
  const pos      = overlay.dataset.pos  || 'bottom';
  const text     = post.post_text || '';

  const scaledFont = Math.round(fontSize * scale);
  ctx.font      = `bold ${scaledFont}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign = 'center';

  // Word-wrap text to fit canvas width
  const maxW  = canvas.width * 0.88;
  const lineH = scaledFont * 1.45;
  const words = text.split(' ');
  const lines = [];
  let cur = '';

  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  const pad   = scaledFont * 0.75;
  const bgH   = lines.length * lineH + pad * 2;
  const bgY   = pos === 'top'    ? 0
               : pos === 'center' ? (canvas.height - bgH) / 2
               :                    canvas.height - bgH;

  // Semi-transparent background strip
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, bgY, canvas.width, bgH);

  // Text lines
  ctx.fillStyle = color;
  let ty = bgY + pad + scaledFont * 0.85;
  for (const line of lines) {
    ctx.fillText(line, canvas.width / 2, ty);
    ty += lineH;
  }

  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `social-post-${idx + 1}.jpg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/jpeg', 0.92);
}

/* ── Copy post text to clipboard ─────────────────────────────────────────── */
function copyPost(btn, idx) {
  const post = (window._generatedPosts || [])[idx];
  if (!post) return;
  const tags = (post.hashtags || []).join(' ');
  const text = post.post_text + (tags ? '\n\n' + tags : '');
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1800);
  });
}

/* ── Render results ──────────────────────────────────────────────────────── */
function renderResults(posts, emailStatus, dimension, charLimit) {
  const container    = document.getElementById('postsContainer');
  const resultsEl    = document.getElementById('results');
  const badgeClass   = platform === 'facebook' ? 'badge-fb' : 'badge-ig';
  const platformName = platform === 'facebook' ? 'Facebook' : 'Instagram';

  document.getElementById('resultsTitle').textContent = 'Generated Posts';
  document.getElementById('resultsMeta').textContent  =
    `${posts.length} post${posts.length > 1 ? 's' : ''}`;

  const toastMap = {
    sent:    { cls: 'sent',   icon: '✅', msg: 'Posts emailed successfully!' },
    failed:  { cls: 'failed', icon: '⚠️', msg: 'Email failed — check RESEND_API_KEY in .env.' },
    skipped: { cls: 'skip',   icon: 'ℹ️', msg: 'Email not configured — add RESEND_API_KEY to .env.' },
  };
  const toast = toastMap[emailStatus] || toastMap.skipped;

  let html = `
    <div class="email-toast ${toast.cls}">
      <span>${toast.icon}</span><span>${toast.msg}</span>
    </div>`;

  posts.forEach((post, i) => {
    const text     = post.post_text || '';
    const hashtags = Array.isArray(post.hashtags) ? post.hashtags : [];
    const count    = text.length;
    const cls      = charClass(count, charLimit);
    const overMsg  = count > charLimit ? ` — ${count - charLimit} over limit` : '';

    const tagHtml = hashtags.length
      ? `<div class="hashtags">${hashtags.map(h => `<span class="hashtag">${escHtml(h)}</span>`).join('')}</div>`
      : '';

    let mediaHtml = '';

    if (postType === 'image') {
      if (post.image_url) {
        // ── Image with live text overlay ──────────────────────────────────
        mediaHtml = `
          <div class="post-image-wrap">
            <div class="post-image-container" id="imgContainer${i}">
              <img class="generated-img" src="${post.image_url}"
                   id="postImg${i}" alt="Generated post image" />
              <div class="text-overlay" id="overlay${i}" data-pos="bottom">
                ${escHtml(text)}
              </div>
            </div>

            <div class="overlay-controls">
              <div class="control-group">
                <span class="control-label">Size</span>
                <input type="range" class="size-slider" min="12" max="60" value="22"
                       oninput="updateOverlay(${i},'size',this.value)" />
                <span class="size-val" id="sizeVal${i}">22px</span>
              </div>
              <div class="control-group">
                <span class="control-label">Position</span>
                <div class="pos-btn-group">
                  <button class="pos-btn" data-pos="top"    onclick="updateOverlay(${i},'pos','top')">Top</button>
                  <button class="pos-btn" data-pos="center" onclick="updateOverlay(${i},'pos','center')">Center</button>
                  <button class="pos-btn active-pos" data-pos="bottom" onclick="updateOverlay(${i},'pos','bottom')">Bottom</button>
                </div>
              </div>
              <div class="control-group">
                <span class="control-label">Color</span>
                <input type="color" class="color-picker" value="#ffffff"
                       oninput="updateOverlay(${i},'color',this.value)" />
              </div>
            </div>

            <div class="img-action-bar">
              <button class="btn-img-action" onclick="downloadComposite(${i})">⬇ Download with text</button>
              <button class="btn-img-action" onclick="downloadImg(${i})">⬇ Image only</button>
            </div>
          </div>`;

      } else {
        // ── Image generation failed or not configured ─────────────────────
        const msg = post.image_error || 'Image generation not configured.';
        mediaHtml = `
          <div class="post-image-wrap">
            <div class="img-error-state">⚠️ ${escHtml(msg)}</div>
          </div>`;
      }
    } else {
      // ── Text post — show dimension preview ────────────────────────────────
      const match = dimension.match(/(\d+)[×x](\d+)/);
      if (match) {
        const ow = parseInt(match[1]), oh = parseInt(match[2]);
        const mx = 50;
        let bw, bh;
        if (ow >= oh) { bw = mx; bh = Math.round(oh / ow * mx); }
        else          { bh = mx; bw = Math.round(ow / oh * mx); }
        mediaHtml = `
          <div class="dim-preview">
            <div class="dim-box" style="width:${bw}px;height:${bh}px;">${ow}×${oh}</div>
            <span class="dim-label">${escHtml(dimension)}</span>
          </div>`;
      }
    }

    html += `
      <div class="post-card">
        <div class="post-card-header">
          <div class="post-card-meta">
            <div class="post-num">${i + 1}</div>
            <span class="post-label">Post ${i + 1}</span>
            <span class="platform-badge ${badgeClass}">${platformName}</span>
          </div>
          <div class="post-card-actions">
            <button class="btn-sm" onclick="copyPost(this,${i})">Copy</button>
          </div>
        </div>
        <div class="post-card-body">
          ${mediaHtml}
          <p class="post-text">${escHtml(text)}</p>
          ${tagHtml}
        </div>
        <div class="post-card-footer">
          <span class="char-count ${cls}">
            <strong>${count}</strong> / ${charLimit} chars${overMsg}
          </span>
        </div>
      </div>`;
  });

  container.innerHTML = html;
  resultsEl.hidden = false;
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Main generate ───────────────────────────────────────────────────────── */
async function generate() {
  clearError();

  const idea      = document.getElementById('idea').value.trim();
  const email     = document.getElementById('email').value.trim();
  const dimension = document.getElementById('dimension').value;
  const numPosts  = document.getElementById('numPosts').value;
  const tone      = document.getElementById('tone').value;
  const textLen   = document.getElementById('textLength').value;
  const charLimit = parseInt(document.getElementById('charLimit').value);

  if (!idea)                              return showError('Please enter your idea or topic.');
  if (!email || !email.includes('@'))     return showError('Please enter a valid email address.');
  if (isNaN(charLimit) || charLimit < 10) return showError('Please enter a valid character limit.');

  const btn = document.getElementById('generateBtn');
  btn.disabled  = true;
  btn.innerHTML = postType === 'image'
    ? '<span class="spinner"></span>Generating posts &amp; images…'
    : '<span class="spinner"></span>Generating posts…';
  document.getElementById('results').hidden = true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);

  try {
    const res = await fetch('/api/generate', {
      method:  'POST',
      signal:  controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idea, email, platform, dimension,
        postType, numPosts, tone,
        textLength: textLen, charLimit,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

    window._generatedPosts = data.posts;
    renderResults(data.posts, data.emailStatus, dimension, charLimit);

  } catch (err) {
    showError(err.name === 'AbortError'
      ? 'Request timed out. Image generation can take up to 60s — please try again.'
      : 'Error: ' + err.message
    );
  } finally {
    clearTimeout(timer);
    btn.disabled  = false;
    btn.innerHTML = 'Generate Posts';
  }
}
