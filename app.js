// ── 기본 데이터 ──────────────────────────────────────────
const DEFAULT_COMMON = "1:1비율 이미지로 한국 화장품 연출 이미지 제작, 제품 이미지는 최대한 손상없이, 결과 이미지는 가로/세로 비율 1:1로 잘라줘";

const DEFAULT_PROMPTS_TEXT = [
  { title: "욕실 배경", img: "img/1.png", text: "A high-resolution, square-aspect (1:1 ratio) professional product photograph in a clean and simple minimalist style. A sleek, matte white tube with clean blue-black text reading 'CLEANSING FOAM' and 'DEEP PORE MOISTURE', and volume details at the bottom. The product stands centered on a refined Carrara marble bathroom counter. The background is a gently blurred, pristine bathroom or vanity interior, with soft natural daylight illuminating from the side. The overall composition is premium and pristine." },
  { title: "세럼 대리석", img: "img/2.png", text: "A delicate female hand gently holding a luxury skincare serum bottle, resting on a clean white marble surface, pristine and minimal, soft morning sunlight, natural shadow, product showcase, clean aesthetic, empty space, 85mm lens, masterpiece, ultra-detailed" },
  { title: "유리 항아리", img: "img/3.png", text: "A premium cosmetic glass jar with a sleek minimalist design, placed on an exposed textured grey marble surface. Clean neutral background, soft studio lighting with gentle highlights, sophisticated, elegant, modern luxury skincare vibe, commercial macro photography, hyper-detailed, 8k, --ar 1:1 --style raw --v 6.0" },
  { title: "미니멀 스킨케어", img: "img/4.png", text: "A minimalist cosmetic skincare bottle with a blank white label, resting on a clean white marble block with subtle grey veins. Soft natural sunlight filtering through a window, creating elegant and soft shadows. Bright and airy atmosphere, simple, luxurious, high-end commercial product photography, empty space for text, photorealistic, 8k, --ar 1:1 --style raw --v 6.0" },
  { title: "허브 잎", img: "img/5.png", text: "Create a natural and soothing skincare scene using the provided product image. Place the product on a clean surface with soft natural elements like leaves, herbs. Use warm natural lighting and a calm, minimal background. Emphasize gentle, safe, and dermatological skincare feeling." },
];

// ── 상태 ─────────────────────────────────────────────────
let promptList = [];
let nextId = 1;
let uploadedFile = null;
let currentModel = 'gemini-2.5-flash-image';
const resultImages = new Map();

// ── 유틸 ─────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── 상태 메시지 ───────────────────────────────────────────
function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.innerHTML = msg;
  el.className = isError ? 'error' : '';
}

// ── 버튼 상태 ─────────────────────────────────────────────
function updateBtn() {
  const hasKey = document.getElementById('api-key').value.trim().length > 0;
  const checkedCount = promptList.filter(p => p.checked).length;
  const btn = document.getElementById('generate-btn');
  const ok = hasKey && uploadedFile && checkedCount > 0;
  btn.disabled = !ok;
  btn.textContent = ok ? `설정샷 생성하기 (${checkedCount}장)` : '설정샷 생성하기';
}

// ── 프롬프트 저장/불러오기 ────────────────────────────────
const PROMPTS_VERSION = 2;

function savePrompts() {
  localStorage.setItem('mj_prompts', JSON.stringify({ v: PROMPTS_VERSION, list: promptList, nextId }));
  localStorage.setItem('mj_common_prompt', document.getElementById('common-prompt').value);
}

function loadPrompts() {
  // 공통 프롬프트를 먼저 설정해야 savePrompts() 호출 시 빈 값으로 덮어쓰지 않음
  const savedCommon = localStorage.getItem('mj_common_prompt');
  document.getElementById('common-prompt').value = savedCommon || DEFAULT_COMMON;

  const saved = localStorage.getItem('mj_prompts');
  if (saved) {
    const data = JSON.parse(saved);
    promptList = data.list.map(p => ({ title: '', img: '', ...p }));
    nextId = data.nextId;
    let added = false;
    DEFAULT_PROMPTS_TEXT.forEach(def => {
      const existing = promptList.find(p => p.text === def.text);
      if (!existing) {
        promptList.push({ id: nextId++, title: def.title ?? '', img: def.img ?? '', text: def.text, checked: true });
        added = true;
      } else if (!existing.img && def.img) {
        existing.img = def.img;
        added = true;
      }
    });
    if (added) savePrompts();
  } else {
    promptList = DEFAULT_PROMPTS_TEXT.map((p, i) => ({
      id: i + 1, title: p.title ?? '', img: p.img ?? '', text: p.text, checked: true,
    }));
    nextId = DEFAULT_PROMPTS_TEXT.length + 1;
  }
}

// ── 프롬프트 렌더링 ───────────────────────────────────────
function renderPromptList() {
  const el = document.getElementById('prompt-list');
  if (promptList.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:#aaa;text-align:center;padding:16px 0">프롬프트가 없습니다</div>';
    updateBtn();
    return;
  }
  el.innerHTML = promptList.map(p => `
    <div class="prompt-item" id="pi-${p.id}">
      <input type="checkbox" class="prompt-cb" ${p.checked ? 'checked' : ''}
        onchange="togglePrompt(${p.id})" />
      ${p.img
        ? `<img class="prompt-thumb" src="${escHtml(p.img)}" alt="" onclick="openLightbox('${escHtml(p.img)}')" />`
        : `<div class="prompt-thumb-empty" onclick="pickThumb(${p.id})" title="이미지 등록">+</div>`
      }
      <span class="prompt-text collapsed" onclick="toggleExpand(this)">${p.title ? `<b class="prompt-title" onclick="event.stopPropagation();togglePrompt(${p.id})">${escHtml(p.title)}</b><br>${escHtml(p.text)}` : escHtml(p.text)}</span>
      <div class="prompt-actions">
        <button onclick="startEdit(${p.id})">수정</button>
        <button class="del" onclick="deletePrompt(${p.id})">삭제</button>
      </div>
    </div>
  `).join('');
  updateBtn();
}

function toggleExpand(el) {
  el.classList.toggle('collapsed');
}

// ── 프롬프트 조작 ─────────────────────────────────────────
function togglePrompt(id) {
  const p = promptList.find(p => p.id === id);
  if (p) {
    p.checked = !p.checked;
    const cb = document.querySelector(`#pi-${id} .prompt-cb`);
    if (cb) cb.checked = p.checked;
  }
  savePrompts();
  updateBtn();
}

function toggleSelectAll() {
  const anyUnchecked = promptList.some(p => !p.checked);
  promptList.forEach(p => p.checked = anyUnchecked);
  savePrompts();
  renderPromptList();
}

function deletePrompt(id) {
  promptList = promptList.filter(p => p.id !== id);
  savePrompts();
  renderPromptList();
}

function addPrompt() {
  const titleInput = document.getElementById('new-prompt-title');
  const input = document.getElementById('new-prompt-input');
  const title = titleInput.value.trim();
  const text = input.value.trim();
  if (!text) return;
  promptList.push({ id: nextId++, title, text, checked: true });
  titleInput.value = '';
  input.value = '';
  savePrompts();
  renderPromptList();
}

function startEdit(id) {
  const p = promptList.find(p => p.id === id);
  if (!p) return;
  const item = document.getElementById(`pi-${id}`);
  item.innerHTML = `
    <input type="checkbox" class="prompt-cb" ${p.checked ? 'checked' : ''} disabled />
    <div class="prompt-edit-fields">
      <input type="text" class="prompt-edit-title" placeholder="제목 (선택)" value="${escHtml(p.title ?? '')}" />
      <textarea class="prompt-edit-area">${escHtml(p.text)}</textarea>
    </div>
    <div class="prompt-actions">
      <button class="save" onclick="saveEdit(${id})">저장</button>
      <button onclick="renderPromptList()">취소</button>
    </div>
  `;
}

function saveEdit(id) {
  const p = promptList.find(p => p.id === id);
  if (!p) return;
  const titleEl = document.querySelector(`#pi-${id} .prompt-edit-title`);
  const ta = document.querySelector(`#pi-${id} .prompt-edit-area`);
  const text = ta.value.trim();
  if (!text) return;
  p.title = titleEl ? titleEl.value.trim() : '';
  p.text = text;
  savePrompts();
  renderPromptList();
}

// ── 썸네일 ────────────────────────────────────────────────
function pickThumb(promptId) {
  const input = document.getElementById('thumb-file-input');
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const p = promptList.find(p => p.id === promptId);
      if (!p) return;
      p.img = ev.target.result;
      savePrompts();
      renderPromptList();
    };
    reader.readAsDataURL(file);
    input.value = '';
  };
  input.click();
}

// ── 라이트박스 ────────────────────────────────────────────
function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

// ── 이미지 업로드 ─────────────────────────────────────────
function loadFile(file) {
  uploadedFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('preview-img').src = ev.target.result;
    document.getElementById('preview-wrap').style.display = 'block';
    document.getElementById('dropzone').style.display = 'none';
    updateBtn();
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  uploadedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('preview-wrap').style.display = 'none';
  document.getElementById('dropzone').style.display = 'block';
  updateBtn();
}

// ── API Key ───────────────────────────────────────────────
function saveKey() {
  const key = document.getElementById('api-key').value.trim();
  if (!key) return;
  localStorage.setItem('mj_api_key', key);
  setStatus('API 키가 저장되었습니다.');
  updateBtn();
}

// ── 모델 ─────────────────────────────────────────────────
async function loadModels() {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) { setStatus('먼저 API 키를 입력해주세요.', true); return; }
  const btn = document.getElementById('check-models-btn');
  btn.textContent = '불러오는 중...'; btn.disabled = true;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'API 오류');
    const allModels = (data.models || []).filter(m => {
      const id = m.name.replace('models/', '');
      return (m.supportedGenerationMethods || []).includes('generateContent') &&
             (id.includes('image') || id.includes('imagen'));
    });
    const listEl = document.getElementById('model-list');
    listEl.style.display = 'block';
    if (allModels.length === 0) {
      listEl.innerHTML = '<div style="color:#888;padding:8px 0">사용 가능한 이미지 생성 모델이 없습니다.</div>';
    } else {
      listEl.innerHTML = allModels.map(m => {
        const id = m.name.replace('models/', '');
        const displayName = m.displayName || '';
        return `<div class="model-item" onclick="selectModel('${id}')">
          <span class="model-id">${id}</span>
          ${displayName ? `<span style="font-size:11px;color:#888">(${displayName})</span>` : ''}
          <span class="select-tag" style="background:#e8f5e9;color:#2e7d32">이미지</span>
        </div>`;
      }).join('');
    }
  } catch(e) {
    setStatus('모델 목록 오류: ' + e.message, true);
  } finally {
    btn.textContent = '새로고침'; btn.disabled = false;
  }
}

function selectModel(modelId) {
  currentModel = modelId;
  document.getElementById('current-model-name').textContent = modelId;
  document.getElementById('model-list').style.display = 'none';
  document.getElementById('check-models-btn').textContent = '사용 가능한 모델 목록 불러오기';
  setStatus(`모델 선택됨: ${modelId}`);
}

// ── Gemini API ────────────────────────────────────────────
async function callGemini(apiKey, prompt, base64, mimeType) {
  const body = {
    contents: [{ parts: [
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: base64 } }
    ]}],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p =>
    p.inlineData?.mimeType?.startsWith('image/') ||
    p.inline_data?.mime_type?.startsWith('image/')
  );
  if (!imgPart) {
    const reason = data.candidates?.[0]?.finishReason || '';
    const textPart = parts.find(p => p.text);
    throw new Error(
      `이미지 없음` +
      (reason ? ` (${reason})` : '') +
      (textPart?.text ? `: ${textPart.text.slice(0, 100)}` : '')
    );
  }
  const inlineData = imgPart.inlineData || imgPart.inline_data;
  return `data:${inlineData.mimeType || inlineData.mime_type};base64,${inlineData.data}`;
}

// ── 이미지 생성 ───────────────────────────────────────────
async function generate() {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey || !uploadedFile) return;

  const selected = promptList.filter(p => p.checked);
  if (selected.length === 0) return;

  const commonPrompt = document.getElementById('common-prompt').value.trim();
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  resultImages.clear();
  updateBatchBtnVisibility();

  const grid = document.getElementById('result-grid');
  grid.className = 'result-grid' + (selected.length === 1 ? ' single' : '');
  grid.innerHTML = selected.map((p, i) => `
    <div class="result-item" id="slot-${i}">
      <div class="generating"><span class="spinner"></span> 생성 중...</div>
      <div class="prompt-label">${escHtml(p.text.slice(0, 40))}${p.text.length > 40 ? '…' : ''}</div>
    </div>
  `).join('');
  document.getElementById('result-wrap').style.display = 'block';
  const ph = document.getElementById('result-placeholder');
  if (ph) ph.style.display = 'none';
  setStatus(`<span class="spinner"></span> 이미지 ${selected.length}장 생성 중...`);

  const base64 = await fileToBase64(uploadedFile);
  const mimeType = uploadedFile.type;

  let doneCount = 0;
  const results = await Promise.allSettled(
    selected.map((p, i) => {
      const fullPrompt = commonPrompt ? p.text + '\n' + commonPrompt : p.text;
      return callGemini(apiKey, fullPrompt, base64, mimeType)
        .then(imgSrc => {
          resultImages.set(i, imgSrc);
          document.getElementById(`slot-${i}`).innerHTML = `
            <img src="${imgSrc}" alt="결과 ${i+1}" onclick="openResultLightbox(${i})" style="cursor:zoom-in" />
            <div class="prompt-label">${p.title ? escHtml(p.title) : (escHtml(p.text.slice(0, 40)) + (p.text.length > 40 ? '…' : ''))}</div>
            <button class="dl-btn" onclick="downloadImage(${i}, ${i+1})">다운로드</button>
          `;
          doneCount++;
          setStatus(`<span class="spinner"></span> ${doneCount} / ${selected.length} 완료...`);
          updateBatchBtnVisibility();
        })
        .catch(err => {
          document.getElementById(`slot-${i}`).innerHTML = `
            <div class="gen-error">오류: ${escHtml(err.message)}</div>
            <div class="prompt-label">${p.title ? escHtml(p.title) : (escHtml(p.text.slice(0, 40)) + (p.text.length > 40 ? '…' : ''))}</div>
          `;
          doneCount++;
          setStatus(`<span class="spinner"></span> ${doneCount} / ${selected.length} 완료...`);
          throw err;
        });
    })
  );

  const successCount = results.filter(r => r.status === 'fulfilled').length;
  setStatus(
    successCount === selected.length
      ? `✓ ${successCount}장 모두 생성 완료!`
      : `✓ ${successCount}장 완료 (${selected.length - successCount}장 실패)`,
    successCount === 0
  );
  btn.disabled = false;
  updateBtn();
}

// ── 결과 이미지 다운로드/열기 ─────────────────────────────
function openResultLightbox(slotIndex) {
  const src = resultImages.get(slotIndex);
  if (!src) return;
  openLightbox(src);
}

function downloadImage(slotIndex, label) {
  const src = resultImages.get(slotIndex);
  if (!src) return;
  const a = document.createElement('a');
  a.href = src;
  a.download = `mjimage_${Date.now()}_${label}.png`;
  a.click();
}

// ── 일괄 다운로드 ─────────────────────────────────────────
function updateBatchBtnVisibility() {
  const btn = document.getElementById('batch-download-btn');
  if (!btn) return;
  btn.style.display = resultImages.size > 0 ? 'inline-block' : 'none';
  btn.textContent = resultImages.size > 1
    ? `전체 다운로드 (${resultImages.size}장)`
    : '전체 다운로드';
}

async function batchDownloadAll() {
  if (resultImages.size === 0) return;
  const btn = document.getElementById('batch-download-btn');
  const originalText = btn.textContent;
  btn.disabled = true;

  // slotIndex 순서대로 정렬 후 순차 다운로드
  const entries = Array.from(resultImages.entries()).sort((a, b) => a[0] - b[0]);
  const ts = Date.now();
  for (let k = 0; k < entries.length; k++) {
    const [slotIndex, src] = entries[k];
    const a = document.createElement('a');
    a.href = src;
    a.download = `mjimage_${ts}_${slotIndex + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    btn.textContent = `다운로드 중... ${k + 1}/${entries.length}`;
    // 브라우저의 연속 다운로드 차단 방지용 지연
    if (k < entries.length - 1) {
      await new Promise(r => setTimeout(r, 350));
    }
  }

  btn.textContent = originalText;
  btn.disabled = false;
}

// ── 초기화 ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const savedKey = localStorage.getItem('mj_api_key');
  if (savedKey) document.getElementById('api-key').value = savedKey;

  loadPrompts();
  renderPromptList();
  updateBtn();

  // 드래그 앤 드롭
  const dz = document.getElementById('dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) loadFile(f);
  });

  document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  });

  document.getElementById('api-key').addEventListener('input', updateBtn);

  document.getElementById('new-prompt-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addPrompt();
  });

  document.getElementById('common-prompt').addEventListener('input', savePrompts);

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
});
