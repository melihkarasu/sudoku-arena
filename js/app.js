/**
 * Sudoku Arena — İstemci Taraflı Deterministik Sudoku Motoru
 * VibeCodedApps Standalone Sürüm
 * Sıfır dış API bağımlılığı • Tohumlu PRNG • Tekil çözüm garantili
 */

(function() {
  'use strict';

  // --- 1. SABİTLER VE DEPOLAMA ANAHTARLARI ---
  const STORAGE_ACTIVE_GAME = 'sudoku_active_game_v1';
  const STORAGE_ID_RECORDS = 'sudoku_id_records_v1';
  const STORAGE_LIFETIME_STATS = 'sudoku_lifetime_stats_v1';
  const STORAGE_LEADERBOARD = 'sudoku_leaderboard_v1';

  const DIFFICULTY_CONFIG = {
    easy:   { name: 'Kolay',   level: 1, symbol: '●○○○', symbolColor: 'text-blue-600',   clues: 38, baseScore: 500,  parTime: 360,  mult: 2 },
    medium: { name: 'Orta',    level: 2, symbol: '●●○○', symbolColor: 'text-indigo-400', clues: 32, baseScore: 1000, parTime: 600,  mult: 3 },
    hard:   { name: 'Zor',     level: 3, symbol: '●●●○', symbolColor: 'text-orange-500', clues: 28, baseScore: 2000, parTime: 900,  mult: 4 },
    expert: { name: 'Uzman',   level: 4, symbol: '●●●●', symbolColor: 'text-red-600',    clues: 24, baseScore: 3500, parTime: 1200, mult: 5 },
    daily:  { name: 'Günün',   level: 0, symbol: '',   symbolColor: 'text-amber-700',  clues: 30, baseScore: 2500, parTime: 600,  mult: 4 }
  };

  // --- 2. GÜVENLİK PROTOKOLLERİ (XSS SANİTİZASYONU & GÜVENLİ KOPYALAMA) ---
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeCopyToClipboard(text, successMsg) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg || 'Panoya kopyalandı!');
      }).catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(successMsg || 'Panoya kopyalandı!');
    } catch(e) {
      showToast('Kopyalama başarısız oldu');
    }
    document.body.removeChild(ta);
  }

  // --- 3. DETERMINISTIK PRNG (MULBERRY32) ---
  function mulberry32(seed) {
    let s = Math.floor(Math.abs(Number(seed) || 12345));
    if (s === 0) s = 12345;
    return function() {
      let t = s += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // --- 4. SUDOKU ÇÖZÜCÜ VE TEKİL ÇÖZÜM DENETLEYİCİ ---
  function solveCount(grid, limit) {
    let count = 0;
    function solve() {
      let empty = -1;
      for (let i = 0; i < 81; i++) {
        if (grid[i] === 0) { empty = i; break; }
      }
      if (empty === -1) { count++; return; }
      const r = Math.floor(empty / 9), c = empty % 9;
      const boxR = Math.floor(r / 3) * 3, boxC = Math.floor(c / 3) * 3;
      const used = new Uint8Array(10);
      for (let i = 0; i < 9; i++) {
        used[grid[r * 9 + i]] = 1;
        used[grid[i * 9 + c]] = 1;
        used[grid[(boxR + Math.floor(i / 3)) * 9 + (boxC + (i % 3))]] = 1;
      }
      for (let num = 1; num <= 9; num++) {
        if (!used[num]) {
          grid[empty] = num;
          solve();
          grid[empty] = 0;
          if (count >= limit) return;
        }
      }
    }
    solve();
    return count;
  }

  // --- 5. DETERMINISTIK BULMACA ÜRETİCİ ---
  function generateSudoku(seed, cluesTarget) {
    const rand = mulberry32(seed);
    const grid = new Array(81).fill(0);

    // Çapraz 3 bağımsız kutuyu doldur
    function fillBox(boxR, boxC) {
      const nums = [1,2,3,4,5,6,7,8,9];
      for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = nums[i]; nums[i] = nums[j]; nums[j] = temp;
      }
      for (let i = 0; i < 9; i++) {
        const r = boxR + Math.floor(i / 3);
        const c = boxC + (i % 3);
        grid[r * 9 + c] = nums[i];
      }
    }

    fillBox(0, 0);
    fillBox(3, 3);
    fillBox(6, 6);

    // Kalan hücreleri geriye izleme ile tam çözüme ulaştır
    function solveFull() {
      let empty = -1;
      for (let i = 0; i < 81; i++) {
        if (grid[i] === 0) { empty = i; break; }
      }
      if (empty === -1) return true;
      const r = Math.floor(empty / 9), c = empty % 9;
      const boxR = Math.floor(r / 3) * 3, boxC = Math.floor(c / 3) * 3;
      const used = new Uint8Array(10);
      for (let i = 0; i < 9; i++) {
        used[grid[r * 9 + i]] = 1;
        used[grid[i * 9 + c]] = 1;
        used[grid[(boxR + Math.floor(i / 3)) * 9 + (boxC + (i % 3))]] = 1;
      }
      const nums = [];
      for (let n = 1; n <= 9; n++) if (!used[n]) nums.push(n);
      for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = nums[i]; nums[i] = nums[j]; nums[j] = temp;
      }
      for (let idx = 0; idx < nums.length; idx++) {
        grid[empty] = nums[idx];
        if (solveFull()) return true;
        grid[empty] = 0;
      }
      return false;
    }

    solveFull();
    const solution = grid.slice();

    // Rastgele hücreleri silerek tekil çözümlü bulmaca oluştur
    const positions = Array.from({length: 81}, (_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const temp = positions[i]; positions[i] = positions[j]; positions[j] = temp;
    }

    let remaining = 81;
    const puzzle = grid.slice();
    for (let i = 0; i < positions.length; i++) {
      if (remaining <= cluesTarget) break;
      const pos = positions[i];
      const temp = puzzle[pos];
      puzzle[pos] = 0;
      const testGrid = puzzle.slice();
      if (solveCount(testGrid, 2) === 1) {
        remaining--;
      } else {
        puzzle[pos] = temp;
      }
    }

    return { puzzle, solution, clues: remaining };
  }

  // --- 6. OYUN DURUMU DEĞİŞKENLERİ ---
  let gameState = {
    puzzleId: 325,
    difficulty: 'medium',
    given: new Array(81).fill(false),
    board: new Array(81).fill(0),
    solution: new Array(81).fill(0),
    notes: Array.from({length: 81}, () => []),
    selectedCell: -1,
    noteMode: false,
    timerSec: 0,
    timerInterval: null,
    isPaused: false,
    isCompleted: false,
    mistakes: 0,
    hintsRemaining: 3,
    hintsUsed: 0,
    history: [],
    redoStack: [],
    hasPlayerMoved: false,
    inGame: false // Sayfa açılışında oyun başlamaz; lobi aktiftir
  };

  let lobbySelectedDifficulty = 'medium';

  // --- 7. GİZLİLİK MASKELEME KURALI (m*****u) ---
  // Kural: İlk karakter + tam 5 adet yıldız + son karakter (küçük harf)
  function maskUsername(raw) {
    const s = String(raw || 'misafir').trim().toLowerCase();
    if (!s) return 'm*****u';
    const first = s[0];
    const last = s[s.length - 1] || first;
    return `${first}*****${last}`;
  }

  // --- 8. BAŞLANGIÇ & LOBİ YÖNETİMİ ---
  function initGame() {
    setupDomEvents();
    updateLobbyDailyDate();
    updateLobbyDifficultyUI();

    // Monorepo veritabanı senkronizasyonu (varsa yarım kalan oyunu ve istatistikleri DB'den çek)
    if (typeof window.syncAppUserData === 'function') {
      window.syncAppUserData('sudoku').then(() => {
        if (!gameState.inGame) {
          checkLobbyUnfinishedGame();
        }
      }).catch(() => {});
    }
    window.addEventListener('vibe_user_data_synced', (e) => {
      if (e.detail && e.detail.appId === 'sudoku' && !gameState.inGame) {
        checkLobbyUnfinishedGame();
      }
    });

    // Sayfa kapatılırken veya sekme gizlenirken aktif oyunu anında kaydet
    window.addEventListener('beforeunload', () => {
      if (gameState.inGame && !gameState.isCompleted) {
        saveActiveGame();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && gameState.inGame && !gameState.isCompleted) {
        saveActiveGame();
      }
    });

    // URL'de doğrudan paylaşım parametresi var mı kontrol et
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id') || urlParams.get('puzzle');
    const diffParam = urlParams.get('diff') || urlParams.get('difficulty');

    if (idParam) {
      const pId = parseInt(idParam, 10);
      if (!isNaN(pId) && pId > 0) {
        startNewGameWithId(pId, diffParam || 'medium');
        return;
      }
    }

    // Sayfa doğrudan lobi görünümüyle açılır
    showLobbyView();
  }

  function updateLobbyDailyDate() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const codeEl = document.getElementById('lobby-daily-code');
    if (codeEl) codeEl.innerText = `${yyyy}${mm}${dd}`;
  }

  function showLobbyView() {
    stopTimer();
    gameState.inGame = false;

    const lobbyView = document.getElementById('lobby-view');
    const gameView = document.getElementById('game-view');
    if (lobbyView) lobbyView.classList.remove('hidden');
    if (gameView) gameView.classList.add('hidden');

    hidePauseOverlay();
    checkLobbyUnfinishedGame();
  }

  function showGameView() {
    gameState.inGame = true;
    const lobbyView = document.getElementById('lobby-view');
    const gameView = document.getElementById('game-view');
    if (lobbyView) lobbyView.classList.add('hidden');
    if (gameView) gameView.classList.remove('hidden');
  }

  function selectLobbyDifficulty(diffKey) {
    if (!DIFFICULTY_CONFIG[diffKey]) return;
    lobbySelectedDifficulty = diffKey;
    updateLobbyDifficultyUI();
  }

  function updateLobbyDifficultyUI() {
    ['easy', 'medium', 'hard', 'expert'].forEach(k => {
      const btn = document.getElementById('lobby-diff-' + k);
      if (!btn) return;
      if (k === lobbySelectedDifficulty) {
        btn.className = 'px-3 py-2 rounded-xl text-xs font-bold transition bg-stone-900 text-white border border-stone-900 shadow-sm flex items-center gap-1.5 justify-center';
      } else {
        btn.className = 'px-3 py-2 rounded-xl text-xs font-bold transition bg-white border border-mistral-hairline text-mistral-ink hover:bg-mistral-cream flex items-center gap-1.5 justify-center';
      }
    });
  }

  function startFromLobbyDifficulty() {
    const randId = Math.floor(Math.random() * 90000) + 1000;
    startNewGameWithId(randId, lobbySelectedDifficulty);
  }

  function loadFromLobbyId() {
    const input = document.getElementById('lobby-input-puzzle-id');
    const val = parseInt(input ? input.value : '', 10);
    if (isNaN(val) || val <= 0) {
      showToast('Lütfen geçerli bir bulmaca ID girin (örn: 325)');
      return;
    }
    startNewGameWithId(val, lobbySelectedDifficulty);
    if (input) input.value = '';
  }

  function startDailyChallenge() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dailyId = parseInt(`${yyyy}${mm}${dd}`, 10);
    startNewGameWithId(dailyId, 'daily');
  }

  function startNextGame() {
    closeVictoryModal();
    const nextId = gameState.puzzleId + 1;
    startNewGameWithId(nextId, gameState.difficulty);
  }

  function returnToLobby() {
    // Oyunu kaydedip ana menüye döner
    if (!gameState.isCompleted) {
      saveActiveGame(true);
    }
    showLobbyView();
    showToast('Oyun kaydedildi, ana menüye dönüldü.');
  }

  function pauseAndOpenNewGame() {
    // Duraklatma ekranından yeni oyun / menüye basılınca
    if (!gameState.isCompleted) {
      saveActiveGame(true);
    }
    showLobbyView();
    showToast('Yarım kalan oyun kaydedildi.');
  }

  // --- 9. OYUN BAŞLATMA (MOTOR ÇAĞRISI) ---
  function startNewGameWithId(id, difficulty) {
    stopTimer();
    const diff = DIFFICULTY_CONFIG[difficulty] ? difficulty : 'medium';
    gameState.puzzleId = id;
    gameState.difficulty = diff;
    gameState.selectedCell = -1;
    gameState.noteMode = false;
    gameState.timerSec = 0;
    gameState.isPaused = false;
    gameState.isCompleted = false;
    gameState.mistakes = 0;
    gameState.hintsRemaining = 3;
    gameState.hintsUsed = 0;
    gameState.history = [];
    gameState.redoStack = [];
    gameState.hasPlayerMoved = false;

    showToast(`Bulmaca #${id} yükleniyor...`);

    const cfg = DIFFICULTY_CONFIG[diff];
    const generated = generateSudoku(id, cfg.clues);

    gameState.solution = generated.solution;
    gameState.board = generated.puzzle.slice();
    gameState.given = generated.puzzle.map(v => v !== 0);
    gameState.notes = Array.from({length: 81}, () => []);

    updateBadges();
    renderBoard();
    updateLiveScore();
    updateNumpadBadges();
    hidePauseOverlay();

    showGameView();
    startTimer();
    saveActiveGame(true);
  }

  // --- 10. YARIM KALAN OYUN YÖNETİMİ (TEKİL VE SON OYUN) ---
  function saveActiveGame(force = false) {
    if (gameState.isCompleted) {
      localStorage.removeItem(STORAGE_ACTIVE_GAME);
      if (typeof window.saveAppUserData === 'function') {
        window.saveAppUserData('sudoku', STORAGE_ACTIVE_GAME, null);
      }
      return;
    }

    const hasNotes = Array.isArray(gameState.notes) && gameState.notes.some(arr => Array.isArray(arr) && arr.length > 0);
    if (!force && !gameState.hasPlayerMoved && !hasNotes && gameState.timerSec < 1) return;

    const payload = {
      puzzleId: gameState.puzzleId,
      difficulty: gameState.difficulty,
      board: gameState.board,
      given: gameState.given,
      solution: gameState.solution,
      notes: gameState.notes,
      timerSec: gameState.timerSec,
      mistakes: gameState.mistakes,
      hintsRemaining: gameState.hintsRemaining,
      hintsUsed: gameState.hintsUsed,
      history: gameState.history,
      redoStack: gameState.redoStack,
      savedAt: Date.now()
    };
    try {
      localStorage.setItem(STORAGE_ACTIVE_GAME, JSON.stringify(payload));
      if (typeof window.saveAppUserData === 'function') {
        window.saveAppUserData('sudoku', STORAGE_ACTIVE_GAME, payload);
      }
    } catch(e) {}
  }

  function checkLobbyUnfinishedGame() {
    const card = document.getElementById('lobby-resume-card');
    const titleEl = document.getElementById('lobby-resume-title');
    const descEl = document.getElementById('lobby-resume-desc');
    if (!card) return;

    try {
      const raw = localStorage.getItem(STORAGE_ACTIVE_GAME);
      if (!raw || raw === 'null') {
        card.classList.add('hidden');
        card.style.display = 'none';
        return;
      }
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data || !data.board || data.board.length !== 81) {
        card.classList.add('hidden');
        card.style.display = 'none';
        return;
      }

      const userMoves = data.board.filter((v, i) => !data.given[i] && v !== 0).length;
      const notesCount = Array.isArray(data.notes) ? data.notes.reduce((acc, n) => acc + (Array.isArray(n) ? n.length : 0), 0) : 0;
      const totalEmpty = data.given.filter(g => !g).length;

      const mm = String(Math.floor((data.timerSec || 0) / 60)).padStart(2, '0');
      const ss = String((data.timerSec || 0) % 60).padStart(2, '0');
      const diffName = (DIFFICULTY_CONFIG[data.difficulty] || {}).name || data.difficulty;
      const pct = Math.round((userMoves / Math.max(1, totalEmpty)) * 100);

      if (titleEl) titleEl.innerText = `Yarım Kalan Oyununuz: #${data.puzzleId} (${diffName})`;
      if (descEl) {
        const noteInfo = notesCount > 0 ? ` • ${notesCount} aday not` : '';
        descEl.innerText = `Geçen Süre: ${mm}:${ss} • İlerleme: %${pct} (${userMoves}/${totalEmpty} hücre${noteInfo})`;
      }
      card.classList.remove('hidden');
      card.style.display = 'flex';
    } catch(e) {
      card.classList.add('hidden');
      card.style.display = 'none';
    }
  }

  function resumeSavedGame() {
    try {
      const raw = localStorage.getItem(STORAGE_ACTIVE_GAME);
      if (!raw) return;
      const data = JSON.parse(raw);

      stopTimer();
      gameState.puzzleId = data.puzzleId;
      gameState.difficulty = data.difficulty;
      gameState.board = data.board;
      gameState.given = data.given;
      gameState.solution = data.solution;
      gameState.notes = data.notes || Array.from({length: 81}, () => []);
      gameState.timerSec = data.timerSec || 0;
      gameState.mistakes = data.mistakes || 0;
      gameState.hintsRemaining = data.hintsRemaining !== undefined ? data.hintsRemaining : 3;
      gameState.hintsUsed = data.hintsUsed || 0;
      gameState.selectedCell = -1;
      gameState.noteMode = false;
      gameState.isPaused = false;
      gameState.isCompleted = false;
      gameState.history = Array.isArray(data.history) ? data.history : [];
      gameState.redoStack = Array.isArray(data.redoStack) ? data.redoStack : [];
      gameState.hasPlayerMoved = true;

      updateBadges();
      renderBoard();
      updateLiveScore();
      updateNumpadBadges();
      hidePauseOverlay();

      showGameView();
      startTimer();
      showToast('Oyun kaldığı yerden yüklendi!');
    } catch(e) {
      showToast('Kayıtlı oyun yüklenemedi.');
    }
  }

  function deleteSavedGame() {
    try {
      localStorage.removeItem(STORAGE_ACTIVE_GAME);
      if (typeof window.saveAppUserData === 'function') {
        window.saveAppUserData('sudoku', STORAGE_ACTIVE_GAME, null);
      }
    } catch(e) {}
    const card = document.getElementById('lobby-resume-card');
    if (card) {
      card.classList.add('hidden');
      card.style.display = 'none';
    }
    showToast('Önceki oyun kaydı silindi.');
  }

  // --- 11. KRONOMETRE & DURAKLATMA (BLUR KATMANI) ---
  function startTimer() {
    stopTimer();
    gameState.timerInterval = setInterval(() => {
      if (!gameState.isPaused && !gameState.isCompleted && gameState.inGame) {
        gameState.timerSec++;
        updateTimerDisplay();
        updateLiveScore();
        if (gameState.timerSec % 5 === 0 && gameState.hasPlayerMoved) {
          saveActiveGame();
        }
      }
    }, 1000);
    updateTimerDisplay();
  }

  function stopTimer() {
    if (gameState.timerInterval) {
      clearInterval(gameState.timerInterval);
      gameState.timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    if (!el) return;
    const m = String(Math.floor(gameState.timerSec / 60)).padStart(2, '0');
    const s = String(gameState.timerSec % 60).padStart(2, '0');
    el.innerText = `${m}:${s}`;
  }

  const PLAY_ICON_SVG = '<svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  const PAUSE_ICON_SVG = '<svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';

  function togglePauseGame() {
    if (gameState.isCompleted || !gameState.inGame) return;
    gameState.isPaused = !gameState.isPaused;
    const overlay = document.getElementById('pause-overlay');
    const btn = document.getElementById('btn-pause-toggle');
    if (gameState.isPaused) {
      if (overlay) overlay.classList.remove('hidden');
      if (btn) btn.innerHTML = PLAY_ICON_SVG;
    } else {
      if (overlay) overlay.classList.add('hidden');
      if (btn) btn.innerHTML = PAUSE_ICON_SVG;
    }
  }

  function hidePauseOverlay() {
    const overlay = document.getElementById('pause-overlay');
    const btn = document.getElementById('btn-pause-toggle');
    if (overlay) overlay.classList.add('hidden');
    if (btn) btn.innerHTML = PAUSE_ICON_SVG;
    gameState.isPaused = false;
  }

  // --- 12. TAHTA VE HÜCRE ÇİZİMİ ---
  function renderBoard() {
    const container = document.getElementById('sudoku-board');
    if (!container) return;
    container.innerHTML = '';

    const selectedIdx = gameState.selectedCell;
    const selectedVal = selectedIdx >= 0 ? gameState.board[selectedIdx] : 0;
    const selR = selectedIdx >= 0 ? Math.floor(selectedIdx / 9) : -1;
    const selC = selectedIdx >= 0 ? (selectedIdx % 9) : -1;
    const selBoxR = selectedIdx >= 0 ? Math.floor(selR / 3) : -1;
    const selBoxC = selectedIdx >= 0 ? Math.floor(selC / 3) : -1;

    for (let i = 0; i < 81; i++) {
      const cell = document.createElement('div');
      cell.className = 'sudoku-cell';
      cell.dataset.index = i;

      const r = Math.floor(i / 9);
      const c = i % 9;
      const boxR = Math.floor(r / 3);
      const boxC = Math.floor(c / 3);
      const val = gameState.board[i];
      const isGiven = gameState.given[i];

      // Sınıflandırma
      if (isGiven) {
        cell.classList.add('given');
      } else if (val !== 0) {
        cell.classList.add('user-filled');
      }

      // Seçili ve Vurgu Sınıfları
      if (i === selectedIdx) {
        cell.classList.add('selected');
      } else if (selectedIdx >= 0) {
        if (val !== 0 && selectedVal !== 0 && val === selectedVal) {
          cell.classList.add('highlight-same');
        } else if (r === selR || c === selC || (boxR === selBoxR && boxC === selBoxC)) {
          cell.classList.add('highlight-cross');
        }
      }

      // Hatalı çakışma kontrolü
      if (val !== 0 && isConflict(i, val)) {
        cell.classList.add('conflict');
      }

      // Hücre İçeriği (Sayı veya Aday Notları)
      if (val !== 0) {
        cell.innerText = val;
      } else {
        const cellNotes = gameState.notes[i] || [];
        if (cellNotes.length > 0) {
          if (selectedVal !== 0 && cellNotes.includes(selectedVal)) {
            cell.classList.add('highlight-note-cell');
          }
          const notesGrid = document.createElement('div');
          notesGrid.className = 'notes-grid';
          for (let n = 1; n <= 9; n++) {
            const noteEl = document.createElement('div');
            const hasNote = cellNotes.includes(n);
            const isMatchedNote = hasNote && selectedVal !== 0 && n === selectedVal;
            noteEl.className = isMatchedNote ? 'notes-cell note-match' : 'notes-cell';
            noteEl.innerText = hasNote ? n : '';
            notesGrid.appendChild(noteEl);
          }
          cell.appendChild(notesGrid);
        }
      }

      cell.addEventListener('click', () => onCellClick(i));
      container.appendChild(cell);
    }
  }

  function isConflict(idx, val) {
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    const boxR = Math.floor(r / 3) * 3;
    const boxC = Math.floor(c / 3) * 3;

    // Aynı satır
    for (let col = 0; col < 9; col++) {
      const i = r * 9 + col;
      if (i !== idx && gameState.board[i] === val) return true;
    }
    // Aynı sütun
    for (let row = 0; row < 9; row++) {
      const i = row * 9 + c;
      if (i !== idx && gameState.board[i] === val) return true;
    }
    // Aynı 3x3 kutu
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const i = (boxR + br) * 9 + (boxC + bc);
        if (i !== idx && gameState.board[i] === val) return true;
      }
    }
    return false;
  }

  function onCellClick(index) {
    if (gameState.isPaused || gameState.isCompleted) return;
    gameState.selectedCell = index;
    renderBoard();
  }

  // --- 13. SAYI GİRİŞİ & NOT MODU YÖNETİMİ ---
  function inputNumber(num) {
    if (gameState.isPaused || gameState.isCompleted) return;
    if (gameState.selectedCell < 0) {
      showToast('Önce tahtadan bir hücre seçin');
      return;
    }

    const idx = gameState.selectedCell;
    if (gameState.given[idx]) return;

    gameState.hasPlayerMoved = true;

    // Aday Not Modu Açık ise
    if (gameState.noteMode) {
      const prevVal = gameState.board[idx];
      const prevAllNotes = gameState.notes.map(n => (n || []).slice());
      const cellNotes = (gameState.notes[idx] || []).slice();
      const nIdx = cellNotes.indexOf(num);
      if (nIdx >= 0) {
        cellNotes.splice(nIdx, 1);
      } else {
        cellNotes.push(num);
        cellNotes.sort((a,b) => a - b);
      }
      gameState.notes[idx] = cellNotes;
      gameState.board[idx] = 0;
      const newAllNotes = gameState.notes.map(n => (n || []).slice());
      gameState.history.push({
        idx,
        prevVal,
        newVal: 0,
        prevNotes: prevAllNotes[idx],
        newNotes: cellNotes.slice(),
        allPrevNotes: prevAllNotes,
        allNewNotes: newAllNotes
      });
      gameState.redoStack = [];
      updateUndoRedoUI();
      renderBoard();
      saveActiveGame();
      return;
    }

    // Normal Sayı Girişi
    const prevVal = gameState.board[idx];
    const prevAllNotes = gameState.notes.map(n => (n || []).slice());
    const prevNotes = prevAllNotes[idx];

    if (prevVal === num) {
      actionErase();
      return;
    }

    // Hata kontrolü
    if (num !== gameState.solution[idx]) {
      gameState.mistakes++;
      updateBadges();
      showToast(`Hatalı rakam! (${gameState.mistakes}/3)`);
      if (gameState.mistakes >= 3) {
        showToast('3 hata yaptınız! Skor düşüşü uygulanıyor.');
      }
    }

    gameState.board[idx] = num;
    gameState.notes[idx] = [];

    // Akıllı Not Temizliği: Aynı satır, sütun ve kutudaki diğer hücrelerden bu sayıyı sil
    cleanRelatedNotes(idx, num);

    const newAllNotes = gameState.notes.map(n => (n || []).slice());
    gameState.history.push({
      idx,
      prevVal,
      newVal: num,
      prevNotes,
      newNotes: [],
      allPrevNotes: prevAllNotes,
      allNewNotes: newAllNotes
    });
    gameState.redoStack = [];
    updateUndoRedoUI();

    renderBoard();
    updateLiveScore();
    updateNumpadBadges();
    saveActiveGame();
    checkVictory();
  }

  function cleanRelatedNotes(idx, placedNum) {
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    const boxR = Math.floor(r / 3) * 3;
    const boxC = Math.floor(c / 3) * 3;

    function removeNumFromNotes(cellIdx) {
      if (gameState.notes[cellIdx]) {
        gameState.notes[cellIdx] = gameState.notes[cellIdx].filter(n => n !== placedNum);
      }
    }

    for (let col = 0; col < 9; col++) removeNumFromNotes(r * 9 + col);
    for (let row = 0; row < 9; row++) removeNumFromNotes(row * 9 + c);
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        removeNumFromNotes((boxR + br) * 9 + (boxC + bc));
      }
    }
  }

  // --- 14. EYLEMLER: GERİ AL, İLERİ AL, SİL, NOT MODU, İPUCU ---
  function updateUndoRedoUI() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) {
      undoBtn.classList.toggle('opacity-40', (gameState.history || []).length === 0);
    }
    if (redoBtn) {
      redoBtn.classList.toggle('opacity-40', (gameState.redoStack || []).length === 0);
    }
  }

  function actionUndo() {
    if (gameState.isPaused || gameState.isCompleted) return;
    if (gameState.history.length === 0) {
      showToast('Geri alınacak hamle yok');
      return;
    }
    const last = gameState.history.pop();
    gameState.redoStack.push(last);
    gameState.board[last.idx] = last.prevVal;
    if (Array.isArray(last.allPrevNotes) && last.allPrevNotes.length === 81) {
      gameState.notes = last.allPrevNotes.map(n => (n || []).slice());
    } else {
      gameState.notes[last.idx] = (last.prevNotes || []).slice();
    }
    gameState.selectedCell = last.idx;
    updateUndoRedoUI();
    renderBoard();
    updateLiveScore();
    updateNumpadBadges();
    saveActiveGame();
  }

  function actionRedo() {
    if (gameState.isPaused || gameState.isCompleted) return;
    if (!gameState.redoStack || gameState.redoStack.length === 0) {
      showToast('İleri alınacak hamle yok');
      return;
    }
    const next = gameState.redoStack.pop();
    gameState.history.push(next);
    gameState.board[next.idx] = next.newVal;
    if (Array.isArray(next.allNewNotes) && next.allNewNotes.length === 81) {
      gameState.notes = next.allNewNotes.map(n => (n || []).slice());
    } else {
      gameState.notes[next.idx] = (next.newNotes || []).slice();
    }
    gameState.selectedCell = next.idx;
    updateUndoRedoUI();
    renderBoard();
    updateLiveScore();
    updateNumpadBadges();
    saveActiveGame();
    checkVictory();
  }

  function actionErase() {
    if (gameState.isPaused || gameState.isCompleted) return;
    if (gameState.selectedCell < 0) return;
    const idx = gameState.selectedCell;
    if (gameState.given[idx]) return;

    if (gameState.board[idx] === 0 && (!gameState.notes[idx] || gameState.notes[idx].length === 0)) return;

    gameState.hasPlayerMoved = true;
    const prevVal = gameState.board[idx];
    const prevAllNotes = gameState.notes.map(n => (n || []).slice());
    gameState.board[idx] = 0;
    gameState.notes[idx] = [];
    const newAllNotes = gameState.notes.map(n => (n || []).slice());

    gameState.history.push({
      idx,
      prevVal,
      newVal: 0,
      prevNotes: prevAllNotes[idx],
      newNotes: [],
      allPrevNotes: prevAllNotes,
      allNewNotes: newAllNotes
    });
    gameState.redoStack = [];
    updateUndoRedoUI();

    renderBoard();
    updateLiveScore();
    updateNumpadBadges();
    saveActiveGame();
  }

  function actionToggleNotes() {
    gameState.noteMode = !gameState.noteMode;
    const btn = document.getElementById('btn-note-mode');
    if (btn) {
      btn.classList.toggle('is-active', gameState.noteMode);
    }
  }

  function actionHint() {
    if (gameState.isPaused || gameState.isCompleted) return;
    if (gameState.hintsRemaining <= 0) {
      showToast('Bu oyundaki ipucu hakkınız tükendi!');
      return;
    }

    let target = gameState.selectedCell;
    if (target < 0 || gameState.given[target] || gameState.board[target] === gameState.solution[target]) {
      target = -1;
      for (let i = 0; i < 81; i++) {
        if (!gameState.given[i] && gameState.board[i] !== gameState.solution[i]) {
          target = i;
          break;
        }
      }
    }

    if (target < 0) {
      showToast('Tüm hücreler zaten doğru!');
      return;
    }

    gameState.hasPlayerMoved = true;
    gameState.hintsRemaining--;
    gameState.hintsUsed++;
    const correctVal = gameState.solution[target];
    const prevVal = gameState.board[target];
    const prevAllNotes = gameState.notes.map(n => (n || []).slice());

    gameState.board[target] = correctVal;
    gameState.notes[target] = [];
    gameState.selectedCell = target;
    cleanRelatedNotes(target, correctVal);
    const newAllNotes = gameState.notes.map(n => (n || []).slice());

    gameState.history.push({
      idx: target,
      prevVal,
      newVal: correctVal,
      prevNotes: prevAllNotes[target],
      newNotes: [],
      allPrevNotes: prevAllNotes,
      allNewNotes: newAllNotes
    });
    gameState.redoStack = [];
    updateUndoRedoUI();

    updateBadges();
    renderBoard();
    updateLiveScore();
    updateNumpadBadges();
    saveActiveGame();
    showToast(`İpucu kullanıldı (-150 puan). Kalan: ${gameState.hintsRemaining}`);
    checkVictory();
  }

  // --- 15. PUANLAMA MOTORU (TRIVIA FORMÜLÜ) ---
  function calculateCurrentScore() {
    const cfg = DIFFICULTY_CONFIG[gameState.difficulty] || DIFFICULTY_CONFIG.medium;
    const base = cfg.baseScore;
    const par = cfg.parTime;
    const mult = cfg.mult;

    const timeBonus = Math.max(0, Math.floor((par - gameState.timerSec) * mult));
    const mistakePenalty = gameState.mistakes * 50;
    const hintPenalty = gameState.hintsUsed * 150;

    const total = Math.max(100, base + timeBonus - mistakePenalty - hintPenalty);
    return {
      base,
      timeBonus,
      mistakePenalty,
      hintPenalty,
      total
    };
  }

  function updateLiveScore() {
    const scoreEl = document.getElementById('live-score-display');
    const barEl = document.getElementById('progress-bar-fill');
    const labelEl = document.getElementById('cells-filled-label');

    const filledCount = gameState.board.filter(v => v !== 0).length;
    const pct = Math.round((filledCount / 81) * 100);

    if (scoreEl) {
      const s = calculateCurrentScore();
      scoreEl.innerText = `${s.total.toLocaleString('tr-TR')} Puan`;
    }
    if (barEl) {
      barEl.style.width = `${pct}%`;
    }
    if (labelEl) {
      labelEl.innerText = `Tamamlanan: ${filledCount} / 81 (%${pct})`;
    }
  }

  function updateNumpadBadges() {
    const counts = new Uint8Array(10);
    for (let i = 0; i < 81; i++) {
      counts[gameState.board[i]]++;
    }
    for (let num = 1; num <= 9; num++) {
      const btn = document.getElementById(`numpad-${num}`);
      const left = Math.max(0, 9 - counts[num]);
      if (btn) {
        btn.classList.toggle('is-depleted', left === 0);
        btn.title = `${num} Rakamı (Kalan: ${left}/9)`;
        const segs = btn.querySelectorAll('.numpad-level');
        segs.forEach(seg => {
          const lvl = parseInt(seg.getAttribute('data-lvl'), 10);
          seg.classList.toggle('is-filled', lvl <= left);
          seg.classList.toggle('is-top-level', lvl === left && left > 0);
        });
      }
    }
  }

  function updateBadges() {
    const pBadge = document.getElementById('badge-puzzle-id');
    const dBadge = document.getElementById('badge-difficulty-name');
    const mCounter = document.getElementById('mistakes-counter');
    const bestEl = document.getElementById('best-score-label');
    const hLabel = document.getElementById('hint-btn-label');
    const hBtn = document.getElementById('btn-hint');
    const noteBtn = document.getElementById('btn-note-mode');

    const cfg = DIFFICULTY_CONFIG[gameState.difficulty] || DIFFICULTY_CONFIG.medium;
    if (pBadge) pBadge.innerText = `ID: #${gameState.puzzleId}`;
    if (dBadge) dBadge.innerText = cfg.name;
    if (mCounter) mCounter.innerText = `${gameState.mistakes}/3`;
    if (noteBtn) noteBtn.classList.toggle('is-active', Boolean(gameState.noteMode));
    updateUndoRedoUI();

    // İpucu sayacı (metinsiz köşe rozeti) ve pasifleşme
    if (hLabel) {
      hLabel.innerText = String(gameState.hintsRemaining);
    }
    if (hBtn) {
      if (gameState.hintsRemaining <= 0) {
        hBtn.disabled = true;
        hBtn.classList.add('opacity-40', 'cursor-not-allowed');
      } else {
        hBtn.disabled = false;
        hBtn.classList.remove('opacity-40', 'cursor-not-allowed');
      }
    }

    if (bestEl) {
      const records = getIdRecords();
      const rec = records[gameState.puzzleId];
      if (rec) {
        bestEl.innerText = `Bu ID Rekoru: ${rec.bestScore} Puan (${formatTime(rec.bestTime)})`;
      } else {
        bestEl.innerText = 'Bu ID Rekoru: -';
      }
    }
  }

  // --- 16. ZAFER KONTROLÜ & REKOR SAKLAMA ---
  function checkVictory() {
    for (let i = 0; i < 81; i++) {
      if (gameState.board[i] === 0 || gameState.board[i] !== gameState.solution[i]) {
        return false;
      }
    }

    // Oyun Tamamlandı!
    gameState.isCompleted = true;
    stopTimer();
    localStorage.removeItem(STORAGE_ACTIVE_GAME);

    const scoreData = calculateCurrentScore();
    saveVictoryRecord(scoreData);
    openVictoryModal(scoreData);
    return true;
  }

  function saveVictoryRecord(scoreData) {
    const pId = gameState.puzzleId;
    const timeSec = gameState.timerSec;
    const finalScore = scoreData.total;
    const now = Date.now();

    // 1) Bulmaca Bazında Tekil Rekor (Aynı ID oynanırsa sadece en yüksek puanlısı saklanır)
    const idRecords = getIdRecords();
    const existing = idRecords[pId];
    if (!existing || finalScore > existing.bestScore) {
      idRecords[pId] = {
        puzzleId: pId,
        difficulty: gameState.difficulty,
        bestScore: finalScore,
        bestTime: (existing && existing.bestTime < timeSec && finalScore <= existing.bestScore) ? existing.bestTime : timeSec,
        completedAt: now,
        playCount: (existing ? (existing.playCount || 1) : 0) + 1
      };
      saveIdRecords(idRecords);
    } else {
      existing.playCount = (existing.playCount || 1) + 1;
      saveIdRecords(idRecords);
    }

    // 2) Ömür Boyu İstatistikler (Genel Toplam)
    const stats = getLifetimeStats();
    stats.totalSolved++;
    stats.totalXp += finalScore;
    if (finalScore > stats.bestScore) stats.bestScore = finalScore;
    if (stats.bestTime === 0 || timeSec < stats.bestTime) stats.bestTime = timeSec;

    const diffKey = gameState.difficulty;
    if (diffKey === 'easy') stats.easySolved++;
    else if (diffKey === 'medium') stats.medSolved++;
    else if (diffKey === 'hard') stats.hardSolved++;
    else if (diffKey === 'expert') stats.expSolved++;
    else if (diffKey === 'daily') stats.dailySolved++;
    saveLifetimeStats(stats);

    // 3) Liderlik Tablosuna Ekle (Maskelenmiş Oyuncu)
    recordToLeaderboard(pId, gameState.difficulty, timeSec, finalScore);

    // 4) Monorepo Backend: Günün Sudokusu ise sunucuya bildir
    if (gameState.difficulty === 'daily') {
      try {
        fetch('/api/sudoku/daily-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: pId,
            time_seconds: timeSec,
            score: finalScore,
            mistakes: gameState.mistakes,
            hints: gameState.hintsUsed
          })
        }).catch(() => {});
      } catch(e) {}
    }
  }

  function openVictoryModal(s) {
    const modal = document.getElementById('victory-modal');
    if (!modal) return;
    document.getElementById('v-puzzle-id').innerText = `#${gameState.puzzleId} (${(DIFFICULTY_CONFIG[gameState.difficulty] || {}).name})`;
    document.getElementById('v-time').innerText = formatTime(gameState.timerSec);
    document.getElementById('v-bonus').innerText = `Taban ${s.base} + Süre Bonusu ${s.timeBonus}`;
    document.getElementById('v-penalty').innerText = `Hata -${s.mistakePenalty} / İpucu -${s.hintPenalty}`;
    document.getElementById('v-final-score').innerText = `${s.total.toLocaleString('tr-TR')} Puan`;
    modal.classList.remove('hidden');
  }

  function closeVictoryModal() {
    const modal = document.getElementById('victory-modal');
    if (modal) modal.classList.add('hidden');
  }

  // --- 17. LİDERLİK TABLOSU (GİZLİLİK MASKELEME KURALI: m*****u) ---
  function getLeaderboard() {
    try {
      const raw = localStorage.getItem(STORAGE_LEADERBOARD);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return []; // Mock veri tamamen kaldırıldı, sadece gerçek kullanıcı kayıtları
  }

  function recordToLeaderboard(puzzleId, diff, timeSec, score) {
    const list = getLeaderboard();
    const maskedUser = maskUsername('Melih Karasu');
    const entry = {
      user: maskedUser,
      score,
      time: timeSec,
      puzzleId,
      diff,
      date: new Date().toISOString().slice(0, 10),
      isSelf: true
    };
    list.push(entry);
    list.sort((a,b) => b.score - a.score || a.time - b.time);
    if (list.length > 50) list.length = 50;
    try {
      localStorage.setItem(STORAGE_LEADERBOARD, JSON.stringify(list));
    } catch(e) {}
  }

  async function renderLeaderboardTab(filterType) {
    const container = document.getElementById('leaderboard-rows-container');
    const tabAll = document.getElementById('lb-tab-all');
    const tabDaily = document.getElementById('lb-tab-daily');
    if (!container) return;

    if (filterType === 'daily') {
      if (tabDaily) tabDaily.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-600 text-white transition';
      if (tabAll) tabAll.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-mistral-hairline text-mistral-slate hover:text-mistral-ink transition';
    } else {
      if (tabAll) tabAll.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-600 text-white transition';
      if (tabDaily) tabDaily.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-mistral-hairline text-mistral-slate hover:text-mistral-ink transition';
    }

    // Monorepo Backend Entegrasyonu: Günün Sudokusu için backend API'sini sorgula
    if (filterType === 'daily') {
      container.innerHTML = '<div class="py-8 text-center text-mistral-slate font-mono">Günün liderlik tablosu yükleniyor...</div>';
      try {
        const dateCode = String(gameState.difficulty === 'daily' ? gameState.puzzleId : '').slice(0, 8) || new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const res = await fetch(`/api/sudoku/daily-leaderboard?date=${encodeURIComponent(dateCode)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.leaderboard)) {
            renderLeaderboardRows(data.leaderboard, data.userRank, data.userRecord, true);
            return;
          }
        }
      } catch (apiErr) {
        // API hatasında yerel listeye dön
      }
    }

    // Genel Sıralama veya Yerel Geri Dönüş
    const all = getLeaderboard();
    const filtered = filterType === 'daily'
      ? all.filter(item => item.diff === 'daily')
      : all;

    renderLeaderboardRows(filtered, -1, null, false);
  }

  function renderLeaderboardRows(rows, userRank, userRecord, isBackendDaily) {
    const container = document.getElementById('leaderboard-rows-container');
    const myRankLabel = document.getElementById('my-rank-label');
    const myRankScore = document.getElementById('my-rank-score');
    if (!container) return;

    if (!rows || rows.length === 0) {
      container.innerHTML = '<div class="py-8 text-center text-mistral-slate">Bu kategoride henüz liderlik kaydı bulunmuyor.</div>';
      if (myRankLabel) myRankLabel.innerText = 'Senin Durumun: Henüz dereceniz yok';
      if (myRankScore) myRankScore.innerText = '-';
      return;
    }

    container.innerHTML = rows.map((item, idx) => {
      const rank = item.rank || (idx + 1);
      const rankBadge = rank === 1 ? '#1' : rank === 2 ? '#2' : rank === 3 ? '#3' : `#${rank}`;
      const isSelf = Boolean(item.isSelf);
      const selfClass = isSelf ? 'bg-amber-50/70 font-bold border-l-2 border-amber-500' : 'hover:bg-mistral-cream/50';

      const safeMaskedUser = escapeHtml(maskUsername(item.user));
      const safeTime = escapeHtml(formatTime(item.time));
      const safeScore = escapeHtml(Number(item.score).toLocaleString('tr-TR'));

      return `
        <div class="py-2.5 px-3 flex items-center justify-between ${selfClass} transition">
          <div class="flex items-center gap-3">
            <span class="w-10 font-bold ${rank <= 3 ? 'text-mistral-orange' : 'text-mistral-slate'}">${rankBadge}</span>
            <div>
              <div class="text-mistral-ink font-bold flex items-center gap-1.5">
                <span>${safeMaskedUser}</span>
                ${isSelf ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 font-sans">Sen</span>' : ''}
              </div>
              <div class="text-[10px] text-mistral-stone font-sans">
                ${isBackendDaily ? 'En Hızlı Çözüm: ' + safeTime : 'ID: #' + escapeHtml(item.puzzleId || '')}
              </div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-mistral-orange font-bold text-xs">${safeScore} Puan</div>
            <div class="text-[10px] text-mistral-slate">${safeTime}</div>
          </div>
        </div>
      `;
    }).join('');

    // Oyuncunun kendi durumunu güncelle
    if (myRankLabel && myRankScore) {
      if (userRank > 0 && userRecord) {
        myRankLabel.innerText = `Senin Durumun: #${userRank} • ${maskUsername(userRecord.user)}`;
        myRankScore.innerText = `${formatTime(userRecord.time)} (${userRecord.score.toLocaleString('tr-TR')} Puan)`;
      } else {
        const myIdx = rows.findIndex(i => i.isSelf);
        if (myIdx >= 0) {
          myRankLabel.innerText = `Senin Durumun: #${myIdx + 1} • m*****u`;
          myRankScore.innerText = `${formatTime(rows[myIdx].time)} (${rows[myIdx].score.toLocaleString('tr-TR')} Puan)`;
        } else {
          myRankLabel.innerText = 'Senin Durumun: Henüz dereceniz yok';
          myRankScore.innerText = '-';
        }
      }
    }
  }

  function openLeaderboardModal() {
    renderLeaderboardTab('all');
    const modal = document.getElementById('leaderboard-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeLeaderboardModal() {
    const modal = document.getElementById('leaderboard-modal');
    if (modal) modal.classList.add('hidden');
  }

  // --- 18. İSTATİSTİKLER (BU OYUN & GENEL TOPLAM) ---
  function getLifetimeStats() {
    try {
      const raw = localStorage.getItem(STORAGE_LIFETIME_STATS);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return {
      totalSolved: 0,
      totalXp: 0,
      bestScore: 0,
      bestTime: 0,
      easySolved: 0,
      medSolved: 0,
      hardSolved: 0,
      expSolved: 0,
      dailySolved: 0
    };
  }

  function saveLifetimeStats(st) {
    try {
      localStorage.setItem(STORAGE_LIFETIME_STATS, JSON.stringify(st));
    } catch(e) {}
  }

  function getIdRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_ID_RECORDS);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return {};
  }

  function saveIdRecords(rec) {
    try {
      localStorage.setItem(STORAGE_ID_RECORDS, JSON.stringify(rec));
    } catch(e) {}
  }

  function openStatsModal() {
    const stats = getLifetimeStats();
    document.getElementById('st-total-solved').innerText = stats.totalSolved;
    document.getElementById('st-total-xp').innerText = stats.totalXp.toLocaleString('tr-TR');
    document.getElementById('st-best-score').innerText = stats.bestScore.toLocaleString('tr-TR');
    document.getElementById('st-best-time').innerText = stats.bestTime > 0 ? formatTime(stats.bestTime) : '-';

    const listEl = document.getElementById('solved-puzzles-list');
    if (listEl) {
      const records = getIdRecords();
      const keys = Object.keys(records).sort((a,b) => records[b].completedAt - records[a].completedAt);
      if (keys.length === 0) {
        listEl.innerHTML = '<div class="p-4 text-center text-mistral-slate text-[11px]">Henüz tamamlanan tekil bulmaca kaydı bulunmuyor.</div>';
      } else {
        listEl.innerHTML = keys.map(k => {
          const item = records[k];
          const diff = escapeHtml((DIFFICULTY_CONFIG[item.difficulty] || {}).name || item.difficulty);
          const safeId = escapeHtml(item.puzzleId);
          const safeScore = escapeHtml(Number(item.bestScore).toLocaleString('tr-TR'));
          const safeTime = escapeHtml(formatTime(item.bestTime));
          return `
            <div class="p-2.5 flex items-center justify-between hover:bg-mistral-cream/50 transition font-mono">
              <div>
                <span class="font-bold text-mistral-ink">#${safeId}</span>
                <span class="text-mistral-slate ml-1 text-[10px]">(${diff})</span>
              </div>
              <div class="text-right">
                <span class="text-mistral-orange font-bold">${safeScore} Puan</span>
                <span class="text-mistral-stone text-[10px] ml-2">${safeTime}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeStatsModal() {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.add('hidden');
  }

  // --- 19. PAYLAŞ BUTONU (AYNI BULMACA LİNKİ) ---
  function shareGameLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('id', gameState.puzzleId);
    url.searchParams.set('diff', gameState.difficulty);
    const linkStr = url.toString();
    safeCopyToClipboard(linkStr, `#${gameState.puzzleId} linki panoya kopyalandı!`);
  }

  // --- 20. KLAVYE VE ETKİLEŞİM DİNLEYİCİLERİ ---
  function setupDomEvents() {
    window.addEventListener('keydown', (e) => {
      if (gameState.isCompleted || !gameState.inGame) return;

      const vMod = document.getElementById('victory-modal');
      const lMod = document.getElementById('leaderboard-modal');
      const sMod = document.getElementById('stats-modal');
      if ((vMod && !vMod.classList.contains('hidden')) ||
          (lMod && !lMod.classList.contains('hidden')) ||
          (sMod && !sMod.classList.contains('hidden'))) {
        if (e.key === 'Escape') {
          closeVictoryModal();
          closeLeaderboardModal();
          closeStatsModal();
        }
        return;
      }

      if (e.target && e.target.tagName === 'INPUT') return;

      if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
        e.preventDefault();
        togglePauseGame();
        return;
      }

      if (gameState.isPaused) return;

      // 1-9 Rakamlar
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        inputNumber(parseInt(e.key, 10));
        return;
      }

      // Silme
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        actionErase();
        return;
      }

      // İleri Al (Ctrl+Y veya Ctrl+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        actionRedo();
        return;
      }

      // Geri Al (Ctrl+Z)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        actionUndo();
        return;
      }

      // Not Modu Toggle
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        actionToggleNotes();
        return;
      }

      // İpucu
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        actionHint();
        return;
      }

      // Ok Tuşları ile Tahtada Gezinme
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 's', 'a', 'd'].includes(e.key)) {
        e.preventDefault();
        let cur = gameState.selectedCell >= 0 ? gameState.selectedCell : 0;
        let r = Math.floor(cur / 9);
        let c = cur % 9;

        if (e.key === 'ArrowUp' || e.key === 'w') r = (r + 8) % 9;
        else if (e.key === 'ArrowDown' || e.key === 's') r = (r + 1) % 9;
        else if (e.key === 'ArrowLeft' || e.key === 'a') c = (c + 8) % 9;
        else if (e.key === 'ArrowRight' || e.key === 'd') c = (c + 1) % 9;

        gameState.selectedCell = r * 9 + c;
        renderBoard();
      }
    });
  }

  // --- 21. YARDIMCI İŞLEVLER ---
  function formatTime(totalSec) {
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function showToast(msg) {
    const toast = document.getElementById('game-toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.remove('hidden');
    clearTimeout(toast.__tid);
    toast.__tid = setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  // --- 22. DIŞA AKTARILAN GLOBAL KÖPRÜLER ---
  window.selectLobbyDifficulty = selectLobbyDifficulty;
  window.startFromLobbyDifficulty = startFromLobbyDifficulty;
  window.loadFromLobbyId = loadFromLobbyId;
  window.startDailyChallenge = startDailyChallenge;
  window.startNextGame = startNextGame;
  window.returnToLobby = returnToLobby;
  window.pauseAndOpenNewGame = pauseAndOpenNewGame;
  window.togglePauseGame = togglePauseGame;
  window.actionUndo = actionUndo;
  window.actionRedo = actionRedo;
  window.actionErase = actionErase;
  window.actionToggleNotes = actionToggleNotes;
  window.actionHint = actionHint;
  window.inputNumber = inputNumber;
  window.resumeSavedGame = resumeSavedGame;
  window.deleteSavedGame = deleteSavedGame;
  window.openLeaderboardModal = openLeaderboardModal;
  window.closeLeaderboardModal = closeLeaderboardModal;
  window.renderLeaderboardTab = renderLeaderboardTab;
  window.openStatsModal = openStatsModal;
  window.closeStatsModal = closeStatsModal;
  window.closeVictoryModal = closeVictoryModal;
  window.shareGameLink = shareGameLink;

  document.addEventListener('DOMContentLoaded', initGame);

})();
