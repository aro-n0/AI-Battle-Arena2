
/**
 * visual-battle.js — ビジュアルアニメーションバトルモード
 * 前衛・後衛カード表示、ダメージ演出、ステップ再生
 */
(function () {
  'use strict';

  /* ─── 内部状態 ─────────────────────────────────── */
  let vbData = null;       // { p1Fighters, p2Fighters, events, p1Name, p2Name }
  let currentStep = 0;
  let autoTimer = null;
  let autoActive = false;
  let hpState = {};        // id → currentHp
  let aliveState = {};     // id → bool

  /* ─── 外部API ──────────────────────────────────── */

  /**
   * battle.js の runBattleSimulation 完了後に呼ばれる
   * @param {object} data  { p1Fighters, p2Fighters, events, p1Name, p2Name }
   */
  window.initVisualBattle = function (data) {
    vbData = data;
    currentStep = 0;
    _stopAuto();
    _resetHpState();

    // ビジュアルビューが表示中なら即レンダリング
    const view = document.getElementById('battle-visual-view');
    if (view && view.style.display !== 'none') {
      _renderArena();
      _applyUpTo(0);
      _showStep(0);
    }
  };

  /** テキスト／ビジュアル切り替えボタン */
  window.switchBattleView = function (mode) {
    const textView   = document.getElementById('battle-text-view');
    const visualView = document.getElementById('battle-visual-view');
    const textBtn    = document.getElementById('btn-text-mode');
    const visualBtn  = document.getElementById('btn-visual-mode');
    if (!textView || !visualView) return;

    if (mode === 'visual') {
      textView.style.display   = 'none';
      visualView.style.display = 'block';
      if (textBtn)   { textBtn.classList.remove('vb-mode-active'); }
      if (visualBtn) { visualBtn.classList.add('vb-mode-active'); }

      if (vbData) {
        _renderArena();
        _resetHpState();
        _applyUpTo(currentStep);
        _showStep(currentStep, false /* no anim on reenter */);
      } else {
        visualView.innerHTML =
          '<p class="sub-text" style="text-align:center;padding:40px 20px;">' +
          '⚔️ バトルを実行するとビジュアルが表示されます</p>';
      }
    } else {
      textView.style.display   = 'block';
      visualView.style.display = 'none';
      if (textBtn)   { textBtn.classList.add('vb-mode-active'); }
      if (visualBtn) { visualBtn.classList.remove('vb-mode-active'); }
      _stopAuto();
    }
  };

  /* ステップ移動（外部ボタンから呼ばれる） */
  window.vbStep = function (delta) {
    if (!vbData) return;
    let next;
    if (delta === 'start')  next = 0;
    else if (delta === 'end') next = vbData.events.length - 1;
    else next = currentStep + delta;
    next = Math.max(0, Math.min(next, vbData.events.length - 1));
    if (next !== currentStep) {
      _resetHpState();
      _applyUpTo(next);
      _showStep(next);
      currentStep = next;
    }
  };

  window.vbToggleAuto = function () {
    if (autoActive) {
      _stopAuto();
    } else {
      _startAuto();
    }
  };

  /* ─── 内部: アリーナ描画 ───────────────────────── */

  function _renderArena() {
    const container = document.getElementById('battle-visual-view');
    if (!container || !vbData) return;
    const { p1Fighters, p2Fighters, p1Name, p2Name } = vbData;

    container.innerHTML = `
      <div class="vb-arena">

        <!-- ヘッダー行 -->
        <div class="vb-header">
          <div class="vb-team-label vb-p1-label">${_esc(p1Name)}</div>
          <div class="vb-turn-badge" id="vb-turn-badge">ターン —</div>
          <div class="vb-team-label vb-p2-label">${_esc(p2Name)}</div>
        </div>

        <!-- メインフィールド -->
        <div class="vb-field">

          <!-- P1 チーム -->
          <div class="vb-team-col" id="vb-p1-col">
            <div class="vb-formation-header vb-front-header">⚔️ 前衛</div>
            <div class="vb-row" id="vb-p1-front">
              ${p1Fighters.filter(f => f.formation === 'front').map(_cardHtml).join('')}
            </div>
            <div class="vb-formation-header vb-back-header">🏹 後衛</div>
            <div class="vb-row" id="vb-p1-back">
              ${p1Fighters.filter(f => f.formation === 'back').map(_cardHtml).join('')}
            </div>
          </div>

          <!-- VS区切り -->
          <div class="vb-vs">⚔️</div>

          <!-- P2 チーム -->
          <div class="vb-team-col" id="vb-p2-col">
            <div class="vb-formation-header vb-front-header">⚔️ 前衛</div>
            <div class="vb-row" id="vb-p2-front">
              ${p2Fighters.filter(f => f.formation === 'front').map(_cardHtml).join('')}
            </div>
            <div class="vb-formation-header vb-back-header">🏹 後衛</div>
            <div class="vb-row" id="vb-p2-back">
              ${p2Fighters.filter(f => f.formation === 'back').map(_cardHtml).join('')}
            </div>
          </div>
        </div>

        <!-- イベントログ行 -->
        <div class="vb-event-row" id="vb-event-row">バトル開始準備中...</div>

        <!-- 操作ボタン -->
        <div class="vb-controls">
          <button class="btn-sm" onclick="vbStep('start')" title="最初へ">⏮</button>
          <button class="btn-sm" onclick="vbStep(-1)"      title="前へ">◀ 前</button>
          <button class="btn-sm vb-auto-btn" id="vb-auto-btn" onclick="vbToggleAuto()">▶ 自動再生</button>
          <button class="btn-sm" onclick="vbStep(1)"       title="次へ">次 ▶</button>
          <button class="btn-sm" onclick="vbStep('end')"   title="最後へ">⏭</button>
          <span class="vb-step-counter" id="vb-step-counter"></span>
        </div>
      </div>
    `;
  }

  function _cardHtml(fighter) {
    const maxHp   = fighter.stats.maxHp || fighter.stats.hp || 1;
    const roleIco = _roleIcon(fighter.role);
    const elemBadge = fighter.element
      ? `<span class="vb-elem-badge" style="border-color:${_esc(fighter.elementColor || '#94a3b8')};color:${_esc(fighter.elementColor || '#94a3b8')}">${_esc(fighter.element)}</span>`
      : '';
    return `
      <div class="vb-card" id="vb-card-${_esc(fighter.id)}" data-id="${_esc(fighter.id)}" data-maxhp="${maxHp}">
        <div class="vb-card-role">${roleIco}</div>
        <div class="vb-card-name">${_esc(fighter.name)}</div>
        ${elemBadge}
        <div class="vb-hp-bar-wrap">
          <div class="vb-hp-bar" id="vb-hpbar-${_esc(fighter.id)}" style="width:100%"></div>
        </div>
        <div class="vb-hp-text" id="vb-hptext-${_esc(fighter.id)}">${maxHp}<span style="opacity:.6;font-size:.75em">/${maxHp}</span></div>
      </div>`;
  }

  /* ─── 内部: HP状態管理 ─────────────────────────── */

  function _resetHpState() {
    if (!vbData) return;
    [...vbData.p1Fighters, ...vbData.p2Fighters].forEach(f => {
      hpState[f.id]    = f.stats.maxHp || f.stats.hp || 0;
      aliveState[f.id] = true;
    });
  }

  function _applyUpTo(stepIndex) {
    if (!vbData) return;
    const evs = vbData.events;
    const limit = Math.min(stepIndex, evs.length - 1);
    for (let i = 0; i <= limit; i++) {
      _applyEvent(evs[i]);
    }
    // DOM を全員分更新
    [...vbData.p1Fighters, ...vbData.p2Fighters].forEach(f => {
      _updateCard(f.id, hpState[f.id], aliveState[f.id], false);
    });
  }

  function _applyEvent(ev) {
    switch (ev.type) {
      case 'damage':
        if (ev.targetId != null && hpState[ev.targetId] !== undefined)
          hpState[ev.targetId] = Math.max(0, hpState[ev.targetId] - ev.amount);
        break;
      case 'heal':
        if (ev.targetId != null && hpState[ev.targetId] !== undefined) {
          const fAll = vbData ? [...vbData.p1Fighters, ...vbData.p2Fighters] : [];
          const fObj = fAll.find(f => f.id === ev.targetId);
          const max  = fObj ? (fObj.stats.maxHp || fObj.stats.hp || 9999) : 9999;
          hpState[ev.targetId] = Math.min(max, hpState[ev.targetId] + ev.amount);
        }
        break;
      case 'ko':
        if (ev.fighterId != null) {
          aliveState[ev.fighterId] = false;
          hpState[ev.fighterId]    = 0;
        }
        break;
    }
  }

  /* ─── 内部: ステップ表示 ───────────────────────── */

  function _showStep(stepIndex, withAnim) {
    if (!vbData) return;
    withAnim = withAnim !== false;
    const evs  = vbData.events;
    if (!evs || evs.length === 0) return;
    const idx  = Math.max(0, Math.min(stepIndex, evs.length - 1));
    const ev   = evs[idx];

    // カウンター
    const counter = document.getElementById('vb-step-counter');
    if (counter) counter.textContent = `${idx + 1} / ${evs.length}`;

    // ターン表示
    const turnBadge = document.getElementById('vb-turn-badge');
    if (turnBadge && ev.turn != null) turnBadge.textContent = `ターン ${ev.turn}`;

    // イベントテキスト
    _renderEventText(ev);

    // アニメーション
    if (withAnim) {
      if (ev.type === 'damage' && ev.targetId) {
        const card = document.getElementById(`vb-card-${ev.targetId}`);
        if (card) {
          _triggerClass(card, 'vb-anim-hit');
          _spawnNum(card, `-${ev.amount}`, ev.isSpecial ? 'vb-num-special' : (ev.isCritical ? 'vb-num-crit' : 'vb-num-dmg'));
        }
        if (ev.attackerId) {
          const acard = document.getElementById(`vb-card-${ev.attackerId}`);
          if (acard) _triggerClass(acard, 'vb-anim-attack');
        }
      }
      if (ev.type === 'heal' && ev.targetId) {
        const card = document.getElementById(`vb-card-${ev.targetId}`);
        if (card) {
          _triggerClass(card, 'vb-anim-heal');
          _spawnNum(card, `+${ev.amount}`, 'vb-num-heal');
        }
      }
      if (ev.type === 'skill' && ev.casterId) {
        const card = document.getElementById(`vb-card-${ev.casterId}`);
        if (card) _triggerClass(card, 'vb-anim-skill');
      }
      if (ev.type === 'ko' && ev.fighterId) {
        const card = document.getElementById(`vb-card-${ev.fighterId}`);
        if (card) _triggerClass(card, 'vb-anim-ko');
      }
    }

    // HPバーをリアルタイム更新
    [...(vbData.p1Fighters || []), ...(vbData.p2Fighters || [])].forEach(f => {
      _updateCard(f.id, hpState[f.id], aliveState[f.id], withAnim);
    });
  }

  function _renderEventText(ev) {
    const row = document.getElementById('vb-event-row');
    if (!row) return;
    let html = '';

    switch (ev.type) {
      case 'battle_start':
        html = `<span class="vb-log-start">⚔️ バトル開始！ ${_esc(ev.p1Name)} VS ${_esc(ev.p2Name)}</span>`;
        break;
      case 'turn_start':
        html = `<span class="vb-log-turn">━━ ターン ${ev.turn} 開始 ━━</span>`;
        break;
      case 'damage': {
        const tag = ev.isSpecial ? '🔥【必殺技】' : ev.isCritical ? '⚡【クリティカル】' : '⚔️';
        html = `<span class="vb-log-dmg">${tag} <b>${_esc(ev.attackerName)}</b>の「${_esc(ev.skillName)}」→ <b>${_esc(ev.targetName)}</b>に <em>${ev.amount} ダメージ</em>！</span>`;
        break;
      }
      case 'miss':
        html = `<span class="vb-log-miss">💨 <b>${_esc(ev.attackerName)}</b>の攻撃！ <b>${_esc(ev.targetName)}</b>は回避した！(MISS)</span>`;
        break;
      case 'heal':
        html = `<span class="vb-log-heal">💚 <b>${_esc(ev.healerName)}</b>の回復！ <b>${_esc(ev.targetName)}</b>を <em>${ev.amount} 回復</em>！</span>`;
        break;
      case 'ko':
        html = `<span class="vb-log-ko">💥 <b>${_esc(ev.fighterName)}</b> は力尽き倒れた！</span>`;
        break;
      case 'skill':
        html = `<span class="vb-log-skill">✨ <b>${_esc(ev.casterName)}</b>の「${_esc(ev.skillName)}」が発動！</span>`;
        break;
      case 'battle_end': {
        const wMsg = ev.winner === 'draw'
          ? '🤝 引き分け！'
          : `🏆 【${_esc(ev.winnerName)}】の勝利！`;
        html = `<span class="vb-log-win">${wMsg}</span>`;
        break;
      }
      default:
        html = ev.text ? `<span class="vb-log-normal">${_esc(ev.text)}</span>` : '';
    }
    row.innerHTML = html;
  }

  /* ─── 内部: カードDOM更新 ─────────────────────── */

  function _updateCard(id, hp, alive, animate) {
    const card   = document.getElementById(`vb-card-${id}`);
    const hpBar  = document.getElementById(`vb-hpbar-${id}`);
    const hpText = document.getElementById(`vb-hptext-${id}`);
    if (!card) return;

    const maxHp = parseInt(card.dataset.maxhp) || 1;
    const pct   = Math.max(0, Math.min(100, (hp / maxHp) * 100));

    if (hpBar) {
      hpBar.style.width = pct + '%';
      if (pct > 60)      hpBar.style.background = 'linear-gradient(90deg,#22c55e,#4ade80)';
      else if (pct > 30) hpBar.style.background = 'linear-gradient(90deg,#f59e0b,#fbbf24)';
      else               hpBar.style.background = 'linear-gradient(90deg,#ef4444,#f87171)';
    }
    if (hpText)
      hpText.innerHTML = `${hp}<span style="opacity:.6;font-size:.75em">/${maxHp}</span>`;

    if (!alive) {
      card.classList.add('vb-card-dead');
    } else {
      card.classList.remove('vb-card-dead');
    }
  }

  /* ─── 内部: 自動再生 ───────────────────────────── */

  function _startAuto() {
    if (!vbData) return;
    autoActive = true;
    const btn = document.getElementById('vb-auto-btn');
    if (btn) { btn.textContent = '⏸ 停止'; btn.classList.add('vb-auto-active'); }

    autoTimer = setInterval(() => {
      if (!vbData || currentStep >= vbData.events.length - 1) {
        _stopAuto(); return;
      }
      currentStep++;
      _resetHpState();
      _applyUpTo(currentStep);
      _showStep(currentStep);
    }, 500);
  }

  function _stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    autoActive = false;
    const btn = document.getElementById('vb-auto-btn');
    if (btn) { btn.textContent = '▶ 自動再生'; btn.classList.remove('vb-auto-active'); }
  }

  /* ─── ユーティリティ ───────────────────────────── */

  function _roleIcon(role) {
    const m = { melee: '⚔️', ranged: '🏹', mage: '🔮', healer: '💚', tank: '🛡️' };
    return m[role] || '⚔️';
  }

  function _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** アニメーションクラスをリセット→付与 */
  function _triggerClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // reflow
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  /** カード上にフローティング数字を表示 */
  function _spawnNum(cardEl, text, cls) {
    const el = document.createElement('div');
    el.className = 'vb-float-num ' + cls;
    el.textContent = text;
    cardEl.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

})();
