// Gemini API 連携モジュール (gemini-3.5-flash-lite)

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function saveApiKey() {
  const keyInput = document.getElementById('gemini-api-key');
  if (!keyInput || !keyInput.value.trim()) return alert('API Keyを入力してください');
  const key = keyInput.value.trim();
  localStorage.setItem('gemini_api_key', key);
  updateApiKeyStatus(true);
  alert('API Keyを保存しました');
}

function loadApiKey() {
  const key = localStorage.getItem('gemini_api_key');
  updateApiKeyStatus(!!key);
  const input = document.getElementById('gemini-api-key');
  if (input && key) input.value = key;
}

function updateApiKeyStatus(isSet) {
  const statusEl = document.getElementById('api-key-status');
  if (isSet) {
    statusEl.textContent = '鍵 設定済み (利用可能)';
    statusEl.style.color = '#4ade80';
  } else {
    statusEl.textContent = '未設定';
    statusEl.style.color = '#ef4444';
  }
}

function saveApiKeySettings() {
  const keyInput = document.getElementById('settings-gemini-api-key');
  if (!keyInput) return;
  const key = keyInput.value.trim();
  if (!key) return alert('API Keyを入力してください');
  localStorage.setItem('gemini_api_key', key);
  updateApiKeyStatusSettings(true);
  if (typeof loadApiKey === 'function') loadApiKey();
  alert('API Keyを保存しました');
}

function updateApiKeyStatusSettings(isSet) {
  const statusEl = document.getElementById('settings-api-key-status');
  if (!statusEl) return;
  if (isSet) {
    statusEl.textContent = '鍵 設定済み (利用可能)';
    statusEl.style.color = '#4ade80';
  } else {
    statusEl.textContent = '未設定';
    statusEl.style.color = '#ef4444';
  }
}

function loadApiKeySettings() {
  const key = localStorage.getItem('gemini_api_key');
  const input = document.getElementById('settings-gemini-api-key');
  if (input && key) input.value = key;
  updateApiKeyStatusSettings(!!key);
}

// AI小説生成ボタン
document.addEventListener('DOMContentLoaded', () => {
  const genBtn = document.getElementById('generate-story-btn');
  if (genBtn) {
    genBtn.addEventListener('click', generateBattleNovel);
  }
});

/* ===================================================
   役職制約テキスト生成
   =================================================== */
function getRoleConstraintText(roleKey) {
  const roleDef = (typeof ROLES !== 'undefined') ? ROLES[roleKey] : null;
  if (!roleDef) return '制限なし';

  switch (roleKey) {
    case 'healer':
      return '【厳守】ヒーラー役職のため、攻撃系スキル（damage, combo, lifesteal, stun）は厳禁です。回復（heal）、防御バフ（buff_def）、攻撃バフ（buff_atk）のみ生成可能です。';
    case 'tank':
      return 'タンク役職のため、防御バフ（buff_def）、自己回復（heal）、被ダメージ減少系のスキルを推奨します。攻撃スキルも可能ですが防御寄りで生成してください。';
    case 'mage':
      return '魔術師役職のため、魔法攻撃系スキル（damage, debuff_def, damage_up）を推奨します。';
    case 'ranged':
      return '遠距離物理役職のため、物理攻撃系スキル（damage, combo）を推奨します。';
    case 'melee':
      return '近接物理役職のため、物理攻撃系スキル（damage, combo, lifesteal, stun）を推奨します。';
    default:
      return '制限なし';
  }
}

async function generateSkillCandidates(prefix = '') {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) {
    return alert('設定タブからGemini API Keyを設定してください！');
  }

  const inputId = prefix === 'edit-' ? 'edit-char-skill-input' : 'char-skill-input';
  const inputEl = document.getElementById(inputId);
  if (!inputEl) return;
  const userText = inputEl.value.trim();
  if (!userText) {
    return alert('特殊能力のアイデアを入力してください');
  }

  const roleEl = document.getElementById(`${prefix}char-role`);
  const roleKey = roleEl ? roleEl.value : 'melee';
  const roleLabel = (typeof getRoleLabel === 'function') ? getRoleLabel(roleKey) : roleKey;
  const roleConstraint = getRoleConstraintText(roleKey);

  const boxId = prefix === 'edit-' ? 'edit-skill-candidates-box' : 'skill-candidates-box';
  const statusId = prefix === 'edit-' ? 'edit-skill-status-display' : 'skill-status-display';
  const box = document.getElementById(boxId);
  const statusEl = document.getElementById(statusId);

  if (box) box.innerHTML = '<p style="color:var(--text-sub); font-size:0.85rem;">🤖 Geminiがスキル候補を生成中...</p>';
  if (statusEl) statusEl.textContent = '生成中...';

  const prompt = `あなたはRPGのバランス設計者です。以下のユーザーの特殊能力アイデアをもとに、3つの異なるバリエーションのスキル候補を生成してください。

【ユーザーの入力】
${userText}

【選択された役職】
${roleLabel}

【役職制約 — これに違反してはいけません】
${roleConstraint}

【ルール】
1. 各スキルの「消費ポイント（cost）」は80以上の整数値で、能力の強さに応じて80〜150の範囲で評価してください。80ptが最小基準です。
2. 各スキルは以下のJSON構造で出力してください:
{
  "name": "スキル名",
  "description": "スキルの説明文（1〜2文）",
  "condition": "発動条件（以下のいずれかの形式で指定: 常時, バトル開始時, 攻撃開始時, 被弾時, 撃破時, Nターン毎, HP XX%以下, HP XX%以上, Nターン以降, Nターン以内, 先制/第1ターン, 時止め）",
  "probability": 発動確率の数値（0〜100）,
  "target": "対象（例: 単体, 全体, 自分, 味方全体）",
  "effectType": "効果種別（damage, heal, buff_atk, buff_def, debuff_def, damage_up, stun, combo, lifesteal のいずれか）",
  "effectValue": 効果量の数値,
  "duration": 持続ターン数の数値（0なら即時）,
  "cost": 消費ポイント（80以上の整数）
}
3. 3つの候補は、コストや効果の強さ・発動条件が異なるバリエーションにしてください。
4. 上記「役職制約」に違反するスキル（例: ヒーラーに攻撃スキル）は絶対に生成しないでください。
5. 必ずJSON配列のみを出力してください。説明文やマークダウンは不要です。

出力例:
[{"name":"紅蓮の剣舞","description":"炎を纏った剣で全体攻撃","condition":"常時","probability":80,"target":"全体","effectType":"damage","effectValue":120,"duration":0,"cost":80},{...},{...}]`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 2048 }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`APIエラー: ${response.status} (${errorData.error?.message || '詳細不明'})`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let jsonStr = rawText.trim();
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();

    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error('AIからの応答にJSON配列が見つかりませんでした');
    }

    let candidates;
    try {
      candidates = JSON.parse(match[0]);
    } catch (e) {
      throw new Error('AIの応答をJSONとして解析できませんでした');
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('スキル候補が生成されませんでした');
    }

    candidates = candidates.map(c => ({
      name: c.name || '名称不明',
      description: c.description || '',
      condition: c.condition || '常時',
      probability: Math.min(100, Math.max(0, c.probability || 100)),
      target: c.target || '単体',
      effectType: c.effectType || 'damage',
      damageUp: c.effectType === 'damage_up' ? Math.min(100, Math.floor(c.effectValue || 30)) : 0,
      effectValue: Math.max(0, c.effectValue || 0),
      duration: Math.max(0, c.duration || 0),
      cost: Math.max(80, Math.floor(c.cost || 80))
    }));

    // 役職制約の事後フィルター: ヒーラーに攻撃スキルが混ざった場合は除外
    if (roleKey === 'healer') {
      const attackTypes = ['damage', 'combo', 'lifesteal', 'stun'];
      candidates = candidates.filter(c => !attackTypes.includes(c.effectType));
      if (candidates.length === 0) {
        candidates = [{
          name: '癒やしの風',
          description: '味方全体のHPを回復する',
          condition: '常時',
          probability: 100,
          target: '味方全体',
          effectType: 'heal',
          effectValue: 100,
          duration: 0,
          cost: 80,
          damageUp: 0
        }];
      }
    }

    if (prefix === 'edit-') {
      window._editSkillCandidates = candidates;
    } else {
      window._skillCandidates = candidates;
    }

    if (typeof renderSkillCandidates === 'function') {
      renderSkillCandidates(candidates, prefix, -1);
    }
    if (statusEl) statusEl.textContent = `${candidates.length}件の候補が生成されました。クリックして選択してください。`;

  } catch (error) {
    console.error(error);
    if (box) box.innerHTML = '';
    if (statusEl) statusEl.textContent = `エラー: ${error.message}`;
    alert(`スキル生成に失敗しました: ${error.message}`);
  }
}

async function generateBattleNovel() {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) {
    return alert('設定タブからGemini API Keyを設定してください！');
  }

  const battleLog = document.getElementById('battle-log').textContent;
  if (!battleLog || battleLog.includes('シミュレーションを実行すると')) {
    return alert('先に「自動バトル実行」を行ってログを出力させてください！');
  }

  const style = document.getElementById('novel-style-input').value.trim();
  const userContext = document.getElementById('novel-context-input').value.trim();
  const storyBox = document.getElementById('novel-story-box');

  storyBox.textContent = '✍️ Geminiが小説を執筆中...（数秒お待ちください）';

  const styleInstruction = style
    ? `指定された文章スタイル「${style}」で執筆してください。`
    : '現代ライトノベル風に、疾風怒濤のアクション描写とキャラクター同士の熱い掛け合いを中心に読みやすく執筆してください。';

  const prompt = `
あなたはプロの小説家・ファンタジー作家です。
以下の「バトル実況ログ」をもとに、臨場感あふれる熱いバトル小説を執筆してください。

【執筆ルール】
1. 指定された文章スタイル: ${styleInstruction}
2. キャラクターの「見た目・外見」「背景設定」「決めゼリフ」「必殺技」が実況ログに含まれています。これらを小説内に自然かつ魅力的に織り込み、設定通りの性格や口調で描いてください。
3. 以下の「場面・シチュエーション設定」が指定されている場合、その背景や時間帯、雰囲気などの情景描写を小説に反映させてください。
   [場面設定]: ${userContext ? userContext : '指定なし（ログの展開に合わせて自然に描く）'}
4. 戦闘の起承転結、キャラクターの葛藤や技の激突、決着の瞬間をドラマチックに描写してください。

【対象のバトル実況ログ】
${battleLog}
`;

  try {
    const response = await fetch(`${GEMINI_BASE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 4096 }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error Detail:', errorData);
      throw new Error(`APIエラー: ${response.status} (${errorData.error?.message || '詳細不明'})`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (generatedText) {
      storyBox.textContent = generatedText;
    } else {
      storyBox.textContent = '小説の生成に失敗しました。応答データが空です。';
    }

  } catch (error) {
    console.error(error);
    storyBox.textContent = `エラーが発生しました: ${error.message}`;
  }
}
