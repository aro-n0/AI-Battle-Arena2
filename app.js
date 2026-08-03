// app.js の一番上
const appState = {
  characters: [],
  playerName: 'プレイヤー1',

};
// アプリ全般の状態管理
let localPlayerName = localStorage.getItem('ai_arena_player_name') || '';
let globalSharedCharacters = [];
let selectedSkillData = null;
let selectedEditSkillData = null;

document.addEventListener('DOMContentLoaded', () => {
  // 名前入力モーダルチェック
  if (!localPlayerName) {
    document.getElementById('start-modal').style.display = 'flex';
  } else {
    document.getElementById('start-modal').style.display = 'none';
    updatePlayerNameUI(localPlayerName);
  }

  // イベントバインド
  document.getElementById('start-game-btn').addEventListener('click', saveInitialName);
  document.getElementById('open-sidebar-btn').addEventListener('click', () => toggleSidebar(true));
  document.getElementById('close-sidebar-btn').addEventListener('click', () => toggleSidebar(false));
  document.getElementById('save-sidebar-name-btn').addEventListener('click', saveSidebarName);

  // ステータス割り振り連動（作成画面＆編集画面）
  setupStatSync('', false);
  setupStatSync('edit-', true);

  // 初期描画
  loadApiKey();
});

// プレイヤー名保存
function saveInitialName() {
  const input = document.getElementById('start-player-name').value.trim();
  if (!input) return alert('名前を入力してください！');
  localPlayerName = input;
  localStorage.setItem('ai_arena_player_name', localPlayerName);
  updatePlayerNameUI(localPlayerName);
  document.getElementById('start-modal').style.display = 'none';
}

function saveSidebarName() {
  const input = document.getElementById('sidebar-player-name').value.trim();
  if (!input) return alert('名前を入力してください！');
  localPlayerName = input;
  localStorage.setItem('ai_arena_player_name', localPlayerName);
  updatePlayerNameUI(localPlayerName);
  toggleSidebar(false);
  alert('プレイヤー名を変更しました');
}

function updatePlayerNameUI(name) {
  appState.playerName = name;
  localPlayerName = name;
  document.getElementById('header-user-display').textContent = `👤 ${name}`;
  document.getElementById('sidebar-player-name').value = name;
}

// タブ切り替え
function switchTab(tabId, event) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  
  document.getElementById(`tab-${tabId}`).classList.add('active');
  if (event) event.target.classList.add('active');
}

// サイドバー開閉
function toggleSidebar(open) {
  const sidebar = document.getElementById('settings-sidebar');
  if (open) sidebar.classList.add('open');
  else sidebar.classList.remove('open');
}

/* ===================================================
   ステータス配分連動 ＆ マイナス防止・自動上限補正ロジック
   =================================================== */
function setupStatSync(prefix = '', isEdit = false) {
  const stats = ['hp', 'atk', 'def', 'eva'];
  const baseTotal = 200;

  const getSkillCost = () => {
    if (isEdit && selectedEditSkillData) return selectedEditSkillData.cost || 0;
    if (!isEdit && selectedSkillData) return selectedSkillData.cost || 0;
    return 0;
  };

  const update = (changedStat) => {
    const maxTotal = baseTotal - getSkillCost();
    let currentValues = {};
    let currentSum = 0;

    stats.forEach(s => {
      const numInput = document.getElementById(`${prefix}num-stat-${s}`);
      let val = parseInt(numInput.value) || 0;
      if (val < 0) val = 0;
      currentValues[s] = val;
      currentSum += val;
    });

    if (currentSum > maxTotal && changedStat) {
      const over = currentSum - maxTotal;
      currentValues[changedStat] = Math.max(0, currentValues[changedStat] - over);
      currentSum = maxTotal;
    }

    stats.forEach(s => {
      const slider = document.getElementById(`${prefix}stat-${s}`);
      const numInput = document.getElementById(`${prefix}num-stat-${s}`);
      slider.value = currentValues[s];
      numInput.value = currentValues[s];
      slider.max = maxTotal;
    });

    const remaining = maxTotal - currentSum;
    document.getElementById(`${prefix}remaining-points`).textContent = remaining;

    const hpVal = currentValues['hp'] * 5;
    document.getElementById(`${prefix}val-hp`).textContent = `${hpVal} HP (${currentValues['hp']} pt)`;
    document.getElementById(`${prefix}val-atk`).textContent = `${currentValues['atk']} pt`;
    document.getElementById(`${prefix}val-def`).textContent = `${currentValues['def']} pt`;

    const spdPt = currentValues['eva'];
    const evaRate = Math.min(30, Math.floor(spdPt * 0.2));
    document.getElementById(`${prefix}val-eva`).textContent = `SPD:${spdPt}pt / 回避:${evaRate}%`;
  };

  stats.forEach(s => {
    const slider = document.getElementById(`${prefix}stat-${s}`);
    const numInput = document.getElementById(`${prefix}num-stat-${s}`);

    slider.addEventListener('input', () => {
      numInput.value = slider.value;
      update(s);
    });
    numInput.addEventListener('input', () => {
      slider.value = numInput.value;
      update(s);
    });
  });

  update();
}
/* ===================================================
   キャラ作成・編集処理
   =================================================== */

// ② キャラ再編集保存ハンドラ（appState対応版）
function handleUpdateCharacter(e) {
  if (e && e.preventDefault) e.preventDefault();

  // HTMLの隠し要素からIDを取得
  const characterId = document.getElementById('edit-char-id')?.value;

  if (!characterId) {
    alert('編集対象のキャラIDが見つかりませんでした');
    return;
  }

  const charData = getCharFormData('edit-'); // 編集用フォームから取得
  if (!charData) return;

  // openEditModal と同じ配列(appState)からキャラを探す
  const charList = appState.characters || appState.localCharacters || [];
  const index = charList.findIndex(c => c.id === characterId);

  if (index === -1) {
    alert('編集対象のキャラクターが見つかりませんでした');
    return;
  }

  // IDと作成者を維持したまま上書き
  charData.id = characterId;
  charData.author = charList[index].author || appState.playerName || 'プレイヤー';
  charData.createdBy = charList[index].createdBy || charData.author;

  // 配列のデータを更新
  charList[index] = charData;

  // localCharacters にも反映してローカルストレージへ保存
  if (appState.localCharacters) {
    const localIdx = appState.localCharacters.findIndex(c => c.id === characterId);
    if (localIdx !== -1) appState.localCharacters[localIdx] = charData;
  }
  if (typeof saveLocalCharacters === 'function') saveLocalCharacters();
  if (typeof updateCharacterInFirestore === 'function') updateCharacterInFirestore(charData);

  // 画面の再描画
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamChecklists === 'function') renderTeamChecklists();

  alert(`「${charData.name}」の再編集を保存しました！`);

  // モーダルを閉じる
  if (typeof closeEditModal === 'function') closeEditModal();
}

// ③ フォーム入力値の取得関数（stats構造を統一）
function selectSkillCandidate(index, prefix) {
  const isEdit = prefix === 'edit-';
  const candidates = isEdit ? window._editSkillCandidates : window._skillCandidates;
  if (!candidates || !candidates[index]) return;
  const skill = candidates[index];
  if (isEdit) {
    selectedEditSkillData = skill;
  } else {
    selectedSkillData = skill;
  }
  renderSkillCandidates(candidates, prefix, index);
  updateSkillStatusDisplay(prefix, skill);
  showSkillNameEditSection(prefix, skill);
  setupStatSync(prefix, isEdit);
}

function showSkillNameEditSection(prefix, skill) {
  const section = document.getElementById(`${prefix}skill-name-edit-section`);
  const input = document.getElementById(`${prefix}char-skill-name-custom`);
  if (!section || !input) return;
  if (skill) {
    section.style.display = 'block';
    input.value = skill.name || '';
  } else {
    section.style.display = 'none';
    input.value = '';
  }
}

function updateCustomSkillName(prefix) {
  const input = document.getElementById(`${prefix}char-skill-name-custom`);
  if (!input) return;
  const newName = input.value.trim();
  const skill = prefix === 'edit-' ? selectedEditSkillData : selectedSkillData;
  if (!skill) return;
  skill.name = newName || skill.name;
  if (typeof renderSkillCandidates === 'function') {
    const candidates = prefix === 'edit-' ? window._editSkillCandidates : window._skillCandidates;
    const selectedIndex = candidates ? candidates.indexOf(skill) : -1;
    renderSkillCandidates(candidates, prefix, selectedIndex);
  }
  updateSkillStatusDisplay(prefix, skill);
}

function renderSkillCandidates(candidates, prefix, selectedIndex) {
  const box = document.getElementById(`${prefix}skill-candidates-box`);
  if (!box) return;
  box.innerHTML = '';
  candidates.forEach((skill, i) => {
    const card = document.createElement('div');
    card.className = 'skill-candidate-card' + (i === selectedIndex ? ' selected' : '');
    card.onclick = () => selectSkillCandidate(i, prefix);
    const tags = [
      `対象: ${skill.target || '単体'}`,
      `確率: ${skill.probability || 100}%`,
      `効果: ${skill.effectType || 'ダメージ'}`,
      `効果量: ${skill.effectValue || 0}`,
      skill.duration ? `持続: ${skill.duration}T` : null,
      `条件: ${skill.condition || '常時'}`
    ].filter(t => t);
    card.innerHTML = `
      <div class="skill-candidate-header">
        <span class="skill-candidate-name">${escapeHtml(skill.name)}</span>
        <span class="skill-candidate-cost">消費 ${skill.cost}pt</span>
      </div>
      <div class="skill-candidate-desc">${escapeHtml(skill.description || '')}</div>
      <div class="skill-candidate-meta">
        ${tags.map(t => `<span class="skill-candidate-tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    `;
    box.appendChild(card);
  });
}

function updateSkillStatusDisplay(prefix, skill) {
  const el = document.getElementById(`${prefix}skill-status-display`);
  if (!el) return;
  if (!skill) {
    el.textContent = 'まだスキルが選択されていません';
    return;
  }
  el.innerHTML = `✅ 選択中: <span class="skill-selected-name">${escapeHtml(skill.name)}</span> (消費 ${skill.cost}pt) → ステータス振り分け上限: ${200 - skill.cost}pt`;
}

function clearSkillSelection(prefix) {
  if (prefix === 'edit-') {
    selectedEditSkillData = null;
    window._editSkillCandidates = null;
  } else {
    selectedSkillData = null;
    window._skillCandidates = null;
  }
  const box = document.getElementById(`${prefix}skill-candidates-box`);
  if (box) box.innerHTML = '';
  updateSkillStatusDisplay(prefix, null);
  showSkillNameEditSection(prefix, null);
  setupStatSync(prefix, prefix === 'edit-');
}

function getCharFormData(prefix = '') {
  const nameEl = document.getElementById(`${prefix}char-name`);
  if (!nameEl) return null;
  
  const name = nameEl.value.trim();
  if (!name) { alert('名前は必須です'); return null; }

  const hpPt = parseInt(document.getElementById(`${prefix}num-stat-hp`).value) || 0;
  const atkPt = parseInt(document.getElementById(`${prefix}num-stat-atk`).value) || 0;
  const defPt = parseInt(document.getElementById(`${prefix}num-stat-def`).value) || 0;
  const spdPt = parseInt(document.getElementById(`${prefix}num-stat-eva`).value) || 0;

  const tagsRaw = document.getElementById(`${prefix}char-tags`)?.value || '';
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(t => t) : [];
  const skill = prefix === 'edit-' ? selectedEditSkillData : selectedSkillData;

  return {
    name: name,
    job: document.getElementById(`${prefix}char-job`)?.value.trim() || '冒険者',
    attackType: document.getElementById(`${prefix}char-attack-type`)?.value || '近接',
    tags: tags,
    appearance: document.getElementById(`${prefix}char-appearance`)?.value.trim() || '標準的な姿',
    bio: document.getElementById(`${prefix}char-bio`)?.value.trim() || '特筆なし',
    normalSkill: document.getElementById(`${prefix}char-normal-skill`)?.value.trim() || '通常攻撃',
    specialSkill: document.getElementById(`${prefix}char-special-skill`)?.value.trim() || '渾身の一撃',
    quote: document.getElementById(`${prefix}char-quote`)?.value.trim() || '覚悟しろ！',
    stats: {
      hp: hpPt * 5,
      maxHp: hpPt * 5,
      atk: atkPt,
      def: defPt,
      spd: spdPt,
      eva: spdPt,
      evaRate: Math.min(30, Math.floor(spdPt * 0.2))
    },
    customSkill: skill || null,
    author: localPlayerName
  };
}

/* ===================================================
   チーム編成＆リアルタイムタグ検索
   =================================================== */
function getCharList() {
  return appState.characters?.length > 0
    ? appState.characters
    : (appState.localCharacters?.length > 0 ? appState.localCharacters : globalSharedCharacters);
}

function filterCharacters(query) {
  const charList = getCharList();
  if (!query) return charList;
  const q = query.toLowerCase().trim();
  return charList.filter(c => {
    const name = (c.name || '').toLowerCase();
    const job = (c.job || '').toLowerCase();
    const tags = Array.isArray(c.tags) ? c.tags.join(' ').toLowerCase() : '';
    return name.includes(q) || job.includes(q) || tags.includes(q);
  });
}

function renderTeamChecklists() {
  const p1Box = document.getElementById('p1-checklist');
  const p2Box = document.getElementById('p2-checklist');
  if (!p1Box || !p2Box) return;

  const query = document.getElementById('team-tag-search')?.value || '';
  const filtered = filterCharacters(query);

  p1Box.innerHTML = '';
  p2Box.innerHTML = '';

  if (filtered.length === 0) {
    p1Box.innerHTML = '<div style="font-size:0.85rem; color:var(--text-sub);">該当するキャラがいません</div>';
    p2Box.innerHTML = '<div style="font-size:0.85rem; color:var(--text-sub);">該当するキャラがいません</div>';
    return;
  }

  filtered.forEach(c => {
    if (typeof createChecklistItem === 'function') {
      p1Box.appendChild(createChecklistItem(c, 'p1'));
      p2Box.appendChild(createChecklistItem(c, 'p2'));
    }
  });
}

function filterTeamChecklist() {
  renderTeamChecklists();
}

function resetGalleryFilter() {
  const galleryInput = document.getElementById('gallery-tag-search');
  const teamInput = document.getElementById('team-tag-search');
  if (galleryInput) galleryInput.value = '';
  if (teamInput) teamInput.value = '';
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamChecklists === 'function') renderTeamChecklists();
}

function filterGallery() {
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
}

function updateTeamNameDisplays() {
  const p1Input = document.getElementById('p1-team-name-input');
  const p2Input = document.getElementById('p2-team-name-input');
  if (p1Input) appState.p1Name = p1Input.value;
  if (p2Input) appState.p2Name = p2Input.value;
}

function createChecklistItem(char, teamPrefix) {
  const div = document.createElement('div');
  div.className = 'checklist-item';
  div.innerHTML = `
    <input type="checkbox" id="${teamPrefix}-char-${char.id}" value="${char.id}" onchange="updateTeamCounts()">
    <label for="${teamPrefix}-char-${char.id}">
      <strong>${escapeHtml(char.name)}</strong> (${char.job}) - HP:${char.stats.hp} ATK:${char.stats.atk}
    </label>
  `;
  return div;
}

function updateTeamCounts() {
  const p1Count = document.querySelectorAll('#p1-checklist input:checked').length;
  const p2Count = document.querySelectorAll('#p2-checklist input:checked').length;
  document.getElementById('p1-count').textContent = p1Count;
  document.getElementById('p2-count').textContent = p2Count;
}

function setTeamPreset(p1Name, p2Name) {
  document.getElementById('p1-team-name-input').value = p1Name;
  document.getElementById('p2-team-name-input').value = p2Name;
}

/* ===================================================
   AI小説 シチュエーションタグ補正
   =================================================== */
function appendNovelContext(text) {
  const input = document.getElementById('novel-context-input');
  if (input.value.trim() === '') {
    input.value = text;
  } else {
    input.value += ' ' + text;
  }
}
function setNovelStyle(text) {
  const input = document.getElementById('novel-style-input');
  if (input) input.value = text;
}
// スライダーと数字入力を連動させる関数
function syncStat(sliderId, inputId) {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  if (slider && input) {
    input.value = slider.value;
  }
}
// XSS対策用
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCharacterGallery() {
  const gallery = document.getElementById('character-gallery') || document.getElementById('character-list');
  if (!gallery) return;

  gallery.innerHTML = '';

  const query = document.getElementById('gallery-tag-search')?.value || '';
  const charList = filterCharacters(query);

  if (!charList || charList.length === 0) {
    gallery.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding:30px;">まだキャラクターが作成されていません。</p>';
    return;
  }

  charList.forEach(c => {
    const displayHp = c.stats.maxHp || c.stats.hp || 0;
    const displaySpd = c.stats.spd || c.stats.eva || 0;
    const displayAtk = c.stats.atk || 0;
    const displayDef = c.stats.def || 0;
    const tags = Array.isArray(c.tags) ? c.tags : [];
    const tagBadges = tags.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('');
    const totalPoints = Math.floor(displayHp / 5) + displayAtk + displayDef + displaySpd;
    const hpPct = Math.min(100, Math.floor(displayHp / 10));
    const atkPct = Math.min(100, displayAtk);
    const defPct = Math.min(100, displayDef);
    const spdPct = Math.min(100, Math.floor(displaySpd / 1.5));

    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `
      <div class="char-card-header">
        <div class="char-card-name-row">
          <h3 class="char-card-name">${escapeHtml(c.name)}</h3>
          <span class="char-card-job">${escapeHtml(c.job || '冒険者')}</span>
        </div>
        <span class="char-card-type">${escapeHtml(c.attackType || '物理')}</span>
      </div>
      <div class="char-card-tags">${tagBadges || '<span class="tag-empty">タグなし</span>'}</div>
      <div class="char-card-stats">
        <div class="stat-bar-wrap">
          <span class="stat-bar-label">❤️ HP</span>
          <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-hp" style="width:${hpPct}%"></div></div>
          <span class="stat-bar-num">${displayHp}</span>
        </div>
        <div class="stat-bar-wrap">
          <span class="stat-bar-label">⚔️ ATK</span>
          <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-atk" style="width:${atkPct}%"></div></div>
          <span class="stat-bar-num">${displayAtk}</span>
        </div>
        <div class="stat-bar-wrap">
          <span class="stat-bar-label">🛡️ DEF</span>
          <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-def" style="width:${defPct}%"></div></div>
          <span class="stat-bar-num">${displayDef}</span>
        </div>
        <div class="stat-bar-wrap">
          <span class="stat-bar-label">💨 SPD</span>
          <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-spd" style="width:${spdPct}%"></div></div>
          <span class="stat-bar-num">${displaySpd}</span>
        </div>
      </div>
      <div class="char-card-skills">
        <div class="char-card-skill"><span class="skill-label">通常</span><span class="skill-name">${escapeHtml(c.normalSkill || '通常攻撃')}</span></div>
        <div class="char-card-skill char-card-skill-special"><span class="skill-label">必殺</span><span class="skill-name">${escapeHtml(c.specialSkill || '奥義')}</span></div>
      </div>
      <div class="char-card-quote">「${escapeHtml(c.quote || '……')}」</div>
      <div class="char-card-footer">
        <span class="char-card-points">合計 ${totalPoints}pt</span>
        <div class="char-card-actions">
          <button class="btn-sm" onclick="openEditModal('${c.id}')">編集</button>
          <button class="btn-sm btn-sm-danger" onclick="deleteCharacter('${c.id}')">削除</button>
        </div>
      </div>
    `;
    gallery.appendChild(card);
  });
}
