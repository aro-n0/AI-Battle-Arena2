/**
 * visual-battle.js — ビジュアルアニメーションバトルモード（強化版）
 * - 前衛・後衛カード表示 / ステップ再生
 * - 5種ランダムBGM + 15ターン泥沼化BGM切り替え + BGM ON/OFF・音量スライダー
 * - イベント別SE（通常攻撃/必殺技/スキル/回復/MISS/KO）
 * - 画面フラッシュ / MISS回避アニメーション / 開幕スキルオーラ / 巨大ダメージ数字
 */
(function () {
  'use strict';

  /* ─── 内部状態 ──────────────────────────────────── */
  let vbData            = null;   // { p1Fighters, p2Fighters, events, p1Name, p2Name }
  let currentStep       = 0;
  let autoTimer         = null;
  let autoActive        = false;
  let hpState           = {};     // id → currentHp
  let aliveState        = {};     // id → bool
  let mudTriggered      = false;  // 15ターン泥沼化済み
  let vbBgmOn           = true;   // ビジュアルバトル専用BGM ON/OFF

  /* ─── 外部API ────────────────────────────────────── */

  /** battle.js の runBattleSimulation() 完了後に呼ばれる */
  window.initVisualBattle = function (data) {
    vbData       = data;
    currentStep  = 0;
    mudTriggered = false;
    _stopAuto();
    _resetHpState();

    // ビジュアルビューが表示中なら即レンダリング
    const view = document.getElementById('battle-visual-view');
    if (view && view.style.display !== 'none') {
      _renderArena();
      _applyUpTo(0);
      _showStep(0, false);
    }
  };

  /** テキスト ↔ ビジュアル 表示切替 */
  window.switchBattleView = function (mode) {
    const textView   = document.getElementById('battle-text-view');
    const visualView = document.getElementById('battle-visual-view');
    const textBtn    = document.getElementById('btn-text-mode');
    const visualBtn  = document.getElementById('btn-visual-mode');
    if (!textView || !visualView) return;

    if (mode === 'visual') {
      textView.style.display   = 'none';
      visualView.style.display = 'block';
      if (textBtn)   textBtn.classList.remove('vb-mode-active');
      if (visualBtn) visualBtn.classList.add('vb-mode-active');

      if (vbData) {
        _renderArena();
        _resetHpState();
        _applyUpTo(currentStep);
        _showStep(currentStep, false);
        if (vbBgmOn && typeof SoundManager !== 'undefined') SoundManager.startBattleBGM();
      } else {
        visualView.innerHTML =
          '<p class="sub-text" style="text-align:center;padding:40px 20px;">' +
          '⚔️ バトルを実行するとビジュアルが表示されます</p>';
      }
    } else {
      textView.style.display   = 'block';
      visualView.style.display = 'none';
      if (textBtn)   textBtn.classList.add('vb-mode-active');
      if (visualBtn) visualBtn.classList.remove('vb-mode-active');
      _stopAuto();
      if (typeof SoundManager !== 'undefined') SoundManager.stopBattleBGM();
    }
  };

  window.vbStep = function (delta) {
    if (!vbData) return;
    let next;
    if      (delta === 'start') next = 0;
    else if (delta === 'end')   next = vbData.events.length - 1;
    else                        next = currentStep + delta;
    next = Math.max(0, Math.min(next, vbData.events.length - 1));
    if (next !== currentStep) {
      _resetHpState();
      _applyUpTo(next);
      _showStep(next, true);
      currentStep = next;
    }
  };

  window.vbToggleAuto = function () {
    autoActive ? _stopAuto() : _startAuto();
  };

  window.vbToggleBgm = function () {
    vbBgmOn = !vbBgmOn;
    const btn = document.getElementById('vb-bgm-btn');
    if (btn) btn.textContent = vbBgmOn ? '🎵 BGM ON' : '🔇 BGM OFF';
    if (typeof SoundManager !== 'undefined') {
      if (vbBgmOn) SoundManager.startBattleBGM();
      else         SoundManager.stopBattleBGM();
    }
  };

  window.vbSetBgmVol = function (val) {
    if (typeof SoundManager !== 'undefined') SoundManager.setBgmVolume(parseFloat(val) / 100);
  };

  /* ─── アリーナ描画 ──────────────────────────────── */

  function _renderArena() {
    const container = document.getElementById('battle-visual-view');
    if (!container || !vbData) return;
    const { p1Fighters, p2Fighters, p1Name, p2Name } = vbData;
    const bgmVol = (typeof SoundManager !== 'undefined') ? Math.round(SoundManager.bgmVolume * 100) : 30;

    container.innerHTML = `
      <div class="vb-arena">

        <!-- フラッシュオーバーレイ（画面全体フラッシュ用） -->
        <div id="vb-flash-overlay" class="vb-flash-overlay"></div>

        <!-- ヘッダー行 -->
        <div class="vb-header">
          <div class="vb-team-label vb-p1-label">${_esc(p1Name)}</div>
          <div class="vb-turn-badge" id="vb-turn-badge">ターン —</div>
          <div class="vb-team-label vb-p2-label">${_esc(p2Name)}</div>
        </div>

        <!-- メインフィールド -->
        <div class="vb-field">
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

          <div class="vb-vs">⚔️</div>

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

        <!-- イベントログ -->
        <div class="vb-event-row" id="vb-event-row">バトル開始！</div>

        <!-- 操作ボタン -->
        <div class="vb-controls">
          <button class="btn-sm" onclick="vbStep('start')" title="最初へ">⏮</button>
          <button class="btn-sm" onclick="vbStep(-1)" title="前へ">◀ 前</button>
          <button class="btn-sm vb-auto-btn" id="vb-auto-btn" onclick="vbToggleAuto()">▶ 自動再生</button>
          <button class="btn-sm" onclick="vbStep(1)" title="次へ">次 ▶</button>
          <button class="btn-sm" onclick="vbStep('end')" title="最後へ">⏭</button>
          <span class="vb-step-counter" id="vb-step-counter"></span>
        </div>

        <!-- BGM コントロール -->
        <div class="vb-bgm-controls">
          <button class="btn-sm vb-bgm-toggle-btn" id="vb-bgm-btn" onclick="vbToggleBgm()">${vbBgmOn ? '🎵 BGM ON' : '🔇 BGM OFF'}</button>
          <span class="vb-bgm-vol-label">🔊</span>
          <input type="range" class="vb-bgm-slider" id="vb-bgm-slider"
            min="0" max="100" value="${bgmVol}" oninput="vbSetBgmVol(this.value)">
        </div>
      </div>
    `;

    mudTriggered = false;
  }

  function _cardHtml(fighter) {
    const maxHp     = fighter.stats.maxHp || fighter.stats.hp || 1;
    const roleIco   = _roleIcon(fighter.role);
    const elemBadge = fighter.element
      ? `<span class="vb-elem-badge" style="border-color:${_esc(fighter.elementColor||'#94a3b8')};color:${_esc(fighter.elementColor||'#94a3b8')}">${_esc(fighter.element)}</span>`
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

  /* ─── HP 状態管理 ───────────────────────────────── */

  function _resetHpState() {
    if (!vbData) return;
    [...vbData.p1Fighters, ...vbData.p2Fighters].forEach(f => {
      hpState[f.id]    = f.stats.maxHp || f.stats.hp || 0;
      aliveState[f.id] = true;
    });
  }

  function _applyUpTo(stepIndex) {
    if (!vbData) return;
    const limit = Math.min(stepIndex, vbData.events.length - 1);
    for (let i = 0; i <= limit; i++) _applyEvent(vbData.events[i]);
    [...vbData.p1Fighters, ...vbData.p2Fighters].forEach(f =>
      _updateCard(f.id, hpState[f.id], aliveState[f.id], false));
  }

  function _applyEvent(ev) {
    switch (ev.type) {
      case 'damage':
        if (ev.targetId != null && hpState[ev.targetId] !== undefined)
          hpState[ev.targetId] = Math.max(0, hpState[ev.targetId] - ev.amount);
        break;
      case 'heal':
        if (ev.targetId != null && hpState[ev.targetId] !== undefined) {
          const all  = vbData ? [...vbData.p1Fighters, ...vbData.p2Fighters] : [];
          const fObj = all.find(f => f.id === ev.targetId);
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

  /* ─── ステップ表示 ──────────────────────────────── */

  function _showStep(stepIndex, withAnim) {
    if (!vbData) return;
    withAnim = (withAnim !== false);
    const evs = vbData.events;
    if (!evs || evs.length === 0) return;
    const idx = Math.max(0, Math.min(stepIndex, evs.length - 1));
    const ev  = evs[idx];

    // カウンター更新
    const counter = document.getElementById('vb-step-counter');
    if (counter) counter.textContent = `${idx + 1} / ${evs.length}`;

    // ターン表示 + 泥沼化チェック
    if (ev.turn != null) {
      const badge = document.getElementById('vb-turn-badge');
      if (badge) badge.textContent = `ターン ${ev.turn}`;
      _checkMudBattle(ev.turn);
    }

    // イベントテキスト描画
    _renderEventText(ev);

    // アニメーション & SE
    if (withAnim) {
      _playAnim(ev);
      _playSE(ev);
    }

    // HP バー全員更新
    [...(vbData.p1Fighters || []), ...(vbData.p2Fighters || [])].forEach(f =>
      _updateCard(f.id, hpState[f.id], aliveState[f.id], withAnim));
  }

  /** 15 ターン以上で泥沼化 BGM に切り替え */
  function _checkMudBattle(turn) {
    if (!mudTriggered && turn >= 15 && typeof SoundManager !== 'undefined') {
      mudTriggered = true;
      if (vbBgmOn) {
        SoundManager.switchToDesperationBGM();
        // 警告SE
        setTimeout(() => SoundManager.playSE('battle_start'), 200);
      }
      // ターンバッジを赤く光らせる
      const badge = document.getElementById('vb-turn-badge');
      if (badge) {
        badge.classList.add('vb-turn-mud');
        badge.textContent = `⚠️ ターン ${turn} 泥沼化！`;
        setTimeout(() => {
          badge.classList.remove('vb-turn-mud');
          badge.textContent = `ターン ${turn}`;
        }, 2500);
      }
    }
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
        const cls = ev.isSkillDamage ? 'vb-log-skill-dmg' : 'vb-log-dmg';
        html = `<span class="${cls}">${tag} <b>${_esc(ev.attackerName)}</b>の「${_esc(ev.skillName)}」→ <b>${_esc(ev.targetName)}</b>に <em>${ev.amount} ダメージ</em>！</span>`;
        break;
      }
      case 'miss':
        html = `<span class="vb-log-miss">💨 <b>${_esc(ev.attackerName)}</b>の攻撃！ <b>${_esc(ev.targetName)}</b>は回避！(MISS)</span>`;
        break;
      case 'heal':
        html = `<span class="vb-log-heal">💚 <b>${_esc(ev.healerName)}</b>の回復！ <b>${_esc(ev.targetName)}</b>を <em>${ev.amount} 回復</em>！</span>`;
        break;
      case 'ko':
        html = `<span class="vb-log-ko">💥 <b>${_esc(ev.fighterName)}</b> は力尽き倒れた！</span>`;
        break;
      case 'skill':
        html = ev.isBattleStart
          ? `<span class="vb-log-skill">🌟【開幕スキル】<b>${_esc(ev.casterName)}</b>の「${_esc(ev.skillName)}」発動！</span>`
          : `<span class="vb-log-skill">✨ <b>${_esc(ev.casterName)}</b>の「${_esc(ev.skillName)}」が発動！</span>`;
        break;
      case 'battle_end': {
        const msg = ev.winner === 'draw' ? '🤝 引き分け！' : `🏆 【${_esc(ev.winnerName)}】の勝利！`;
        html = `<span class="vb-log-win">${msg}</span>`;
        break;
      }
      default:
        html = ev.text ? `<span class="vb-log-normal">${_esc(ev.text)}</span>` : '';
    }
    row.innerHTML = html;
  }

  /* ─── アニメーション ────────────────────────────── */

  function _playAnim(ev) {
    switch (ev.type) {

      case 'damage': {
        const tCard = document.getElementById(`vb-card-${ev.targetId}`);
        const aCard = document.getElementById(`vb-card-${ev.attackerId}`);

        if (ev.isSpecial) {
          // 必殺技: 白フラッシュ + 巨大赤数字
          _flash('rgba(255,255,255,0.7)');
          if (tCard) { _cls(tCard, 'vb-anim-hit'); _num(tCard, `-${ev.amount}`, 'vb-num-special'); }

        } else if (ev.isCritical) {
          // クリティカル: 赤フラッシュ + 赤数字
          _flash('rgba(255,60,60,0.4)');
          if (tCard) { _cls(tCard, 'vb-anim-hit'); _num(tCard, `-${ev.amount}`, 'vb-num-crit'); }

        } else if (ev.isSkillDamage) {
          // スキルダメージ: 紫フラッシュ + 紫数字
          _flash('rgba(130,60,210,0.3)');
          if (tCard) { _cls(tCard, 'vb-anim-hit'); _num(tCard, `-${ev.amount}`, 'vb-num-skill'); }

        } else {
          // 通常攻撃
          if (tCard) { _cls(tCard, 'vb-anim-hit'); _num(tCard, `-${ev.amount}`, 'vb-num-dmg'); }
        }

        if (aCard) _cls(aCard, 'vb-anim-attack');
        break;
      }

      case 'miss': {
        // 回避: 横ブレ + MISS テキスト
        const tCard = document.getElementById(`vb-card-${ev.targetId}`);
        if (tCard) {
          _cls(tCard, 'vb-anim-dodge');
          const el = document.createElement('div');
          el.className  = 'vb-miss-popup';
          el.textContent = 'MISS';
          tCard.appendChild(el);
          el.addEventListener('animationend', () => el.remove(), { once: true });
        }
        break;
      }

      case 'heal': {
        const tCard = document.getElementById(`vb-card-${ev.targetId}`);
        if (tCard) { _cls(tCard, 'vb-anim-heal'); _num(tCard, `+${ev.amount}`, 'vb-num-heal'); }
        break;
      }

      case 'skill': {
        const cCard = document.getElementById(`vb-card-${ev.casterId}`);
        if (cCard) {
          if (ev.isBattleStart) {
            _flash('rgba(255,215,0,0.25)');
            _cls(cCard, 'vb-anim-open-skill');   // 金オーラ
          } else {
            _cls(cCard, 'vb-anim-skill');         // 通常スキル輝き
          }
        }
        break;
      }

      case 'ko': {
        const fCard = document.getElementById(`vb-card-${ev.fighterId}`);
        if (fCard) {
          _flash('rgba(0,0,0,0.3)');
          _cls(fCard, 'vb-anim-ko');
        }
        break;
      }

      case 'battle_end':
        if (ev.winner !== 'draw') _flash('rgba(255,215,0,0.35)');
        break;
    }
  }

  /* ─── SE 再生 ───────────────────────────────────── */

  function _playSE(ev) {
    if (typeof SoundManager === 'undefined') return;
    switch (ev.type) {
      case 'damage':
        if      (ev.isSpecial)     SoundManager.playSE('special');    // 必殺技: 重厚斬撃
        else if (ev.isCritical)    SoundManager.playSE('critical');   // クリティカル
        else if (ev.isSkillDamage) SoundManager.playSE('skill');      // スキルダメージ: 神秘SE
        else                       SoundManager.playSE('attack');     // 通常攻撃: バシッ
        break;
      case 'heal':         SoundManager.playSE('heal');          break; // キラキラ回復音
      case 'miss':         SoundManager.playSE('miss');          break; // スッ…回避音
      case 'ko':           SoundManager.playSE('ko');            break; // 重厚ダウン音
      case 'skill':        SoundManager.playSE('skill');         break; // 神秘スキル音
      case 'battle_start': SoundManager.playSE('battle_start');  break;
      case 'battle_end':   SoundManager.playSE('battle_end');    break;
    }
  }

  /* ─── カード DOM 更新 ───────────────────────────── */

  function _updateCard(id, hp, alive, animate) {
    const card   = document.getElementById(`vb-card-${id}`);
    const hpBar  = document.getElementById(`vb-hpbar-${id}`);
    const hpText = document.getElementById(`vb-hptext-${id}`);
    if (!card) return;

    const maxHp = parseInt(card.dataset.maxhp) || 1;
    const pct   = Math.max(0, Math.min(100, (hp / maxHp) * 100));

    if (hpBar) {
      hpBar.style.width = pct + '%';
      if      (pct > 60) hpBar.style.background = 'linear-gradient(90deg,#22c55e,#4ade80)';
      else if (pct > 30) hpBar.style.background = 'linear-gradient(90deg,#f59e0b,#fbbf24)';
      else               hpBar.style.background = 'linear-gradient(90deg,#ef4444,#f87171)';
    }
    if (hpText)
      hpText.innerHTML = `${hp}<span style="opacity:.6;font-size:.75em">/${maxHp}</span>`;

    if (!alive) card.classList.add('vb-card-dead');
    else        card.classList.remove('vb-card-dead');
  }

  /* ─── 自動再生 ──────────────────────────────────── */

  function _startAuto() {
    if (!vbData) return;
    autoActive = true;
    const btn = document.getElementById('vb-auto-btn');
    if (btn) { btn.textContent = '⏸ 停止'; btn.classList.add('vb-auto-active'); }
    if (vbBgmOn && typeof SoundManager !== 'undefined') SoundManager.startBattleBGM();

    autoTimer = setInterval(() => {
      if (!vbData || currentStep >= vbData.events.length - 1) { _stopAuto(); return; }
      currentStep++;
      _resetHpState();
      _applyUpTo(currentStep);
      _showStep(currentStep, true);
    }, 550);
  }

  function _stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    autoActive = false;
    const btn = document.getElementById('vb-auto-btn');
    if (btn) { btn.textContent = '▶ 自動再生'; btn.classList.remove('vb-auto-active'); }
  }

  /* ─── 画面フラッシュ ────────────────────────────── */

  function _flash(color) {
    const ov = document.getElementById('vb-flash-overlay');
    if (!ov) return;
    ov.style.background = color;
    ov.classList.remove('vb-flash-active');
    void ov.offsetWidth;
    ov.classList.add('vb-flash-active');
    ov.addEventListener('animationend', () => ov.classList.remove('vb-flash-active'), { once: true });
  }

  /* ─── ユーティリティ ────────────────────────────── */

  function _roleIcon(role) {
    return { melee:'⚔️', ranged:'🏹', mage:'🔮', healer:'💚', tank:'🛡️' }[role] || '⚔️';
  }

  function _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /** CSS クラスをリセット→付与してアニメーション再実行 */
  function _cls(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  /** カード上にフローティング数字を生成 */
  function _num(cardEl, text, cls) {
    const el = document.createElement('div');
    el.className  = 'vb-float-num ' + cls;
    el.textContent = text;
    cardEl.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

})();
