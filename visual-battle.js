/**
 * visual-battle.js - ビジュアルアニメーションバトル（新ゲームモード）
 * 既存の文字ログバトル(battle.js)のロジックを流用し、
 * 前衛/後衛のカードUI・HPバー・状態異常アイコン・攻撃/被弾/回復アニメーションで
 * バトルの様子を視覚的に再生する。
 */

(function () {
  'use strict';

  let vbFighters = [];        // 全ファイター（表示用スナップショット + 戦闘用コピー）
  let vbDisplay = {};         // uid -> { hp, maxHp, statuses:Set }
  let vbEvents = [];
  let vbSkip = false;
  let vbRunning = false;
  let p1NameG = '1P チーム';
  let p2NameG = '2P チーム';

  const sleep = (ms) => new Promise(res => setTimeout(res, vbSkip ? 0 : ms));
  const esc = (s) => (typeof escapeHtml === 'function') ? escapeHtml(s) : (s || '');

  /* ============ ファイター構築 ============ */
  function buildVisualFighters(teamIds, teamLabel) {
    const charList = (appState.characters && appState.characters.length ? appState.characters : appState.localCharacters) || [];
    return teamIds.map((id, index) => {
      const c = charList.find(char => char.id === id);
      if (!c) return null;
      const formation = index < 5 ? 'front' : 'back';
      const hpVal = c.stats.maxHp || c.stats.hp || 0;
      const fighter = {
        ...JSON.parse(JSON.stringify(c)),
        uid: `${teamLabel}_${index}`,
        team: teamLabel === 'p1' ? '1P' : '2P',
        teamLabel: teamLabel,
        teamIndex: index,
        currentHp: hpVal,
        formation: formation,
        targetWeight: 1,
        specialMultiplier: 1.5,
        skillActivatedThisTurn: false
      };
      if (typeof applyRolePassive === 'function') applyRolePassive(fighter);
      return fighter;
    }).filter(f => f !== null);
  }

  /* ============ シミュレーション（イベント記録） ============ */
  function simulate(p1, p2) {
    const events = [];
    const alive = (arr) => arr.filter(f => f.currentHp > 0);

    // 戦闘開始時スキル
    [...p1, ...p2].forEach(f => {
      if (f.currentHp <= 0 || !f.customSkill) return;
      if (!ROLES[f.role] || !ROLES[f.role].canUseSkill) return;
      const r = executeCustomSkill(f, null, f.customSkill, 1, 'on_battle_start');
      if (r.activated) {
        events.push({ type: 'skill', srcId: f.uid, name: r.skillName });
        if (r.buffAtk > 0) { f.stats.atk += r.buffAtk; events.push({ type: 'buff', tgtId: f.uid, icon: '⚡', label: `ATK+${r.buffAtk}` }); }
        if (r.buffDef > 0) { f.stats.def += r.buffDef; events.push({ type: 'buff', tgtId: f.uid, icon: '🛡️', label: `DEF+${r.buffDef}` }); }
      }
    });

    let turn = 1;
    const maxTurns = 50;

    while (turn <= maxTurns) {
      const a1 = alive(p1), a2 = alive(p2);
      if (a1.length === 0 || a2.length === 0) break;
      events.push({ type: 'turn', n: turn });

      // ヒーラー: 4ターンに1度のパッシブ回復（専用の独立カウンター）
      [...a1, ...a2].forEach(f => {
        if (!f.isHealer || f.currentHp <= 0) return;
        f.passiveHealCounter = (f.passiveHealCounter || 0) + 1;
        if (f.passiveHealCounter < 4) return;
        f.passiveHealCounter = 0;
        const allies = (f.team === '1P' ? p1 : p2).filter(a => a.currentHp > 0 && a.currentHp < (a.stats.maxHp || a.stats.hp));
        if (allies.length === 0) return;
        const heal = Math.floor((f.stats.atk || 0) * (f.healMultiplier || 1.4));
        events.push({ type: 'skill', srcId: f.uid, name: '自動全体回復（パッシブ）' });
        allies.forEach(t => {
          t.currentHp = Math.min(t.stats.maxHp || t.stats.hp, t.currentHp + heal);
          events.push({ type: 'heal', srcId: f.uid, tgtId: t.uid, amount: heal });
        });
      });

      const queue = [...a1, ...a2].sort((a, b) => {
        const spd = (b.stats.spd || b.stats.eva || 0) - (a.stats.spd || a.stats.eva || 0);
        if (spd !== 0) return spd;
        if (a.team !== b.team) return a.team === '1P' ? -1 : 1;
        return a.teamIndex - b.teamIndex;
      });

      const skipped = new Set();

      for (const attacker of queue) {
        if (attacker.currentHp <= 0) continue;
        if (skipped.has(attacker.uid)) { events.push({ type: 'stunned', srcId: attacker.uid }); skipped.delete(attacker.uid); continue; }

        const enemyTeam = (attacker.team === '1P' ? p2 : p1).filter(f => f.currentHp > 0);
        const allyTeam = (attacker.team === '1P' ? p1 : p2);
        if (enemyTeam.length === 0) break;
        attacker.skillActivatedThisTurn = false;

        // ヒーラー: 通常攻撃不可。スキルのみ（毎ターン自動回復はしない）
        if (attacker.isHealer) {
          if (attacker.customSkill && ROLES[attacker.role] && ROLES[attacker.role].canUseSkill) {
            const r = executeCustomSkill(attacker, null, attacker.customSkill, turn, 'on_attack_start');
            if (r.activated) {
              events.push({ type: 'skill', srcId: attacker.uid, name: r.skillName });
              if (r.heal > 0) {
                const ts = resolveSkillTargets(attacker, allyTeam, enemyTeam, attacker.customSkill);
                (ts.length ? ts : [attacker]).forEach(t => {
                  t.currentHp = Math.min(t.stats.maxHp || t.stats.hp, t.currentHp + r.heal);
                  events.push({ type: 'heal', srcId: attacker.uid, tgtId: t.uid, amount: r.heal });
                });
              }
              if (r.buffAtk > 0) { attacker.stats.atk += r.buffAtk; events.push({ type: 'buff', tgtId: attacker.uid, icon: '⚡', label: `ATK+${r.buffAtk}` }); }
              if (r.buffDef > 0) { attacker.stats.def += r.buffDef; events.push({ type: 'buff', tgtId: attacker.uid, icon: '🛡️', label: `DEF+${r.buffDef}` }); }
            }
          }
          continue;
        }

        // 攻撃開始時スキル
        if (attacker.customSkill && ROLES[attacker.role] && ROLES[attacker.role].canUseSkill) {
          const r = executeCustomSkill(attacker, null, attacker.customSkill, turn, 'on_attack_start');
          if (r.activated) {
            attacker.skillActivatedThisTurn = true;
            events.push({ type: 'skill', srcId: attacker.uid, name: r.skillName });

            if (r.isTimeStop) {
              const ea = attacker.team === '1P' ? p2 : p1;
              ea.forEach(e => { if (e.currentHp > 0) skipped.add(e.uid); });
              events.push({ type: 'timestop', srcId: attacker.uid });
            }
            if (r.buffAtk > 0) { attacker.stats.atk += r.buffAtk; events.push({ type: 'buff', tgtId: attacker.uid, icon: '⚡', label: `ATK+${r.buffAtk}` }); }
            if (r.buffDef > 0) { attacker.stats.def += r.buffDef; events.push({ type: 'buff', tgtId: attacker.uid, icon: '🛡️', label: `DEF+${r.buffDef}` }); }
            if (r.heal > 0) {
              attacker.currentHp = Math.min(attacker.stats.maxHp || attacker.stats.hp, attacker.currentHp + r.heal);
              events.push({ type: 'heal', srcId: attacker.uid, tgtId: attacker.uid, amount: r.heal });
            }
            if (r.bonusDamage > 0) {
              const resolved = resolveSkillTargets(attacker, allyTeam, enemyTeam, attacker.customSkill);
              const hitList = resolved.length ? resolved : (selectTarget(enemyTeam) ? [selectTarget(enemyTeam)] : []);
              const hits = (r.comboHits && r.comboHits > 1) ? r.comboHits : 1;
              hitList.forEach(target => {
                events.push({ type: 'attack', srcId: attacker.uid });
                if (hits > 1) {
                  const per = Math.floor(r.bonusDamage / hits);
                  let dealt = 0;
                  for (let h = 0; h < hits; h++) {
                    const dmg = (h === hits - 1) ? (r.bonusDamage - dealt) : per;
                    dealt += dmg;
                    target.currentHp = Math.max(0, target.currentHp - dmg);
                    events.push({ type: 'damage', srcId: attacker.uid, tgtId: target.uid, amount: dmg, combo: `${h + 1}/${hits}` });
                    if (target.currentHp <= 0) { events.push({ type: 'ko', tgtId: target.uid }); break; }
                  }
                } else {
                  target.currentHp = Math.max(0, target.currentHp - r.bonusDamage);
                  events.push({ type: 'damage', srcId: attacker.uid, tgtId: target.uid, amount: r.bonusDamage });
                  if (target.currentHp <= 0) events.push({ type: 'ko', tgtId: target.uid });
                }
              });
            }
            if (r.stun) { const t = selectTarget(enemyTeam); if (t) { skipped.add(t.uid); events.push({ type: 'debuff', tgtId: t.uid, icon: '💫', label: 'スタン' }); } }
            if (r.debuffDef > 0) { const t = selectTarget(enemyTeam); if (t) { t.stats.def = Math.max(0, (t.stats.def || 0) - r.debuffDef); events.push({ type: 'debuff', tgtId: t.uid, icon: '🔻', label: `DEF-${r.debuffDef}` }); } }
            if (r.damageUp > 0) { const t = selectTarget(enemyTeam); if (t) { t.damageUpMultiplier = 1 + r.damageUp; events.push({ type: 'debuff', tgtId: t.uid, icon: '🔺', label: `被ダメ+${Math.floor(r.damageUp * 100)}%` }); } }
            continue;
          }
        }

        // 通常攻撃
        const target = selectTarget(enemyTeam);
        if (!target) continue;
        events.push({ type: 'attack', srcId: attacker.uid });

        const evaVal = target.stats.eva || target.stats.spd || 0;
        const evaPercent = Math.min(50, Math.floor(evaVal / 3));
        if ((Math.random() * 100) < evaPercent) {
          events.push({ type: 'miss', srcId: attacker.uid, tgtId: target.uid });
          continue;
        }

        const isSpecial = Math.random() < 0.10;
        const damage = calculateDamage(attacker, target, isSpecial);
        target.currentHp = Math.max(0, target.currentHp - damage);
        events.push({ type: 'damage', srcId: attacker.uid, tgtId: target.uid, amount: damage, special: isSpecial });
        if (target.currentHp <= 0) events.push({ type: 'ko', tgtId: target.uid });
      }

      turn++;
    }

    // 勝敗判定
    const p1Dead = p1.filter(f => f.currentHp <= 0).length;
    const p2Dead = p2.filter(f => f.currentHp <= 0).length;
    const p1Surv = p1.length - p1Dead;
    const p2Surv = p2.length - p2Dead;
    let resultText;
    if (p1Surv > 0 && p2Surv === 0) resultText = `🏆 勝者: ${p1NameG}！`;
    else if (p2Surv > 0 && p1Surv === 0) resultText = `🏆 勝者: ${p2NameG}！`;
    else if (p1Dead < p2Dead) resultText = `🏆 判定勝ち: ${p1NameG}（死亡者数が少ない）`;
    else if (p2Dead < p1Dead) resultText = `🏆 判定勝ち: ${p2NameG}（死亡者数が少ない）`;
    else resultText = '🤝 引き分け！';
    events.push({ type: 'result', text: resultText });

    return events;
  }

  /* ============ 盤面描画 ============ */
  function fighterByUid(uid) { return vbFighters.find(f => f.uid === uid); }

  function renderCard(f) {
    const roleLabel = (typeof getRoleLabel === 'function') ? getRoleLabel(f.role) : '';
    return `
      <div class="vb-card" id="vb-card-${f.uid}" data-team="${f.teamLabel}">
        <div class="vb-popup-layer" id="vb-popup-${f.uid}"></div>
        <div class="vb-card-name">${esc(f.name)}</div>
        <div class="vb-card-role">${esc(roleLabel)}</div>
        <div class="vb-hpbar"><div class="vb-hpbar-fill" id="vb-hp-${f.uid}"></div></div>
        <div class="vb-hp-text" id="vb-hptext-${f.uid}"></div>
        <div class="vb-status" id="vb-status-${f.uid}"></div>
      </div>`;
  }

  function renderTeamColumn(fighters, label, teamName) {
    const front = fighters.filter(f => f.formation === 'front');
    const back = fighters.filter(f => f.formation === 'back');
    const cards = (arr) => arr.length ? arr.map(renderCard).join('') : '<div class="vb-empty">（なし）</div>';
    // p1は「後衛→前衛」の順（左が後方）、p2は「前衛→後衛」で向かい合う配置
    const rows = label === 'p1'
      ? `<div class="vb-row"><span class="vb-row-tag">後衛</span><div class="vb-row-cards">${cards(back)}</div></div>
         <div class="vb-row"><span class="vb-row-tag">前衛</span><div class="vb-row-cards">${cards(front)}</div></div>`
      : `<div class="vb-row"><span class="vb-row-tag">前衛</span><div class="vb-row-cards">${cards(front)}</div></div>
         <div class="vb-row"><span class="vb-row-tag">後衛</span><div class="vb-row-cards">${cards(back)}</div></div>`;
    return `<div class="vb-team vb-team-${label}"><div class="vb-team-name">${esc(teamName)}</div>${rows}</div>`;
  }

  function renderBoard() {
    const p1 = vbFighters.filter(f => f.teamLabel === 'p1');
    const p2 = vbFighters.filter(f => f.teamLabel === 'p2');
    const board = document.getElementById('vb-board');
    board.innerHTML =
      renderTeamColumn(p1, 'p1', p1NameG) +
      '<div class="vb-vs">VS</div>' +
      renderTeamColumn(p2, 'p2', p2NameG);
    vbFighters.forEach(updateHpBar);
  }

  function updateHpBar(f) {
    const st = vbDisplay[f.uid];
    const fill = document.getElementById(`vb-hp-${f.uid}`);
    const text = document.getElementById(`vb-hptext-${f.uid}`);
    if (!st || !fill) return;
    const pct = st.maxHp > 0 ? Math.max(0, Math.floor((st.hp / st.maxHp) * 100)) : 0;
    fill.style.width = pct + '%';
    fill.className = 'vb-hpbar-fill' + (pct <= 25 ? ' vb-hp-low' : pct <= 55 ? ' vb-hp-mid' : '');
    if (text) text.textContent = `${st.hp} / ${st.maxHp}`;
  }

  function popup(uid, txt, cls) {
    const layer = document.getElementById(`vb-popup-${uid}`);
    if (!layer) return;
    const el = document.createElement('span');
    el.className = 'vb-popup ' + (cls || '');
    el.textContent = txt;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function addStatus(uid, icon, label) {
    const st = vbDisplay[uid];
    if (!st) return;
    st.statuses = st.statuses || [];
    st.statuses.push({ icon, label });
    const box = document.getElementById(`vb-status-${uid}`);
    if (box) box.innerHTML = st.statuses.map(s => `<span class="vb-badge" title="${esc(s.label)}">${s.icon}</span>`).join('');
  }

  function setLog(txt) {
    const el = document.getElementById('vb-log');
    if (el) el.textContent = txt;
  }

  /* ============ アニメーション再生 ============ */
  async function playEvents() {
    for (const ev of vbEvents) {
      if (!vbRunning) return;
      switch (ev.type) {
        case 'turn':
          setLog(`--- ターン ${ev.n} ---`);
          await sleep(500);
          break;
        case 'skill': {
          const f = fighterByUid(ev.srcId);
          if (f) { setLog(`✨ ${f.name} の「${ev.name}」発動！`); flash(ev.srcId, 'vb-skill'); }
          await sleep(450);
          break;
        }
        case 'attack': {
          const card = document.getElementById(`vb-card-${ev.srcId}`);
          if (card) { card.classList.add('vb-attack'); setTimeout(() => card.classList.remove('vb-attack'), 350); }
          await sleep(180);
          break;
        }
        case 'damage': {
          const t = fighterByUid(ev.tgtId), s = fighterByUid(ev.srcId);
          const st = vbDisplay[ev.tgtId];
          if (st) { st.hp = Math.max(0, st.hp - ev.amount); }
          const card = document.getElementById(`vb-card-${ev.tgtId}`);
          if (card) { card.classList.add('vb-hit'); setTimeout(() => card.classList.remove('vb-hit'), 400); }
          popup(ev.tgtId, `-${ev.amount}`, ev.special ? 'vb-pop-crit' : 'vb-pop-dmg');
          updateHpBar(t);
          if (s && t) setLog(`${ev.special ? '🔥【必殺】' : '⚔️'} ${s.name} → ${t.name} に ${ev.amount} ダメージ${ev.combo ? `（${ev.combo}）` : ''}`);
          await sleep(ev.combo ? 240 : 420);
          break;
        }
        case 'heal': {
          const t = fighterByUid(ev.tgtId);
          const st = vbDisplay[ev.tgtId];
          if (st) st.hp = Math.min(st.maxHp, st.hp + ev.amount);
          flash(ev.tgtId, 'vb-heal');
          popup(ev.tgtId, `+${ev.amount}`, 'vb-pop-heal');
          updateHpBar(t);
          await sleep(360);
          break;
        }
        case 'buff': {
          flash(ev.tgtId, 'vb-buff');
          popup(ev.tgtId, ev.label, 'vb-pop-buff');
          addStatus(ev.tgtId, ev.icon, ev.label);
          await sleep(360);
          break;
        }
        case 'debuff': {
          flash(ev.tgtId, 'vb-hit');
          popup(ev.tgtId, ev.label, 'vb-pop-debuff');
          addStatus(ev.tgtId, ev.icon, ev.label);
          await sleep(360);
          break;
        }
        case 'miss': {
          popup(ev.tgtId, 'MISS', 'vb-pop-miss');
          await sleep(320);
          break;
        }
        case 'stunned': {
          const f = fighterByUid(ev.srcId);
          if (f) setLog(`💫 ${f.name} は行動できない！`);
          popup(ev.srcId, '行動不能', 'vb-pop-miss');
          await sleep(320);
          break;
        }
        case 'timestop':
          setLog('⏸️ 時が止まった！');
          await sleep(500);
          break;
        case 'ko': {
          const card = document.getElementById(`vb-card-${ev.tgtId}`);
          if (card) card.classList.add('vb-dead');
          const t = fighterByUid(ev.tgtId);
          if (t) setLog(`💥 ${t.name} は力尽きた！`);
          await sleep(420);
          break;
        }
        case 'result':
          setLog(ev.text);
          showResult(ev.text);
          await sleep(200);
          break;
      }
    }
    vbRunning = false;
    const skipBtn = document.getElementById('vb-skip-btn');
    if (skipBtn) skipBtn.style.display = 'none';
  }

  function flash(uid, cls) {
    const card = document.getElementById(`vb-card-${uid}`);
    if (!card) return;
    card.classList.add(cls);
    setTimeout(() => card.classList.remove(cls), 500);
  }

  function showResult(text) {
    const banner = document.getElementById('vb-result-banner');
    if (banner) { banner.textContent = text; banner.style.display = 'block'; }
    if (typeof playSE === 'function') playSE('battle_end');
  }

  /* ============ 起動 / 終了 ============ */
  function open() {
    if (typeof syncTeamSlots === 'function') syncTeamSlots();
    if (!appState.p1Team.filter(Boolean).length || !appState.p2Team.filter(Boolean).length) {
      return alert('1P・2Pの両方のチームに1体以上選択してください！');
    }

    p1NameG = appState.p1Name || (document.getElementById('p1-team-name-input') || {}).value || '1Pチーム';
    p2NameG = appState.p2Name || (document.getElementById('p2-team-name-input') || {}).value || '2Pチーム';

    const p1 = buildVisualFighters(appState.p1Team.filter(Boolean), 'p1');
    const p2 = buildVisualFighters(appState.p2Team.filter(Boolean), 'p2');
    vbFighters = [...p1, ...p2];

    // 表示用スナップショット（開始時HP = maxHp）を作成してから戦闘計算を回す
    vbDisplay = {};
    vbFighters.forEach(f => {
      vbDisplay[f.uid] = { hp: f.currentHp, maxHp: f.stats.maxHp || f.stats.hp || 1, statuses: [] };
    });

    // 戦闘計算用のコピー（vbFightersを直接壊さないため deep copy）
    const simP1 = p1.map(f => JSON.parse(JSON.stringify(f)));
    const simP2 = p2.map(f => JSON.parse(JSON.stringify(f)));
    vbEvents = simulate(simP1, simP2);

    const modal = document.getElementById('visual-battle-modal');
    modal.style.display = 'flex';
    const banner = document.getElementById('vb-result-banner');
    if (banner) banner.style.display = 'none';
    const skipBtn = document.getElementById('vb-skip-btn');
    if (skipBtn) skipBtn.style.display = 'inline-block';
    renderBoard();
    setLog('バトル開始！');

    vbSkip = false;
    vbRunning = true;
    if (typeof playSE === 'function') playSE('battle_start');
    playEvents();
  }

  function close() {
    vbRunning = false;
    const modal = document.getElementById('visual-battle-modal');
    if (modal) modal.style.display = 'none';
  }

  function skip() { vbSkip = true; }

  window.openVisualBattle = open;
  window.closeVisualBattle = close;
  window.skipVisualBattle = skip;
})();
