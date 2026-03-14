// BUILD number shown under the logo (cache-bust + version label)
const BUILD = 3003;
const SEASON_ROUNDS = 12;
const KEY_SEEN_EVENT_PREFIX = "typer_seen_event_v1";

const BG_HOME = "img_menu_pc.png";
const BG_ROOM = "img_tlo.png";

const KEY_NICK = "typer_nick_v3";
const KEY_ACTIVE_ROOM = "typer_active_room_v3";
const KEY_ROOMS_HISTORY = "typer_rooms_history_v3";

// Profil (avatar / kraj / ulubiony klub)
const KEY_PROFILE = "typer_profile_v1"; // JSON

// Id gracza (bezpieczne logowanie na innym urządzeniu)
// Format: 1 litera kraju + 6 cyfr, np. P123456
const KEY_PLAYER_NO = "typer_player_no_v1";

// NOWE: język
const KEY_LANG = "typer_lang_v1"; // "pl" | "en"

const firebaseConfig = {
  apiKey: "AIzaSyCE-uY6HnDWdfKW03hioAlLM8BLj851fco",
  authDomain: "typer-b3087.firebaseapp.com",
  projectId: "typer-b3087",
  storageBucket: "typer-b3087.firebasestorage.app",
  messagingSenderId: "1032303131493",
  appId: "1:1032303131493:web:8cc41341f3e42415d6ff8c",
  measurementId: "G-5FBDH5G15N"
};

const el = (id) => document.getElementById(id);

// Set text for normal <button>, but for image-buttons (having data-btn or <img>) only set title/aria-label.
const setBtnLabelSafe = (id, label) => {
  const b = el(id);
  if (!b) return;
  const isImgBtn = b.classList?.contains("imgBtn") || b.dataset?.btn || b.querySelector?.("img");
  if (isImgBtn) {
    b.title = label;
    b.setAttribute("aria-label", label);
  } else {
    b.textContent = label;
  }
};
const setBg = (src) => { const bg = el("bg"); if (bg) bg.style.backgroundImage = `url("${src}")`; };
const setFooter = (txt) => { const f = el("footerRight"); if (f) f.textContent = txt; };

// ===== PRESENCE (online dot) =====
// Uwaga: porównujemy do Date.now() urządzenia. Żeby uniknąć fałszywego "nieaktywny"
// przy drobnym rozjechaniu czasu między urządzeniami / throttlingu w tle,
// dajemy bezpieczniejsze okno aktywności.
const PRESENCE_ACTIVE_MS = 5 * 60 * 1000; // green if lastActiveAt within last 5 min
let presenceTick = null;
let presenceBumpTick = null;
let presenceLastBump = 0;

function tsToMs(ts){
  if(!ts) return 0;
  if(typeof ts === "number") return ts;
  if(typeof ts === "string"){
    const d = Date.parse(ts);
    return Number.isFinite(d) ? d : 0;
  }
  if(typeof ts.toMillis === "function") return ts.toMillis();
  if(typeof ts.seconds === "number") return ts.seconds * 1000 + Math.floor((ts.nanoseconds||0)/1e6);
  return 0;
}

function isPlayerActive(p){
  const ms = tsToMs(p?.lastActiveAt);
  if(!ms) return false;
  return (Date.now() - ms) < PRESENCE_ACTIVE_MS;
}

async function bumpPresence(force=false){
  if(!currentRoomCode) return;
  const now = Date.now();
  if(!force && (now - presenceLastBump) < 5000) return; // throttle
  presenceLastBump = now;
  try{
    await boot.setDoc(
      boot.doc(db, "rooms", currentRoomCode, "players", userUid),
      { lastActiveAt: boot.serverTimestamp() },
      { merge:true }
    );
  }catch{}
}

function startPresenceHeartbeat(){
  stopPresenceHeartbeat();
  bumpPresence(true);
  presenceBumpTick = setInterval(()=> bumpPresence(false), 20000);
  // Re-render dots even if snapshots stop updating
  presenceTick = setInterval(()=> renderPlayers(lastPlayers), 5000);

  // Activity bump
  const onAct = ()=> bumpPresence(false);
  window.addEventListener("pointerdown", onAct, { passive:true });
  window.addEventListener("keydown", onAct, { passive:true });
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) bumpPresence(true); });
  startPresenceHeartbeat._onAct = onAct;
}

function stopPresenceHeartbeat(){
  if(presenceBumpTick){ clearInterval(presenceBumpTick); presenceBumpTick=null; }
  if(presenceTick){ clearInterval(presenceTick); presenceTick=null; }
  const onAct = startPresenceHeartbeat._onAct;
  if(onAct){
    window.removeEventListener("pointerdown", onAct);
    window.removeEventListener("keydown", onAct);
    startPresenceHeartbeat._onAct = null;
  }
}


function showToast(msg){
  const t = el("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(()=> t.style.display="none", 2600);
}


function ensureCenterLoadingOverlay(){
  let ov = document.getElementById("centerLoadingOverlay");
  if(ov) return ov;
  ov = document.createElement("div");
  ov.id = "centerLoadingOverlay";
  ov.style.cssText = [
    "position:fixed","inset:0","display:none","align-items:center","justify-content:center",
    "background:rgba(0,0,0,.28)","backdrop-filter:blur(6px)","-webkit-backdrop-filter:blur(6px)",
    "z-index:100001","pointer-events:none"
  ].join(";");
  const card = document.createElement("div");
  card.id = "centerLoadingCard";
  card.style.cssText = [
    "padding:22px 34px","border-radius:22px","border:1px solid rgba(255,255,255,.14)",
    "background:rgba(7,18,41,.88)","box-shadow:0 18px 50px rgba(0,0,0,.42)",
    "font-weight:1000","font-size:42px","letter-spacing:1.2px","color:#fff",
    "text-align:center","text-shadow:0 2px 10px rgba(0,0,0,.45)"
  ].join(";");
  const mobile = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
  if(mobile){
    card.style.fontSize = "28px";
    card.style.padding = "18px 24px";
  }
  card.textContent = getLang()==="en" ? "LOADING......" : "ŁADOWANIE......";
  ov.appendChild(card);
  document.body.appendChild(ov);
  return ov;
}

function showCenterLoading(text){
  const ov = ensureCenterLoadingOverlay();
  const card = document.getElementById("centerLoadingCard");
  if(card) card.textContent = text || (getLang()==="en" ? "LOADING......" : "ŁADOWANIE......");
  ov.style.display = "flex";
}

function hideCenterLoading(){
  const ov = document.getElementById("centerLoadingOverlay");
  if(ov) ov.style.display = "none";
}

function showScreen(id){
  const ids = ["splash","home","continue","rooms","room","results","league"];
  ids.forEach(s=>{
    const node = el(s);
    if (node) node.classList.toggle("active", s===id);
  });

  if(id === "room" || id === "results") setBg(BG_ROOM);
  else setBg(BG_HOME);
}


function applyZgadnijStartButtonByLang(){
  try{
    const btn = document.getElementById('btnHomeRooms');
    if(!btn) return;
    const img = btn.querySelector('img');
    if(!img) return;
    const isEn = (typeof state !== 'undefined' && state.lang === 'en');
    img.src = isEn ? 'ui/buttons/en/btn_zgadnij_start.png' : 'ui/buttons/pl/btn_zgadnij_start.png';
  }catch(e){}
}

function setSplash(msg){
  const h = el("splashHint");
  if (h) h.textContent = msg;
  console.log(msg);
}

function clampInt(v, min, max){
  if (v === "" || v === null || v === undefined) return null;
  const n = parseInt(String(v),10);
  if (Number.isNaN(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function genCode6(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for(let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function normalizeSlug(s){
  return (s||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g,"l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ===== i18n (PL/EN) =====
const I18N = {
  pl: {
    settings: "Ustawienia",
    clearProfile: "Wyczyść profil",
    clearConfirm: "Na pewno wyczyścić profil? To usunie nick, historię, język i cache PWA.",
    cleared: "Profil wyczyszczony.",
    clearFailed: "Nie udało się wyczyścić profilu.",
    language: "Język",
    close: "Zamknij",
    roomsTitle: "Pokoje typerów",
    stats: "Statystyki",
    exit: "Wyjście",

    contTitle: "Kontynuować?",
    contSub: "Wykryto wcześniejszą rozgrywkę",
    contHello: "Witaj ponownie",
    contRoom: "Grasz w pokoju",
    contQ: "Czy chcesz kontynuować grę w tym pokoju?",
    yes: "Tak",
    no: "Nie",
    forget: "Zapomnij pokój",

    nick: "Nick",
    joinTitle: "Dołącz do pokoju",
    joinBtn: "Dołącz",
    joinHelp: "Wpisz kod od admina.",
    createTitle: "Utwórz nowy pokój",
    createBtn: "Utwórz",
    createHelp: "Kod pokoju ma 6 znaków. Adminem będzie osoba, która tworzy pokój.",
    changeNick: "Zmień nick",
    back: "Wróć",

    room: "Pokój",
    admin: "Admin",
    code: "Kod",
    copy: "Kopiuj",
    leave: "Opuść",
    refresh: "Odśwież",
    actions: "Akcje",
    actionsSub: "Zapisz typy dopiero, gdy uzupełnisz wszystkie mecze.",
    savePicks: "Zapisz typy",
    enterResults: "Wpisz wyniki",
    endRound: "Zakończ kolejkę",
    myQueue: "Własna kolejka",
    addQueue: "Dodaj kolejkę (test)",

    matches: "Spotkania",
    matchesSub: "Uzupełnij typy (0–20). Wyniki admin wpisze osobno.",
    round: "KOLEJKA",
    games: "Mecze",
    pointsRound: "PUNKTY (kolejka)",

    players: "Gracze",
    playersSub: "",
    leagueBtn: "Tabela ligi typerów",

    results: "Wyniki",
    hintResults: "Podpowiedź: wpisz wszystkie wyniki i kliknij „Zapisz wyniki”.",
    saveResults: "Zapisz wyniki",

    league: "Tabela ligi typerów",
    afterRound: "Po kolejce",
    ranking: "Ranking",
    leagueHint: "Kliknij gracza, aby zobaczyć statystyki (kolejki + podgląd typów).",
    playerCol: "Gracz",
    roundsCol: "Kolejki",
    pointsCol: "Punkty",
    addProfileTitle: "DODAJ PROFIL GRACZA",
    addProfileSub: "Ustaw swój nick, aby rozpocząć grę.",
    nickLabel: "Nick (3–16 znaków):",
    nickPlaceholder: "np. Mariusz",
    nickInvalid: "Nick musi mieć 3–16 znaków.",
    nickRequired: "Nick jest wymagany.",
    ok: "OK",
    cancel: "Anuluj",
    langOnHome: "Język ustawiasz na stronie głównej."
},
  en: {
    settings: "Settings",
    clearProfile: "Clear profile",
    clearConfirm: "Clear profile? This will remove nick, history, language and PWA cache.",
    cleared: "Profile cleared.",
    clearFailed: "Failed to clear profile.",
    language: "Language",
    close: "Close",
    roomsTitle: "Typer rooms",
    stats: "Stats",
    exit: "Exit",

    contTitle: "Continue?",
    contSub: "Previous room detected",
    contHello: "Welcome back",
    contRoom: "You play in room",
    contQ: "Do you want to continue in this room?",
    yes: "Yes",
    no: "No",
    forget: "Forget room",

    nick: "Nick",
    joinTitle: "Join room",
    joinBtn: "Join",
    joinHelp: "Enter the code from admin.",
    createTitle: "Create new room",
    createBtn: "Create",
    createHelp: "Room code has 6 chars. The creator becomes admin.",
    changeNick: "Change nick",
    back: "Back",

    room: "Room",
    admin: "Admin",
    code: "Code",
    copy: "Copy",
    leave: "Leave",
    refresh: "Refresh",
    actions: "Actions",
    actionsSub: "Save picks only after you fill all matches.",
    savePicks: "Save picks",
    enterResults: "Enter results",
    endRound: "End round",
    myQueue: "My fixture",
    addQueue: "Add fixture (test)",

    matches: "Matches",
    matchesSub: "Fill picks (0–20). Admin enters results separately.",
    round: "ROUND",
    games: "Games",
    pointsRound: "POINTS (round)",

    players: "Players",
    playersSub: "",
    leagueBtn: "League table",

    results: "Results",
    hintResults: "Tip: fill all results and click “Save results”.",
    saveResults: "Save results",

    league: "League table",
    afterRound: "After round",
    ranking: "Ranking",
    leagueHint: "Click a player to view stats (rounds + picks preview).",
    playerCol: "Player",
    roundsCol: "Rounds",
    pointsCol: "Points",
    addProfileTitle: "ADD PLAYER PROFILE",
    addProfileSub: "Set your nick to start playing.",
    nickLabel: "Nick (3–16 chars):",
    nickPlaceholder: "e.g. Player",
    nickInvalid: "Nick must be 3–16 characters.",
    nickRequired: "Nick is required.",
    ok: "OK",
    cancel: "Cancel",
    langOnHome: "Language is set on the home screen."
}
};
function getLang(){
  const v = (localStorage.getItem(KEY_LANG) || "").toLowerCase();
  return (v === "en") ? "en" : "pl";
}
function setLang(lang){
  const v = (lang === "en") ? "en" : "pl";
  localStorage.setItem(KEY_LANG, v);
  applyLangToUI();
}

// ===== Buttons (grafiki) =====
function getBtnDir(){
  return (getLang() === "en") ? "ui/buttons/en/" : "ui/buttons/pl/";
}

const BTN_NAME_MAP = {
"btn_pokoj_typerow.png": "btn_tipster_room.png",
  "btn_statystyki.png": "btn_statistics.png",
  "btn_wyjscie.png": "btn_exit.png",
  "btn_wejdz_pokoj.png": "btn_enter_room.png",
  "btn_zaloz.png": "btn_create_room.png",
  "btn_opcje.png": "btn_options.png",
  "btn_nowa_kolejka.png": "btn_new_queue.png",
  "btn_zakoncz_kolejke.png": "btn_end_queue.png",
  "btn_cofnij.png": "btn_back.png",
  "btn_odswiez.png": "btn_refresh.png",
  "btn_tabela_typerow.png": "btn_tipster_table.png",
  "btn_dodaj_profil.png": "btn_add_profile.png",
  "btn_reset_profilu.png": "btn_reset_profile.png",
  "btn_tak.png": "btn_yes.png",
  "btn_nie.png": "btn_no.png",
  "btn_zamknij.png": "btn_close.png",
  "btn_leave_room.png": "btn_opusc.png",
  "btn_ustawienia.png": "btn_settings.png",
  "btn_zapisz_wyniki.png": "btn_save_wynik.png",
  "btn_dodaj_wyniki.png": "btn_enter_results.png",
  "btn_dodaj_kolejke.png": "btn_add_queue.png",
  "btn_zapisz_kolejke.png": "btn_save_queue.png",
  "btn_zapisz_typy.png": "btn_save_picks.png",
  "btn_dodaj_wyniki1.png": "btn_enter_results.png"
};

function mapBtnName(raw){
  if(!raw) return raw;
  const base = raw.replace(/(\d+)\.png$/i, '.png');
  return BTN_NAME_MAP[base] || base;
}

function refreshAllButtonImages(){
  const dir = getBtnDir();
  document.querySelectorAll('img[data-btn]').forEach(img=>{
    const raw = (img.dataset.btn || '').trim();
    if(!raw) return;

    // Ujednolicenie nazw: jeśli ktoś ma np. btn_statystyki1.png, to wymuszamy btn_statystyki.png
    // (w obu folderach: buttons/pl/ i buttons/en/ powinny być te same nazwy plików).
    const name = mapBtnName(raw);

    img.src = dir + name;
  });
}
function t(key){
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) ? I18N[lang][key] : (I18N.pl[key] || key);
}


function updateHomeButtonsImages(){
  refreshAllButtonImages();
}

function updateLangButtonsVisual(){
  const pl = el("btnLangPL");
  const en = el("btnLangEN");
  if(!pl || !en) return;

  const lang = getLang();
  pl.classList.toggle("active", lang === "pl");
  en.classList.toggle("active", lang === "en");
  pl.classList.toggle("inactive", lang !== "pl");
  en.classList.toggle("inactive", lang !== "en");
}

function applyLangToUI(){
  // HOME titles (tooltipy)
  const hs = el("btnHomeSettings");
  if(hs) hs.title = t("settings");
  const hr = el("btnHomeRooms");
  if(hr) hr.title = t("roomsTitle");
  const ht = el("btnHomeStats");
  if(ht) ht.title = t("stats");
  const he = el("btnHomeExit");
  if(he) he.title = t("exit");

  // HOME images + flag visuals
  updateHomeButtonsImages();
  refreshAllButtonImages();
  updateLangButtonsVisual();

  // Continue
  if(el("t_continue_title")) el("t_continue_title").textContent = t("contTitle");
  if(el("t_continue_sub")) el("t_continue_sub").textContent = t("contSub");
  if(el("t_continue_hello")) el("t_continue_hello").textContent = t("contHello");
  if(el("t_continue_room")) el("t_continue_room").textContent = t("contRoom");
  if(el("t_continue_q")) el("t_continue_q").textContent = t("contQ");
  setBtnLabelSafe("btnContYes", t("yes"));
  setBtnLabelSafe("btnContNo", t("no"));
  setBtnLabelSafe("btnContForget", t("forget"));

  // Rooms
  if(el("t_rooms_title")) el("t_rooms_title").textContent = t("roomsTitle");
  if(el("t_nick")) el("t_nick").textContent = t("nick");
  setBtnLabelSafe("btnChangeNickRooms", t("changeNick"));
  setBtnLabelSafe("btnBackHomeFromRooms", t("back"));
  if(el("t_join_title")) el("t_join_title").textContent = t("joinTitle");
  setBtnLabelSafe("btnJoinRoom", t("joinBtn"));
  if(el("t_join_help")) el("t_join_help").textContent = t("joinHelp");
  if(el("t_create_title")) el("t_create_title").textContent = t("createTitle");
  setBtnLabelSafe("btnCreateRoom", t("createBtn"));
  if(el("t_create_help")) el("t_create_help").textContent = t("createHelp");

  // Room
  if(el("t_room_room")) el("t_room_room").textContent = t("room");
  if(el("t_nick2")) el("t_nick2").textContent = t("nick");
  if(el("t_admin")) el("t_admin").textContent = t("admin");
  if(el("t_code")) el("t_code").textContent = t("code");
  setBtnLabelSafe("btnCopyCode", t("copy"));
  setBtnLabelSafe("btnLeave", t("leave"));
  setBtnLabelSafe("btnRefresh", t("refresh"));
  if(el("t_actions")) el("t_actions").textContent = t("actions");
  if(el("t_actions_sub")) el("t_actions_sub").textContent = t("actionsSub");
  setBtnLabelSafe("btnSaveAll", t("savePicks"));
  setBtnLabelSafe("btnEnterResults", t("enterResults"));
  setBtnLabelSafe("btnEndRound", t("endRound"));
  setBtnLabelSafe("btnMyQueue", t("myQueue"));
  setBtnLabelSafe("btnAddQueue", t("addQueue"));
  setBtnLabelSafe("btnBackFromRoom", t("back"));

  if(el("t_matches")) el("t_matches").textContent = t("matches");
  if(el("t_matches_sub")) el("t_matches_sub").textContent = t("matchesSub");
  if(el("t_round")) el("t_round").textContent = t("round");
  if(el("t_games")) el("t_games").textContent = t("games");
  if(el("t_points_round")) el("t_points_round").textContent = t("pointsRound");

  if(el("t_players")) el("t_players").textContent = t("players");
  if(el("t_players_sub")) el("t_players_sub").textContent = t("playersSub");
  setBtnLabelSafe("btnLeagueFromRoom", t("leagueBtn"));

  // Results
  if(el("t_results")) el("t_results").textContent = t("results");
  if(el("t_room")) el("t_room").textContent = t("room");
  if(el("t_round2")) el("t_round2").textContent = t("round");
  setBtnLabelSafe("btnResBack", t("back"));
  setBtnLabelSafe("btnResSave", t("saveResults"));
  if(el("t_results_hint")) el("t_results_hint").textContent = t("hintResults");

  // League
  if(el("t_league")) el("t_league").textContent = t("league");
  if(el("t_room3")) el("t_room3").textContent = t("room");
  if(el("t_nick3")) el("t_nick3").textContent = t("nick");
  if(el("t_after_round")) el("t_after_round").textContent = t("afterRound");
  setBtnLabelSafe("btnLeagueBack", t("back"));
  if(el("t_ranking")) el("t_ranking").textContent = t("ranking");
  if(el("leagueHint")) el("leagueHint").textContent = t("leagueHint");
  if(el("t_player_col")) el("t_player_col").textContent = t("playerCol");
  if(el("t_rounds_col")) el("t_rounds_col").textContent = t("roundsCol");
  if(el("t_points_col")) el("t_points_col").textContent = t("pointsCol");
}

// ===== Modal =====
function modalOpen(title, bodyNode){
  const m = el("modal");
  const tEl = el("modalTitle");
  const b = el("modalBody");
  if(!m || !tEl || !b) return;
  tEl.textContent = title || "—";
  b.innerHTML = "";
  if(bodyNode) b.appendChild(bodyNode);
  const closeBtn = el("modalClose");
  if(closeBtn) closeBtn.style.display = "";
  m.classList.add("active");
}
function modalClose(){
  const m = el("modal");
  if(m){
    m.classList.remove("active");
    m.classList.remove("profileMode");
  }
  const mb = el("modalBack");
  if(mb) mb.remove();
}

/** ROOMS MENU MODALS **/

function makeSysImgButton(btnName, {cls="sysBtn", alt="btn", title="", onClick=null} = {}){
  const b = document.createElement("button");
  b.type = "button";
  b.className = `imgBtn ${cls}`.trim();
  if(title) b.title = title;

  const img = document.createElement("img");
  img.dataset.btn = btnName;
  img.alt = alt;

  // Ustaw src od razu (żeby nie było pustki przed refresh)
  img.src = getBtnDir() + mapBtnName(btnName);

  b.appendChild(img);
  if(onClick) b.onclick = onClick;
  return b;
}

function openRoomsChoiceModal(){
  const wrap = document.createElement("div");
  wrap.className = "roomsChoice";

  const p = document.createElement("div");
  p.className = "muted";
  p.textContent = (getLang()==="en")
    ? "Choose what you want to do:"
    : "Wybierz co chcesz zrobić:";
  wrap.appendChild(p);

  const row = document.createElement("div");
  row.className = "roomsChoiceBtns";

  const btnJoin = makeSysImgButton("btn_join.png", {
    cls:"sysBtn sysBtnBig",
    alt:"join",
    title:(getLang()==="en") ? "Join a room" : "Dołącz do pokoju",
    onClick: ()=>{
      modalClose();
      showCenterLoading();
      setTimeout(async ()=>{
        try{
          await handleJoinFlow();
        }catch(err){
          console.warn("Join flow failed:", err);
          hideCenterLoading();
        }
      }, 2000);
    }
  });

  const btnCreate = makeSysImgButton("btn_create.png", {
    cls:"sysBtn sysBtnBig",
    alt:"create",
    title:(getLang()==="en") ? "Create room" : "Stwórz pokój",
    onClick: ()=>{ modalClose(); openCreateRoomModal(); }
  });

  // NEW LOGIN (placeholder for next step) — wstawiony na środek (między Join i Create)
  const btnNewLogin = makeSysImgButton("btn_new_login.png", {
    cls:"sysBtn sysBtnBig",
    alt:"new-login",
    title:(getLang()==="en") ? "New login" : "Nowe logowanie",
    onClick: ()=>{
      modalClose();
      openNewLoginModal();
    }
  });

  row.appendChild(btnJoin);
  row.appendChild(btnNewLogin);
  row.appendChild(btnCreate);
  wrap.appendChild(row);

  const actions = document.createElement("div");
  actions.className = "roomsChoiceActions";
  actions.style.gap = "14px";

  const btnMenu = makeSysImgButton("btn_menu.png", {
    cls:"sysBtn",
    alt:"menu",
    title:"Menu",
    onClick: ()=>{ modalClose(); showScreen("home"); }
  });

  actions.appendChild(btnMenu);
  wrap.appendChild(actions);

  modalOpen((getLang()==="en") ? "TYPERS ROOMS" : "POKOJE TYPERÓW", wrap);
  const closeBtn = el("modalClose");
  if(closeBtn) closeBtn.style.display = "none";
  // upewnij się, że obrazki przełączą się przy aktualnym języku
  refreshAllButtonImages();
}

async function handleJoinFlow(){
  // If user just entered player number via "Mój profil" and wants to re-join an existing room,
  // do NOT auto-enter saved room. Ask for code and use playerNo login.
  if(window.__pendingPlayerNoLogin === true){
    openJoinRoomModal();
    return;
  }
  const pn = String(getPlayerNo() || (getProfile()||{}).playerNo || "").trim().toUpperCase();
  if(/^[A-Z0-9]{7}$/.test(pn)){
    try{
      const rooms = await __listRoomsForPlayerNo(pn);
      if(rooms.length){
        openJoinRoomModal();
        return;
      }
    }catch(err){
      console.warn("Rooms-for-player lookup failed:", err);
    }
  }
  const saved = getSavedRoom();
  // If user has a saved active room (admin or member), enter immediately only when we do not have a player-number room choice.
  if(saved && saved.length===6){
    try{
      if(/^[A-Z0-9]{7}$/.test(pn)){
        await performNewLogin(pn, saved);
      }else{
        await openRoom(saved, {force:true});
      }
      return;
    }catch(err){
      // If room no longer exists, fall back to asking for code
      console.warn("Saved room open failed:", err);
    }
  }
  openJoinRoomModal();
}

function openJoinRoomModal(){
  const wrap = document.createElement("div");
  wrap.className = "joinRoom";

  const lab = document.createElement("div");
  lab.className = "muted";
  lab.textContent = (getLang()==="en")
    ? "Enter room code (6 characters):"
    : "Podaj kod pokoju (6 znaków):";
  wrap.appendChild(lab);

  const inp = document.createElement("input");
  inp.id = "joinCodeInput";
  inp.className = "input";
  inp.maxLength = 6;
  inp.autocomplete = "off";
  inp.placeholder = "ABC123";
  inp.style.textTransform = "uppercase";
  wrap.appendChild(inp);

  const currentPlayerNo = String(getPlayerNo() || (getProfile()||{}).playerNo || "").trim().toUpperCase();
  const shouldShowRoomsForPlayer = /^[A-Z0-9]{7}$/.test(currentPlayerNo);
  if(shouldShowRoomsForPlayer){
    const roomsHint = document.createElement("div");
    roomsHint.className = "muted";
    roomsHint.style.marginTop = "10px";
    roomsHint.textContent = (getLang()==="en")
      ? "Rooms available for this player number:"
      : "Pokoje dostępne dla tego numeru gracza:";
    wrap.appendChild(roomsHint);

    const select = document.createElement("select");
    select.id = "joinRoomSelectByPlayer";
    select.className = "input";
    select.style.textTransform = "none";
    select.innerHTML = `<option value="">${getLang()==="en" ? "Loading…" : "Ładowanie…"}</option>`;
    wrap.appendChild(select);

    (async ()=>{
      const rooms = await __listRoomsForPlayerNo(currentPlayerNo);
      if(!rooms.length){
        select.innerHTML = `<option value="">${getLang()==="en" ? "No saved rooms for this player" : "Brak pokoi dla tego numeru gracza"}</option>`;
        return;
      }
      select.innerHTML = `<option value="">${getLang()==="en" ? "Choose room from list…" : "Wybierz pokój z listy…"}</option>` + rooms.map(r=>{
        const role = r.admin ? (getLang()==="en" ? "admin" : "admin") : (getLang()==="en" ? "player" : "gracz");
        return `<option value="${escapeHtml(r.code)}">${escapeHtml(r.name)} [${escapeHtml(r.code)}] • ${role}</option>`;
      }).join("");
      if(rooms.length===1){
        select.value = rooms[0].code;
        inp.value = rooms[0].code;
      }else{
        select.value = "";
      }
    })();

    select.addEventListener('change', ()=>{
      const code = String(select.value||'').trim().toUpperCase();
      if(code) inp.value = code;
    });
  }

  const row = document.createElement("div");
row.className = "rowRight";

const btnMenu = makeSysImgButton("btn_menu.png", {
  cls: "sysBtn small",
  alt: "menu",
  title: (getLang()==="en") ? "Menu" : "Menu",
  onClick: ()=>{ modalClose(); openRoomsChoiceModal(); }
});

const btnEnter = makeSysImgButton("btn_wejdz_pokoj.png", {
  cls: "sysBtn",
  alt: "enter",
  title: (getLang()==="en") ? "Join" : "Dołącz",
  onClick: async ()=>{
    const code = (inp.value||"").trim().toUpperCase();
    if(code.length!==6){
      showToast(getLang()==="en" ? "Enter 6-character code" : "Wpisz kod (6 znaków)");
      return;
    }
    modalClose();
    // If the user provided player number via "Mój profil" then we treat join as "New login"
    // (it restores profile + uses existing player doc in the room).
    const pn = String(getPlayerNo() || (getProfile()||{}).playerNo || "").trim().toUpperCase();
    const usePlayerNoLogin = /^[A-Z0-9]{7}$/.test(pn);
    if(usePlayerNoLogin){
      // clear flag so next joins behave normally
      window.__pendingPlayerNoLogin = false;
      await performNewLogin(pn, code);
    }else{
      await joinRoom(code);
    }
  }
});

row.appendChild(btnMenu);
row.appendChild(btnEnter);

  wrap.appendChild(row);

  modalOpen((getLang()==="en") ? "JOIN ROOM" : "DOŁĄCZ DO POKOJU", wrap);
  hideCenterLoading();
  setTimeout(()=>{ inp.focus(); }, 50);
}

// ===== NEW LOGIN (other device) =====
// Wymaga: nr gracza + kod pokoju. Szukamy w rooms/{code}/players dokumentu z playerNo.
function openNewLoginModal(){
  const wrap = document.createElement("div");
  wrap.className = "joinRoom";

  const lab1 = document.createElement("div");
  lab1.className = "muted";
  lab1.textContent = (getLang()==="en")
    ? "Enter player number (e.g. P123456):"
    : "Podaj nr gracza (np. P123456):";
  wrap.appendChild(lab1);

  const inpNo = document.createElement("input");
  inpNo.id = "newLoginPlayerNo";
  inpNo.className = "input";
  inpNo.maxLength = 7;
  inpNo.autocomplete = "off";
  inpNo.placeholder = "P123456";
  inpNo.style.textTransform = "uppercase";
  wrap.appendChild(inpNo);

  const lab2 = document.createElement("div");
  lab2.className = "muted";
  lab2.style.marginTop = "10px";
  lab2.textContent = (getLang()==="en")
    ? "Enter room code (6 characters):"
    : "Podaj kod pokoju (6 znaków):";
  wrap.appendChild(lab2);

  const inpCode = document.createElement("input");
  inpCode.id = "newLoginRoomCode";
  inpCode.className = "input";
  inpCode.maxLength = 6;
  inpCode.autocomplete = "off";
  inpCode.placeholder = "ABC123";
  inpCode.style.textTransform = "uppercase";
  wrap.appendChild(inpCode);

  const row = document.createElement("div");
  row.className = "rowRight";

  const btnNo = makeSysImgButton("btn_no.png", {
    cls:"sysBtn",
    alt:"no",
    title:(getLang()==="en")?"No":"Nie",
    onClick: ()=>{ modalClose(); openRoomsChoiceModal(); }
  });

  const btnYes = makeSysImgButton("btn_yes.png", {
    cls:"sysBtn",
    alt:"yes",
    title:(getLang()==="en")?"Yes":"Tak",
    onClick: async ()=>{
      const pn = String(inpNo.value||"").trim().toUpperCase();
      const code = String(inpCode.value||"").trim().toUpperCase();
      if(!/^[A-Z0-9]{7}$/.test(pn)){
        showToast(getLang()==="en" ? "Invalid player number" : "Niepoprawny nr gracza");
        return;
      }
      if(code.length !== 6){
        showToast(getLang()==="en" ? "Invalid room code" : "Niepoprawny kod pokoju");
        return;
      }
      await performNewLogin(pn, code);
    }
  });

  row.appendChild(btnNo);
  row.appendChild(btnYes);
  wrap.appendChild(row);

  modalOpen((getLang()==="en")?"NEW LOGIN":"NOWE LOGOWANIE", wrap);
  setTimeout(()=> inpNo.focus(), 50);
}


async function __findPlayerDocsInRoomByPlayerNo(roomCode, playerNo){
  const pno = String(playerNo||"").trim().toUpperCase();
  if(!pno || !roomCode) return [];
  try{
    const q = boot.query(playersCol(roomCode), boot.where("playerNo","==", pno));
    const qs = await boot.getDocs(q);
    return qs.docs || [];
  }catch(e){
    console.warn("findPlayerDocsInRoomByPlayerNo failed", e);
    return [];
  }
}

function __joinedAtMs(v){
  try{
    if(!v) return 0;
    if(typeof v.toMillis === 'function') return v.toMillis();
    if(typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds||0)/1e6);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }catch(e){ return 0; }
}

function __chooseCanonicalPlayerDoc(docs){
  if(!Array.isArray(docs) || !docs.length) return null;
  const scored = docs.map(docSnap=>{
    const d = docSnap.data() || {};
    let score = 0;
    if(d.admin) score += 1000;
    if(String(d.nick||'').trim()) score += 50;
    if(String(d.avatar||'').trim()) score += 20;
    if(String(d.country||'').trim()) score += 10;
    if(String(d.favClub||'').trim()) score += 10;
    score -= Math.floor(__joinedAtMs(d.joinedAt) / 1000 / 60 / 60 / 24 / 365); // tiny stabilizer
    return {docSnap, d, score, joined: __joinedAtMs(d.joinedAt)};
  });
  scored.sort((a,b)=>{
    if(b.score !== a.score) return b.score - a.score;
    if(a.joined !== b.joined) return a.joined - b.joined;
    return String(a.docSnap.id).localeCompare(String(b.docSnap.id));
  });
  return scored[0].docSnap;
}

async function __canonicalizeRoomPlayerByPlayerNo(roomCode, playerNo){
  const docs = await __findPlayerDocsInRoomByPlayerNo(roomCode, playerNo);
  if(!docs.length) return null;
  const canonical = __chooseCanonicalPlayerDoc(docs);
  if(!canonical) return null;
  if(docs.length <= 1) return canonical;

  try{
    const canonicalRef = boot.doc(db, 'rooms', roomCode, 'players', canonical.id);
    const canonicalData = canonical.data() || {};
    const patch = {
      uid: canonical.id,
      playerNo: String(playerNo||'').trim().toUpperCase() || null,
      admin: !!canonicalData.admin,
      nick: canonicalData.nick || null,
      country: canonicalData.country || null,
      favClub: canonicalData.favClub || null,
      avatar: canonicalData.avatar || null,
      joinedAt: canonicalData.joinedAt || boot.serverTimestamp(),
      lastActiveAt: boot.serverTimestamp()
    };
    await boot.setDoc(canonicalRef, patch, {merge:true});

    for(const docSnap of docs){
      if(docSnap.id === canonical.id) continue;
      const d = docSnap.data() || {};
      // migrate picks if canonical has none and duplicate has picks
      try{
        const dupPickRef = boot.doc(db, 'rooms', roomCode, 'picks', docSnap.id);
        const canPickRef = boot.doc(db, 'rooms', roomCode, 'picks', canonical.id);
        const [dupPickSnap, canPickSnap] = await Promise.all([boot.getDoc(dupPickRef), boot.getDoc(canPickRef)]);
        const dupPicks = dupPickSnap.exists() ? (dupPickSnap.data()?.picks || null) : null;
        const canPicks = canPickSnap.exists() ? (canPickSnap.data()?.picks || null) : null;
        if(dupPicks && (!canPicks || !Object.keys(canPicks).length)){
          await boot.setDoc(canPickRef, { picks: dupPicks }, {merge:true});
        }
      }catch(e){ console.warn('picks migration failed', e); }

      // merge richer profile/admin fields if duplicate has something missing
      const enrich = {};
      if(d.admin && !canonicalData.admin) enrich.admin = true;
      if(!canonicalData.nick && d.nick) enrich.nick = d.nick;
      if(!canonicalData.country && d.country) enrich.country = d.country;
      if(!canonicalData.favClub && d.favClub) enrich.favClub = d.favClub;
      if(!canonicalData.avatar && d.avatar) enrich.avatar = d.avatar;
      if(Object.keys(enrich).length){
        enrich.uid = canonical.id;
        enrich.playerNo = String(playerNo||'').trim().toUpperCase() || null;
        enrich.lastActiveAt = boot.serverTimestamp();
        await boot.setDoc(canonicalRef, enrich, {merge:true});
      }

      try{ await boot.deleteDoc(boot.doc(db, 'rooms', roomCode, 'players', docSnap.id)); }catch(e){ console.warn('dup player delete failed', e); }
      try{ await boot.deleteDoc(boot.doc(db, 'rooms', roomCode, 'picks', docSnap.id)); }catch(e){}
    }
  }catch(e){
    console.warn('__canonicalizeRoomPlayerByPlayerNo failed', e);
  }
  return canonical;
}

async function __resolveRoomIdentityByPlayerNo(roomCode, playerNo){
  const pno = String(playerNo||'').trim().toUpperCase();
  if(!roomCode || !pno) return null;
  const canonical = await __canonicalizeRoomPlayerByPlayerNo(roomCode, pno);
  if(canonical){
    userUid = canonical.id;
    return canonical;
  }
  return null;
}

async function __listRoomsForPlayerNo(playerNo){
  const pno = String(playerNo||'').trim().toUpperCase();
  if(!pno) return [];
  const out = [];
  try{
    const roomsSnap = await boot.getDocs(boot.collection(db, 'rooms'));
    for(const roomDoc of roomsSnap.docs || []){
      const code = String(roomDoc.id || '').trim().toUpperCase();
      if(code.length !== 6) continue;
      const data = roomDoc.data() || {};
      const docs = await __findPlayerDocsInRoomByPlayerNo(code, pno);
      if(docs.length){
        const canonical = __chooseCanonicalPlayerDoc(docs);
        const pd = canonical ? (canonical.data() || {}) : {};
        out.push({
          code,
          name: String(data.name || code),
          admin: !!pd.admin,
          joinedAtMs: __joinedAtMs(pd.joinedAt)
        });
      }
    }
  }catch(e){ console.warn('__listRoomsForPlayerNo failed', e); }
  out.sort((a,b)=>{
    if(b.joinedAtMs !== a.joinedAtMs) return b.joinedAtMs - a.joinedAtMs;
    return String(a.name).localeCompare(String(b.name), 'pl');
  });
  return out;
}

async function performNewLogin(playerNo, roomCode){
  try{
    const pno = String(playerNo||"").trim().toUpperCase();
    const code = String(roomCode||"").trim().toUpperCase();
    const snap = await boot.getDoc(roomRef(code));
    if(!snap.exists()){
      showToast(getLang()==="en" ? "Room not found" : "Nie ma takiego pokoju");
      return;
    }

    const canonical = await __resolveRoomIdentityByPlayerNo(code, pno);
    if(!canonical){
      showToast(getLang()==="en" ? "Player number not found in this room" : "Nie znaleziono nr gracza w tym pokoju");
      return;
    }

    const data = canonical.data() || {};
    if(data.nick) localStorage.setItem(KEY_NICK, String(data.nick));
    const prof = getProfile() || {};
    if(data.country) prof.country = String(data.country);
    if(data.favClub) prof.favClub = String(data.favClub);
    if(data.avatar) prof.avatar = String(data.avatar);
    prof.nick = String(data.nick || prof.nick || "");
    prof.playerNo = pno;
    setProfile(prof);
    localStorage.setItem(KEY_PLAYER_NO, pno);
    localStorage.setItem(KEY_LAST_PLAYERNO, pno);
    __setAuthedThisSession(pno);

    localStorage.setItem(KEY_ACTIVE_ROOM, code);
    pushRoomHistory(code);

    window.__pendingPlayerNoLogin = false;
    modalClose();
    await openRoom(code, {force:true});
  }catch(e){
    console.error(e);
    showToast(getLang()==="en" ? "Cannot login" : "Nie udało się zalogować");
  }
}

function openCreateRoomModal(){
  const wrap = document.createElement("div");
  wrap.className = "createRoom";

  const lab = document.createElement("div");
  lab.className = "muted";
  lab.textContent = (getLang()==="en")
    ? "Room name:"
    : "Nazwa pokoju:";
  wrap.appendChild(lab);

  const inp = document.createElement("input");
  inp.id = "createRoomNameInput";
  inp.className = "input";
  inp.maxLength = 24;
  inp.autocomplete = "off";
  inp.placeholder = (getLang()==="en") ? "e.g. Friends League" : "np. Ekipa znajomych";
  wrap.appendChild(inp);

  const row = document.createElement("div");
  row.className = "rowRight";

const btnMenu = makeSysImgButton("btn_menu.png", {
  cls: "sysBtn small",
  alt: "menu",
  title: (getLang()==="en") ? "Menu" : "Menu",
  onClick: ()=>{ modalClose(); openRoomsChoiceModal(); }
});

const btnCreate = makeSysImgButton("btn_zaloz.png", {
  cls: "sysBtn",
  alt: "create",
  title: (getLang()==="en") ? "Create" : "Stwórz",
  onClick: async ()=>{
    const name = (inp.value||"").trim();
    if(name.length<2){
      showToast(getLang()==="en" ? "Enter room name" : "Wpisz nazwę pokoju");
      return;
    }
    modalClose();
    await createRoom(name);
  }
});

row.appendChild(btnMenu);
row.appendChild(btnCreate);

  wrap.appendChild(row);

  modalOpen((getLang()==="en") ? "CREATE ROOM" : "STWÓRZ POKÓJ", wrap);
  setTimeout(()=>{ inp.focus(); }, 50);
}



// ===== Clear profile (wipe all local data + caches) =====
async function clearProfile(){
  const ok = await customConfirmClearProfile();
  if(!ok) return;
  try{
    localStorage.clear();
    sessionStorage.clear();

    // Clear Cache Storage (PWA)
    if ("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    // Unregister service workers
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }

    showToast(t("cleared"));
    setTimeout(()=> location.reload(), 450);
  }catch(e){
    console.error(e);
    alert(t("clearFailed"));
  }
}

// Custom confirm modal for clearing profile (instead of system confirm)
// Uses ui/buttons/{lang}/btn_yes.png and btn_no.png
let _clearProfileConfirmModal = null;
function ensureClearProfileConfirmModal(){
  if(_clearProfileConfirmModal) return _clearProfileConfirmModal;

  if(!document.getElementById('clearProfileConfirmStyles')){
    const st = document.createElement('style');
    st.id = 'clearProfileConfirmStyles';
    st.textContent = `
      .clearProfileOverlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;}
      .clearProfileBox{width:min(860px,92vw);background:rgba(6,18,40,.92);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:22px 22px 18px;}
      .clearProfileTitle{font-weight:900;font-size:22px;margin:0 0 10px 0;color:#fff;}
      .clearProfileText{font-weight:650;line-height:1.35;font-size:15px;color:rgba(255,255,255,.90);white-space:pre-wrap;}
      .clearProfileActions{display:flex;gap:18px;justify-content:center;align-items:center;margin-top:18px;}
      .clearProfileBtnImg{height:58px;cursor:pointer;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));}
      .clearProfileBtnImg:active{transform:translateY(1px);} 
      @media (max-width:520px){.clearProfileBtnImg{height:52px;}}
    `;
    document.head.appendChild(st);
  }

  const overlay = document.createElement('div');
  overlay.className = 'clearProfileOverlay';
  overlay.innerHTML = `
    <div class="clearProfileBox" role="dialog" aria-modal="true">
      <div class="clearProfileTitle">${getLang()==='en' ? 'Delete profile' : 'Skasuj profil'}</div>
      <div class="clearProfileText" id="clearProfileConfirmText"></div>
      <div class="clearProfileActions">
        <img id="clearProfileBtnYes" class="clearProfileBtnImg" alt="YES" />
        <img id="clearProfileBtnNo" class="clearProfileBtnImg" alt="NO" />
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const elText = overlay.querySelector('#clearProfileConfirmText');
  const btnYes = overlay.querySelector('#clearProfileBtnYes');
  const btnNo = overlay.querySelector('#clearProfileBtnNo');

  let _resolver = null;
  function close(val){
    overlay.style.display = 'none';
    const r = _resolver; _resolver = null;
    if(r) r(val);
  }

  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(false); });
  btnNo.addEventListener('click', ()=>close(false));
  btnYes.addEventListener('click', ()=>close(true));

  _clearProfileConfirmModal = {
    open: (text)=>{
      const lang = getLang()==='en' ? 'en' : 'pl';
      btnYes.src = `ui/buttons/${lang}/btn_yes.png`;
      btnNo.src  = `ui/buttons/${lang}/btn_no.png`;
      elText.textContent = text;
      overlay.style.display = 'flex';
      return new Promise(resolve=>{ _resolver = resolve; });
    }
  };

  return _clearProfileConfirmModal;
}

// ===== RIGHT PANEL: players list should fill space until buttons, scroll only on overflow =====
function ensurePlayersPanelFillFix(){
  if(document.getElementById('playersPanelFillFix')) return;
  const st = document.createElement('style');
  st.id = 'playersPanelFillFix';
  st.textContent = `
    /* Right panel layout: allow playersList to grow to bottom stack */
    .rightBar{display:flex;flex-direction:column;}
    .rightBar .playersList{flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch;}
    .rightBar .rightBottomStack{flex:0 0 auto;}
    /* remove spacer that was stealing space */
    .rightBar > .spacer{display:none !important;}
    /* optional: hide scrollbar visuals but keep scroll */
    .rightBar .playersList{scrollbar-width:none;}
    .rightBar .playersList::-webkit-scrollbar{width:0;height:0;}
  `;
  document.head.appendChild(st);
}

async function customConfirmClearProfile(){
  const txt = (getLang()==='en')
    ? 'Are you sure you want to delete your profile? Deleting it will remove all your stats and everything related to this profile. Do you confirm deleting the profile?'
    : 'Czy na pewno chcesz skasować swój profil. Usunięcie go spowoduje utratę wszystkich statystyk i wszystkiego co z tym profilem jest związane. Czy potwierdzasz usunięcie profilu?';
  return await ensureClearProfileConfirmModal().open(txt);
}


// ===== Delete player (admin) confirm modal (YES/NO) =====
// Uses ui/buttons/{lang}/btn_yes.png and btn_no.png
let _deletePlayerConfirmModal = null;
function ensureDeletePlayerConfirmModal(){
  if(_deletePlayerConfirmModal) return _deletePlayerConfirmModal;

  if(!document.getElementById('deletePlayerConfirmStyles')){
    const st = document.createElement('style');
    st.id = 'deletePlayerConfirmStyles';
    st.textContent = `
      .deletePlayerOverlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;}
      .deletePlayerBox{width:min(820px,92vw);background:rgba(6,18,40,.92);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:22px 22px 18px;}
      .deletePlayerTitle{font-weight:900;font-size:22px;margin:0 0 10px 0;color:#fff;}
      .deletePlayerText{font-weight:650;line-height:1.35;font-size:15px;color:rgba(255,255,255,.90);white-space:pre-wrap;}
      .deletePlayerActions{display:flex;gap:18px;justify-content:center;align-items:center;margin-top:18px;}
      .deletePlayerBtnImg{height:58px;cursor:pointer;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));}
      .deletePlayerBtnImg:active{transform:translateY(1px);} 
      @media (max-width:520px){.deletePlayerBtnImg{height:52px;}}
    `;
    document.head.appendChild(st);
  }

  const overlay = document.createElement('div');
  overlay.className = 'deletePlayerOverlay';
  overlay.innerHTML = `
    <div class="deletePlayerBox" role="dialog" aria-modal="true">
      <div class="deletePlayerTitle">${getLang()==='en' ? 'Delete player' : 'Usuń gracza'}</div>
      <div class="deletePlayerText" id="deletePlayerConfirmText"></div>
      <div class="deletePlayerActions">
        <img id="deletePlayerBtnYes" class="deletePlayerBtnImg" alt="YES" />
        <img id="deletePlayerBtnNo" class="deletePlayerBtnImg" alt="NO" />
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const elText = overlay.querySelector('#deletePlayerConfirmText');
  const btnYes = overlay.querySelector('#deletePlayerBtnYes');
  const btnNo = overlay.querySelector('#deletePlayerBtnNo');

  let _resolver = null;
  function close(val){
    overlay.style.display = 'none';
    const r = _resolver; _resolver = null;
    if(r) r(val);
  }

  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(false); });
  btnNo.addEventListener('click', ()=>close(false));
  btnYes.addEventListener('click', ()=>close(true));

  _deletePlayerConfirmModal = {
    open: (text)=>{
      const lang = getLang()==='en' ? 'en' : 'pl';
      btnYes.src = `ui/buttons/${lang}/btn_yes.png`;
      btnNo.src  = `ui/buttons/${lang}/btn_no.png`;
      elText.textContent = text;
      overlay.style.display = 'flex';
      return new Promise(resolve=>{ _resolver = resolve; });
    }
  };

  return _deletePlayerConfirmModal;
}

async function confirmDeletePlayer(nick){
  const txt = (getLang()==='en')
    ? `Delete player and permanently remove them?\n\nPlayer: ${nick}`
    : `Czy skasować i bezpowrotnie usunąć gracza?\n\nGracz: ${nick}`;
  return await ensureDeletePlayerConfirmModal().open(txt);
}

async function adminDeletePlayer(uid, nick){
  if(!isAdmin()) return;
  if(!currentRoomCode) return;
  if(uid === currentRoom?.adminUid) { showToast(getLang()==='en' ? "Can't delete admin" : "Nie można usunąć admina"); return; }
  if(uid === userUid) { showToast(getLang()==='en' ? "Can't delete yourself" : "Nie można usunąć siebie"); return; }

  const ok = await confirmDeletePlayer(nick || "—");
  if(!ok) return;

  try{
    await boot.deleteDoc(boot.doc(db, "rooms", currentRoomCode, "picks", uid));
  }catch{}
  try{
    await boot.deleteDoc(boot.doc(db, "rooms", currentRoomCode, "players", uid));
  }catch(e){
    console.error(e);
  }

  // Exit delete mode after action
  deletePlayerMode = false;
  renderPlayers(lastPlayers);
}


// ===== "My profile" – enter player number modal (YES/NO) =====
// Uses ui/buttons/{lang}/btn_yes.png and btn_no.png
let _myProfileNoModal = null;
function ensureMyProfileNoModal(){
  if(_myProfileNoModal) return _myProfileNoModal;

  if(!document.getElementById('myProfileNoStyles')){
    const st = document.createElement('style');
    st.id = 'myProfileNoStyles';
    st.textContent = `
      .myProfileNoOverlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;}
      .myProfileNoBox{width:min(780px,92vw);background:rgba(6,18,40,.92);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:22px 22px 18px;}
      .myProfileNoTitle{font-weight:900;font-size:22px;margin:0 0 10px 0;color:#fff;}
      .myProfileNoText{font-weight:650;line-height:1.35;font-size:15px;color:rgba(255,255,255,.90);white-space:pre-wrap;margin-bottom:12px;}
      .myProfileNoRow{display:flex;justify-content:center;margin:12px 0 6px;}
      .myProfileNoInput{width:min(420px,86vw);padding:10px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.25);background:#fff;color:#000;font-weight:800;letter-spacing:.5px;text-transform:uppercase;}
      .myProfileNoActions{display:flex;gap:18px;justify-content:center;align-items:center;margin-top:16px;}
      .myProfileNoBtnImg{height:58px;cursor:pointer;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));}
      .myProfileNoBtnImg:active{transform:translateY(1px);} 
      @media (max-width:520px){.myProfileNoBtnImg{height:52px;}}
    `;
    document.head.appendChild(st);
  }

  const overlay = document.createElement('div');
  overlay.className = 'myProfileNoOverlay';
  overlay.innerHTML = `
    <div class="myProfileNoBox" role="dialog" aria-modal="true">
      <div class="myProfileNoTitle">${getLang()==='en' ? 'My profile' : 'Mój profil'}</div>
      <div class="myProfileNoText" id="myProfileNoText">${getLang()==='en' ? 'Enter player number' : 'Wpisz nr gracza'}</div>
      <div class="myProfileNoRow">
        <input id="myProfileNoInput" class="myProfileNoInput" type="text" maxlength="7" placeholder="A123456" />
      </div>
      <div class="myProfileNoActions">
        <img id="myProfileNoYes" class="myProfileNoBtnImg" alt="YES" />
        <img id="myProfileNoNo" class="myProfileNoBtnImg" alt="NO" />
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const inp = overlay.querySelector('#myProfileNoInput');
  const btnYes = overlay.querySelector('#myProfileNoYes');
  const btnNo = overlay.querySelector('#myProfileNoNo');

  let _resolver = null;
  function close(val){
    overlay.style.display = 'none';
    const r = _resolver; _resolver = null;
    if(r) r(val);
  }

  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(null); });
  btnNo.addEventListener('click', ()=>close(null));
  btnYes.addEventListener('click', ()=>{
    const raw = String(inp.value || '').trim().toUpperCase();
    close(raw);
  });

  _myProfileNoModal = {
    open: ()=>{
      const lang = getLang()==='en' ? 'en' : 'pl';
      btnYes.src = `ui/buttons/${lang}/btn_yes.png`;
      btnNo.src  = `ui/buttons/${lang}/btn_no.png`;
      inp.value = "";
      overlay.style.display = 'flex';
      setTimeout(()=>{ try{ inp.focus(); }catch(e){} }, 50);
      return new Promise(resolve=>{ _resolver = resolve; });
    }
  };

  return _myProfileNoModal;
}

async function askAndSetPlayerNoFromMyProfile(){
  const lang = getLang();
  const raw = await ensureMyProfileNoModal().open();
  if(!raw) return;

  // Accept formats: A123456 or just 123456 (then prefix from profile/country or X)
  let val = raw;
  if(/^[0-9]{6}$/.test(val)){
    const p = getProfile() || {};
    const c = String(p.country || "").trim().toUpperCase();
    const prefix = (c && /^[A-Z]{2}$/.test(c)) ? c[0] : "X";
    val = prefix + val;
  }
  if(!/^[A-Z][0-9]{6}$/.test(val)){
    showToast(lang==='en' ? 'Invalid player number. Use A123456.' : 'Niepoprawny nr gracza. Użyj formatu A123456.');
    return;
  }

  localStorage.setItem(KEY_PLAYER_NO, val);
  const p = getProfile() || {};
  p.playerNo = val;
  setProfile(p);

  // Update readonly field if profile modal is open
  const pnEl = document.getElementById("profilePlayerNo");
  if(pnEl) pnEl.value = val;

  try{ updatePlayerDocProfile(); }catch{}
  showToast(lang==='en' ? 'Player number saved.' : 'Nr gracza zapisany.');

  // After entering player number, go straight to room join/create window.
  // Next join action will use playerNo-based login (restore profile from room).
  window.__pendingPlayerNoLogin = true;
  try{ openRoomsChoiceModal(); }catch{}
}

// ===== Settings modal =====
function openSettings(){
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "12px";

  const head = document.createElement("div");
  head.className = "chip";
  head.textContent = t("settings");
  // delikatnie większy nagłówek w oknie Ustawień
  head.style.fontSize = "18px";
  head.style.padding = "12px 16px";
  wrap.appendChild(head);

  // Przyciski: Profil + Reset profilu (bez avatara i bez opisów)
  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "14px";
  btnRow.style.flexWrap = "wrap";

  const btnProfil = document.createElement("button");
  btnProfil.className = "imgBtn sysBtn sysBtnBig";
  btnProfil.type = "button";
  btnProfil.title = (getLang()==="pl") ? "Profil" : "Profile";
  btnProfil.setAttribute("aria-label", btnProfil.title);
  const imgProfil = document.createElement("img");
  imgProfil.dataset.btn = "btn_profil.png";
  imgProfil.alt = btnProfil.title;
  imgProfil.src = getBtnDir() + mapBtnName("btn_profil.png");
  btnProfil.appendChild(imgProfil);
  btnProfil.onclick = ()=> openProfileModal({required:false});
  btnRow.appendChild(btnProfil);

  const btnClear = document.createElement("button");
  btnClear.className = "imgBtn sysBtn sysBtnBig";
  btnClear.type = "button";
  btnClear.title = t("clearProfile");
  btnClear.setAttribute("aria-label", t("clearProfile"));
  const img = document.createElement("img");
  img.dataset.btn = "btn_reset_profilu.png";
  img.alt = t("clearProfile");
  img.src = getBtnDir() + mapBtnName("btn_reset_profilu.png");
  btnClear.appendChild(img);
  btnClear.onclick = () => clearProfile();
  // reset obok Profil
  btnRow.appendChild(btnClear);

  wrap.appendChild(btnRow);

  modalOpen(t("settings"), wrap);
}


function getNick(){
  return (localStorage.getItem(KEY_NICK) || "").trim();
}
async function ensureNick(){
  let nick = getNick();
  if(nick) return nick;

  while(!nick){
    const res = await nickModalAsk();
    if(res === null) return null; // cancelled
    nick = (res || "").trim();
    if (nick.length < 3 || nick.length > 16){
      nick = "";
      showToast(t("nickInvalid"));
    }
  }

  localStorage.setItem(KEY_NICK, nick);
  refreshNickLabels();
  return nick;
}

// =====================
// PROFIL (v1)
// =====================
function getProfile(){
  try{
    const raw = localStorage.getItem(KEY_PROFILE);
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

function setProfile(p){
  localStorage.setItem(KEY_PROFILE, JSON.stringify(p || {}));
}

function getPlayerNo(){
  const p = getProfile() || {};
  const fromProfile = String(p.playerNo || "").trim();
  const fromLS = String(localStorage.getItem(KEY_PLAYER_NO) || "").trim();
  const val = (fromProfile || fromLS).toUpperCase();
  return /^[A-Z]\d{6}$/.test(val) ? val : "";
}

// ===== PIN LOGIN (local per device) =====
const KEY_SESSION_AUTH = "typer_session_auth_v1";
const KEY_LAST_PLAYERNO = "typer_last_playerno_v1";
const KEY_PINHASH_PREFIX = "typer_pinhash_"; // + playerNo

function __pinKey(playerNo){
  return KEY_PINHASH_PREFIX + String(playerNo||"").trim().toUpperCase();
}

// Simple SHA-256 hash (browser native)
async function __sha256(text){
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function __getStoredPinHash(playerNo){
  try{ return (localStorage.getItem(__pinKey(playerNo)) || "").trim(); }catch(e){ return ""; }
}

async function __setStoredPinHash(playerNo, pin){
  const pno = String(playerNo||"").trim().toUpperCase();
  const hash = await __sha256(pno + "|" + String(pin));
  localStorage.setItem(__pinKey(pno), hash);
  return hash;
}

function __isAuthedThisSession(playerNo){
  try{
    const v = (sessionStorage.getItem(KEY_SESSION_AUTH) || "").trim().toUpperCase();
    return v && v === String(playerNo||"").trim().toUpperCase();
  }catch(e){ return false; }
}

function __setAuthedThisSession(playerNo){
  try{ sessionStorage.setItem(KEY_SESSION_AUTH, String(playerNo||"").trim().toUpperCase()); }catch(e){}
}

function __makeLoginModal(){
  const existing = document.getElementById("pinLoginModal");
  if(existing) return existing;

  const wrap = document.createElement("div");
  wrap.id = "pinLoginModal";
  wrap.className = "modal active";
  wrap.innerHTML = `
    <div class="modalBox" style="max-width:560px; width:min(92vw,560px);">
      <div class="modalTitle" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div style="font-size:22px;font-weight:800;">${(getLang()==="en")?"Login":"Logowanie"}</div>
      </div>

      <div style="margin-top:10px;opacity:.9;font-size:14px;">
        ${(getLang()==="en")?"Enter your Player No and 4-digit PIN.":"Wpisz nr gracza i 4-cyfrowy PIN."}
      </div>

      <div style="margin-top:14px;display:grid;grid-template-columns:1fr;gap:10px;">
        <label style="display:grid;gap:6px;">
          <span style="font-weight:700;">${(getLang()==="en")?"Player No":"Nr gracza"}</span>
          <input id="pinLoginPlayerNo" class="inp" autocomplete="username" inputmode="text" placeholder="P123456" style="padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.25);color:#fff;"/>
        </label>

        <label style="display:grid;gap:6px;">
          <span style="font-weight:700;">${(getLang()==="en")?"PIN (4 digits)":"PIN (4 cyfry)"}</span>
          <input id="pinLoginPin" class="inp" autocomplete="current-password" inputmode="numeric" maxlength="4" placeholder="1234" style="padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.25);color:#fff;"/>
        </label>

        <div id="pinLoginSetArea" style="display:none;gap:10px;">
          <div style="margin-top:2px;opacity:.9;font-size:13px;">
            ${(getLang()==="en")?"No PIN set for this Player No on this device. Set a new PIN now.":"Brak PIN dla tego nr gracza na tym urządzeniu. Ustaw nowy PIN."}
          </div>
          <label style="display:grid;gap:6px;">
            <span style="font-weight:700;">${(getLang()==="en")?"Repeat PIN":"Powtórz PIN"}</span>
            <input id="pinLoginPin2" class="inp" autocomplete="new-password" inputmode="numeric" maxlength="4" placeholder="1234" style="padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.25);color:#fff;"/>
          </label>
        </div>

        <div id="pinLoginError" style="display:none;color:#ff9b9b;font-weight:700;"></div>

        <div style="display:flex;gap:14px;justify-content:center;margin-top:6px;flex-wrap:wrap;">
          <img id="pinLoginYes" class="imgBtn" alt="YES" src="${getBtnDir()}/btn_yes.png" style="height:54px;cursor:pointer;"/>
          <img id="pinLoginNo" class="imgBtn" alt="NO" src="${getBtnDir()}/btn_no.png" style="height:54px;cursor:pointer;"/>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  return wrap;
}

async function ensurePinLogin(force=false){
  // Normally we may skip within the same tab session,
  // but on app start we want to always show the login modal with the last player number.
  const last = (localStorage.getItem(KEY_LAST_PLAYERNO) || "").trim();
  if(!force && last && __isAuthedThisSession(last)) return true;

  return await new Promise((resolve)=>{
    const modal = __makeLoginModal();
    const inpNo = modal.querySelector("#pinLoginPlayerNo");
    const inpPin = modal.querySelector("#pinLoginPin");
    const setArea = modal.querySelector("#pinLoginSetArea");
    const inpPin2 = modal.querySelector("#pinLoginPin2");
    const err = modal.querySelector("#pinLoginError");

    const showErr = (msg)=>{
      err.textContent = msg;
      err.style.display = "block";
    };
    const clearErr = ()=>{ err.style.display="none"; err.textContent=""; };

    // prefill last playerNo
    if(last) inpNo.value = last;

    const refreshSetArea = ()=>{
      const pno = String(inpNo.value||"").trim().toUpperCase();
      if(!pno){ setArea.style.display="none"; return; }
      const has = !!__getStoredPinHash(pno);
      setArea.style.display = has ? "none" : "grid";
    };

    inpNo.addEventListener("input", refreshSetArea);
    refreshSetArea();

    // Focus PIN when last player number is available; otherwise focus player number.
    setTimeout(()=>{
      try{
        if(last){ inpPin.focus(); inpPin.select?.(); }
        else { inpNo.focus(); inpNo.select?.(); }
      }catch(e){}
    }, 20);

    modal.querySelector("#pinLoginNo").onclick = ()=>{ 
      // do not allow continue without login
      showErr((getLang()==="en")?"Login required.":"Logowanie wymagane.");
    };

    modal.querySelector("#pinLoginYes").onclick = async ()=>{
      clearErr();
      const pno = String(inpNo.value||"").trim().toUpperCase();
      const pin = String(inpPin.value||"").trim();
      if(!pno){ showErr((getLang()==="en")?"Enter Player No.":"Wpisz nr gracza."); return; }
      if(!/^[A-Z]\d{6}$/.test(pno) && !/^\d{6,8}$/.test(pno)){
        // allow older formats, just require something non-empty
      }

      const stored = __getStoredPinHash(pno);

      if(stored){
        if(!/^\d{4}$/.test(pin)){ showErr((getLang()==="en")?"Enter 4-digit PIN.":"Wpisz 4-cyfrowy PIN."); return; }
        const hash = await __sha256(pno + "|" + pin);
        if(hash !== stored){
          showErr((getLang()==="en")?"Wrong PIN.":"Błędny PIN.");
          return;
        }
      }else{
        // first time on this device: set PIN
        const pin2 = String(inpPin2.value||"").trim();
        if(!/^\d{4}$/.test(pin)){ showErr((getLang()==="en")?"Set a 4-digit PIN.":"Ustaw 4-cyfrowy PIN."); return; }
        if(pin !== pin2){ showErr((getLang()==="en")?"PINs do not match.":"PIN-y nie są takie same."); return; }
        await __setStoredPinHash(pno, pin);
      }

      // success
      try{ localStorage.setItem(KEY_LAST_PLAYERNO, pno); }catch(e){}
      __setAuthedThisSession(pno);

      // also store in profile if available (so join-room by playerNo works)
      try{
        const prof = getProfile() || {};
        prof.playerNo = pno;
        setProfile(prof);
      }catch(e){}

      modal.classList.remove("active");
      resolve(true);
    };
  });
}

function ensurePlayerNoForCountry(countryCode){
  const c = String(countryCode || "").trim().toUpperCase();
  const prefix = (c && /^[A-Z]{2}$/.test(c)) ? c[0] : "X";

  // Jeśli jest już poprawny numer — dopasuj tylko literę do kraju
  const existing = getPlayerNo();
  if(existing){
    const digits = existing.slice(1);
    const next = prefix + digits;
    localStorage.setItem(KEY_PLAYER_NO, next);
    const p = getProfile() || {};
    p.playerNo = next;
    setProfile(p);
    return next;
  }

  const digits = String(Math.floor(Math.random()*1_000_000)).padStart(6, "0");
  const next = prefix + digits;
  localStorage.setItem(KEY_PLAYER_NO, next);
  const p = getProfile() || {};
  p.playerNo = next;
  setProfile(p);
  return next;
}

function isProfileComplete(p){
  if(!p) return false;
  const nickOk = typeof p.nick === "string" && p.nick.trim().length >= 3;
  const c = String(p.country || "").trim();
  // Accept any ISO-3166 alpha-2 country/region code from our list
  const countryOk = /^[a-z]{2}$/i.test(c) && __COUNTRY_CODE_SET.has(c.toUpperCase());
  return nickOk && countryOk;
}

// ISO 3166-1 alpha-2 country/region codes (plus XK used by many services for Kosovo)
const __COUNTRY_CODES = [
  "AF","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ",
  "BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BV","BR","IO","BN","BG","BF","BI",
  "CV","KH","CM","CA","KY","CF","TD","CL","CN","CX","CC","CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ",
  "DK","DJ","DM","DO",
  "EC","EG","SV","GQ","ER","EE","SZ","ET",
  "FK","FO","FJ","FI","FR","GF","PF","TF",
  "GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY",
  "HT","HM","VA","HN","HK","HU",
  "IS","IN","ID","IR","IQ","IE","IM","IL","IT",
  "JM","JP","JE","JO",
  "KZ","KE","KI","KP","KR","KW","KG",
  "LA","LV","LB","LS","LR","LY","LI","LT","LU",
  "MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS","MA","MZ","MM",
  "NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","MK","MP","NO",
  "OM",
  "PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR","QA",
  "RE","RO","RU","RW",
  "BL","SH","KN","LC","MF","PM","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS","SS","ES","LK","SD","SR","SJ","SE","CH","SY",
  "TW","TJ","TZ","TH","TL","TG","TK","TO","TT","TN","TR","TM","TC","TV",
  "UG","UA","AE","GB","UM","US","UY","UZ",
  "VU","VE","VN","VG","VI",
  "WF","EH",
  "YE",
  "ZM","ZW",
  "XK"
];
const __COUNTRY_CODE_SET = new Set(__COUNTRY_CODES);

function __getCountryDisplayName(lang, codeUpper){
  // Prefer native browser localization if available
  try{
    if(typeof Intl !== "undefined" && Intl.DisplayNames){
      const dn = new Intl.DisplayNames([lang || "en"], {type:"region"});
      const n = dn.of(codeUpper);
      if(n) return n;
    }
  }catch(e){/* ignore */}
  // Fallbacks (keep a couple common-friendly labels)
  if(codeUpper === "GB") return (lang === "pl") ? "Wielka Brytania" : "United Kingdom";
  if(codeUpper === "US") return (lang === "pl") ? "Stany Zjednoczone" : "United States";
  if(codeUpper === "PL") return (lang === "pl") ? "Polska" : "Poland";
  if(codeUpper === "XK") return (lang === "pl") ? "Kosowo" : "Kosovo";
  return codeUpper;
}

function __buildCountryOptionsHtml(lang){
  const opts = [];
  // Empty option first so the select can start blank
  opts.push('<option value=""></option>');
  for(const codeUpper of __COUNTRY_CODES){
    const value = codeUpper.toLowerCase();
    const name = __getCountryDisplayName(lang, codeUpper);
    opts.push(`<option value="${value}">${escapeHtml(name)}</option>`);
  }
  return opts.join("\n");
}


/* v4007: Avatar picker (auto-detect ui/avatars/avatar_1..avatar_60) */
let __avatarPickerStylesAdded = false;

function __injectAvatarPickerStyles(){
  if(__avatarPickerStylesAdded) return;
  __avatarPickerStylesAdded = true;
  const st = document.createElement("style");
  st.textContent = `
  .avatarPickerOverlay{
    position: fixed; inset: 0; z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,.45);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .avatarPickerPanel{
    width: min(860px, 92vw);
    max-height: min(640px, 82vh);
    overflow: hidden;
    border-radius: 22px;
    background: rgba(10,24,44,.88);
    box-shadow: 0 18px 40px rgba(0,0,0,.45);
    border: 1px solid rgba(255,255,255,.12);
  }
  .avatarPickerHeader{
    display:flex; align-items:center; justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,.10);
  }
  .avatarPickerTitle{
    font-weight: 800;
    font-size: 22px;
    letter-spacing: .2px;
  }
  .avatarPickerClose{
    cursor:pointer;
    padding: 8px 12px;
    border-radius: 12px;
    background: rgba(255,255,255,.10);
    border: 1px solid rgba(255,255,255,.12);
    color: #fff;
    font-weight: 700;
  }
  .avatarPickerBody{
    padding: 14px 16px 18px;
    overflow: auto;
    max-height: calc(min(640px, 82vh) - 58px);
  }
  .avatarGrid{
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(74px, 1fr));
    gap: 12px;
  }
  .avatarItem{
    cursor: pointer;
    border-radius: 16px;
    padding: 10px;
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.10);
    transition: transform .08s ease, background .12s ease;
    display:flex; align-items:center; justify-content:center;
  }
  .avatarItem:hover{ transform: translateY(-1px); background: rgba(255,255,255,.10); }
  .avatarItemSelected{ outline: 2px solid rgba(110,210,255,.9); }
  .avatarItem img{
    width: 58px; height: 58px;
    object-fit: contain;
    image-rendering: auto;
  }
  .profileAvatarImg{
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 16px;
    display: block;
  }
  /* Profil: stały rozmiar boksu avatara, aby obraz nie rozjeżdżał układu przy pierwszym wejściu */
  .profileAvatarBox{
    width: 180px;
    height: 180px;
    border-radius: 18px;
    overflow: hidden;
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.10);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  `;
  document.head.appendChild(st);
}

function __avatarCacheBust(){
  // Stabilny cache-bust w obrębie builda
  const v = (window && window.__BUILD) ? window.__BUILD : "";
  return v ? `?v=${encodeURIComponent(v)}` : "";
}

function __normalizeAvatarValue(val){
  if(!val) return "";
  if(typeof val !== "string") return "";
  // usuń ewentualny query string / hash (cache bust)
  const cleaned = val.split("?")[0].split("#")[0].trim();
  if(!cleaned) return "";
  // allow either 'avatar_1.png' / 'avatar_1.jpg' or full 'ui/avatars/avatar_1.png'
  if(cleaned.includes("/")) return cleaned;
  return `ui/avatars/${cleaned}`;
}

function __probeImage(url, timeoutMs=2500){
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok) => { if(done) return; done = true; resolve(ok); };
    const t = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => { clearTimeout(t); finish(true); };
    img.onerror = () => { clearTimeout(t); finish(false); };
    img.src = url + __avatarCacheBust();
  });
}

async function __listAvailableAvatars(max=60){
  // Avatary mogą być w .png (docelowo) lub .jpg/.jpeg (obecnie w repozytorium)
  // Skanujemy avatar_1..avatar_N i kończymy po kilku brakach z rzędu.
  const present = [];
  let missStreak = 0;

  for(let i=1;i<=max;i++){
    const candidates = [
      `ui/avatars/avatar_${i}.png`,
      `ui/avatars/avatar_${i}.jpg`,
      `ui/avatars/avatar_${i}.jpeg`,
    ];

    let found = "";
    for(const u of candidates){
      // eslint-disable-next-line no-await-in-loop
      const ok = await __probeImage(u);
      if(ok){ found = u; break; }
    }

    if(found){
      present.push(found);
      missStreak = 0;
    }else{
      missStreak++;
      if(missStreak >= 5) break;
    }
  }

  return present;
}

function __avatarValueToStore(val){
  // zapisuj jako samą nazwę pliku, żeby nie mieszać ścieżek i cache-bustów
  if(!val) return "";
  const cleaned = String(val).split("?")[0].split("#")[0].trim();
  return cleaned.split("/").pop();
}

function openAvatarPicker({lang="pl", current="", onPick}={}){
  __injectAvatarPickerStyles();

  const currentNorm = __normalizeAvatarValue(current);
  const title = (lang==="en") ? "Choose avatar" : "Wybierz avatar";
  const closeTxt = (lang==="en") ? "Close" : "Zamknij";
  const loadingTxt = (lang==="en") ? "Loading..." : "Ładowanie...";
  const emptyTxt = (lang==="en")
    ? "No avatars found in ui/avatars (expected avatar_1.png / avatar_1.jpg ...)."
    : "Nie znaleziono avatarów w ui/avatars (oczekiwane avatar_1.png / avatar_1.jpg ...).";

  const overlay = document.createElement("div");
  overlay.className = "avatarPickerOverlay";
  overlay.innerHTML = `
    <div class="avatarPickerPanel" role="dialog" aria-modal="true">
      <div class="avatarPickerHeader">
        <div class="avatarPickerTitle">${title}</div>
        <button type="button" class="avatarPickerClose">${closeTxt}</button>
      </div>
      <div class="avatarPickerBody">
        <div class="mutedText" id="__avatarLoading">${loadingTxt}</div>
        <div class="avatarGrid" id="__avatarGrid" style="display:none;"></div>
        <div class="mutedText" id="__avatarEmpty" style="display:none;">${emptyTxt}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector(".avatarPickerClose");
  const grid = overlay.querySelector("#__avatarGrid");
  const loading = overlay.querySelector("#__avatarLoading");
  const empty = overlay.querySelector("#__avatarEmpty");

  const close = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };

  const onKey = (e) => {
    if(e.key === "Escape") close();
  };

  document.addEventListener("keydown", onKey);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if(e.target === overlay) close(); });

  (async () => {
    const avatars = await __listAvailableAvatars(60);

    loading.style.display = "none";

    if(!avatars.length){
      empty.style.display = "block";
      return;
    }

    grid.style.display = "grid";
    grid.innerHTML = "";

    avatars.forEach((url) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatarItem" + ((currentNorm && currentNorm === url) ? " avatarItemSelected" : "");
      btn.title = url.split("/").pop();
      btn.innerHTML = `<img alt="avatar" src="${url + __avatarCacheBust()}">`;
      btn.addEventListener("click", () => {
        if(typeof onPick === "function") onPick(url);
        close();
      });
      grid.appendChild(btn);
    });
  })().catch((err) => {
    console.error(err);
    loading.style.display = "none";
    empty.style.display = "block";
  });
}

function openProfileModal({required=false, onDone, onCancel}={}){
  const lang = getLang();
  const L = (lang === "en")
    ? {title:"Profile", desc: required?"Complete your profile to start.":"Edit your profile.", nick:"Nickname", country:"Country", playerNo:"Player number", fav:"Favorite club", saveBtn:"Change", cancelBtn:"Back"}
    : {title:"Profil", desc: required?"Uzupełnij profil, aby rozpocząć grę.":"Edytuj swój profil.", nick:"Nick", country:"Kraj", playerNo:"Nr gracza", fav:"Ulubiony klub", saveBtn:"Zmień", cancelBtn:"Cofnij"};

  const existing = getProfile() || {};
  const defaultNick = (localStorage.getItem(KEY_NICK) || existing.nick || "").trim();
  // Start blank when no country is set yet
  const defaultCountry = existing.country || "";
  const defaultFav = (existing.favClub || "").trim();
  const defaultPlayerNo = getPlayerNo();

  const wrap = document.createElement("div");
  wrap.className = "profileModal";
  wrap.innerHTML = `
    <div class="profileRow">
      <div class="profileLeftCol" aria-label="Avatar">
        <div class="profileAvatarBox" style="width:180px;height:180px;overflow:hidden;border-radius:18px;display:flex;align-items:center;justify-content:center;">
          <img id="profileAvatarImg" class="profileAvatarImg" alt="avatar" style="display:none;width:100%;height:100%;object-fit:contain;display:block;" />
          <div class="profileAvatarPlaceholder" id="profileAvatarPlaceholder">🙂</div>
        </div>
        <div id="profileAvatarBtnSlot" class="profileAvatarBtnSlot"></div>
      </div>
      <div class="profileFields">
        <div class="profileDesc">${escapeHtml(L.desc)}</div>
        <label class="profileLabel">${escapeHtml(L.playerNo)}
          <input id="profilePlayerNo" class="profileInput" type="text" value="${escapeHtml(defaultPlayerNo)}" readonly />
        </label>
        <label class="profileLabel">${escapeHtml(L.nick)}
          <input id="profileNick" class="profileInput" type="text" maxlength="16" value="${escapeHtml(defaultNick)}" />
        </label>
        <label class="profileLabel">${escapeHtml(L.country)}
          <select id="profileCountry" class="profileSelect">
            ${__buildCountryOptionsHtml(lang)}
          </select>
        </label>
        <label class="profileLabel">${escapeHtml(L.fav)}
          <input id="profileFav" class="profileInput" type="text" maxlength="26" value="${escapeHtml(defaultFav)}" />
        </label>
      </div>
    </div>
    <div class="profileBtns" id="profileBtns"></div>
  `;

  modalOpen(L.title, wrap);

  // Układ profilu: większy tytuł + przycisk "Wróć" u góry obok "Wyjście"
  const modalEl = el("modal");
  if(modalEl) modalEl.classList.add("profileMode");
  const modalCloseBtn = el("modalClose");
  if(modalCloseBtn && !el("modalBack")){
    const btnBackTop = makeSysImgButton("btn_back.png", {cls:"sysBtn small", alt:L.cancelBtn, title:L.cancelBtn});
    btnBackTop.id = "modalBack";
    btnBackTop.onclick = ()=>{
      modalClose();
      if(typeof onCancel === "function") onCancel();
    };
    modalCloseBtn.parentNode.insertBefore(btnBackTop, modalCloseBtn);
  }

  // Avatar (ui/avatars/avatar_1.png ... avatar_60.png) – wybór z okna
  let chosenAvatar = (existing && existing.avatar) ? existing.avatar : "";
  const avatarImgEl = wrap.querySelector("#profileAvatarImg");
  const avatarPlaceholderEl = wrap.querySelector("#profileAvatarPlaceholder");

  function renderProfileAvatar(){
    const path = __normalizeAvatarValue(chosenAvatar);
    if(path){
      if(avatarImgEl){
        avatarImgEl.src = path + __avatarCacheBust();
        avatarImgEl.onload = ()=>{ try{ avatarImgEl.style.width="100%"; avatarImgEl.style.height="100%"; avatarImgEl.style.objectFit="contain"; }catch(e){} };
        avatarImgEl.style.display = "block";
      }
      if(avatarPlaceholderEl) avatarPlaceholderEl.style.display = "none";
    }else{
      if(avatarImgEl) avatarImgEl.style.display = "none";
      if(avatarPlaceholderEl) avatarPlaceholderEl.style.display = "flex";
    }
  }

  renderProfileAvatar();


  // Przycisk Avatar (obsługę wyboru avatara dodamy w kolejnym kroku)
  const avatarSlot = wrap.querySelector('#profileAvatarBtnSlot');
  if(avatarSlot){
    const btnAvatar = makeSysImgButton('btn_avatar.png', {cls:'sysBtn profileAvatarBtn', alt:(lang==='en'?'Avatar':'Avatar'), title:(lang==='en'?'Avatar':'Avatar')});
    btnAvatar.onclick = ()=>{
      openAvatarPicker({
        lang,
        current: chosenAvatar,
        onPick: (url)=>{
          chosenAvatar = __avatarValueToStore(url);
          renderProfileAvatar();
        }
      });
    };
    avatarSlot.appendChild(btnAvatar);

    // Zamiast przycisku "Zmień" na dole: "Dodaj profil" obok "Avatar"
    const btnAddProfile = makeSysImgButton("btn_add_profil.png", {
      cls:"sysBtn profileAvatarBtn profileAddBtn",
      alt:(lang === "en" ? "Add profile" : "Dodaj profil"),
      title:(lang === "en" ? "Add profile" : "Dodaj profil")
    });
    btnAddProfile.onclick = async ()=>{
      const nick = (document.getElementById("profileNick")?.value || "").trim();
      const country = String((document.getElementById("profileCountry")?.value || "")).trim().toLowerCase();
      const favClub = (document.getElementById("profileFav")?.value || "").trim();
      const avatarVal = __avatarValueToStore(chosenAvatar);

      // Czy mamy już zapisany kompletny profil + numer gracza?
      const existingOk = isProfileComplete(existing) && !!getPlayerNo();

      // Czy użytkownik coś zmienił?
      const hasChanges = existingOk && (
        (String(nick||"") !== String(existing.nick||"")) ||
        (String(country||"") !== String(existing.country||"")) ||
        (String(favClub||"") !== String(existing.favClub||"")) ||
        (String(avatarVal||"") !== String(existing.avatar||""))
      );

      // Domyślnie: aktualizujemy istniejący profil (ten sam nr gracza)
      let keepSamePlayerNo = true;

      // Jeśli są zmiany w profilu, pokaż okno potwierdzenia:
      // TAK = uwzględnij zmiany (ten sam nr gracza)
      // NIE = nowy profil (nowy nr gracza)
      if(hasChanges){
        const langNow = getLang();
        const modal = ensureProfileChangeConfirmModal();
        const text = (langNow === "en")
          ? "You changed the player profile. Apply changes?\nYES = apply changes\nNO = new profile"
          : "Dokonałeś zmian w profilu gracza. Czy uwzględnić zmiany.\nJeśli to zmiany kliknij TAK jeśli nowy profil NIE.";
        keepSamePlayerNo = await modal.open({text});
      }

      const playerNo = keepSamePlayerNo
        ? ensurePlayerNoForCountry(country)
        : generateFreshPlayerNo(country);

      // pokaż w polu readonly
      const pnEl = document.getElementById("profilePlayerNo");
      if(pnEl) pnEl.value = playerNo;

      const profile = {...existing, nick, country, favClub, playerNo, avatar: avatarVal, updatedAt: Date.now()};
      if(!isProfileComplete(profile)){
        showToast(lang === "en" ? "Fill nickname and country." : "Uzupełnij nick i kraj.");
        return;
      }
      localStorage.setItem(KEY_NICK, nick);
      setProfile(profile);

      // Jeśli jesteśmy w pokoju – uaktualnij dane gracza tylko gdy aktualizujemy istniejący profil (TAK)
      if(keepSamePlayerNo){
        try{ updatePlayerDocProfile(); }catch{}
      }

      refreshNickLabels();
      modalClose();
      if(typeof onDone === "function") onDone(profile);
    };
    avatarSlot.appendChild(btnAddProfile);

    // NOWE: btn_my_profil.png (pod Avatar + Dodaj profil) – wpisanie nr gracza ręcznie
    const br = document.createElement('div');
    br.style.flexBasis = '100%';
    br.style.height = '0';
    avatarSlot.appendChild(br);

    const btnMyProfil = makeSysImgButton("btn_my_profil.png", {
      cls:"sysBtn profileAvatarBtn",
      alt:(lang === "en" ? "My profile" : "Mój profil"),
      title:(lang === "en" ? "My profile" : "Mój profil")
    });
    btnMyProfil.onclick = ()=>{ askAndSetPlayerNoFromMyProfile(); };
    avatarSlot.appendChild(btnMyProfil);
  }

  requestAnimationFrame(()=>{
    const sel = document.getElementById("profileCountry");
    if(sel) sel.value = defaultCountry;
  });

  // Dolny pasek przycisków nieużywany w profilu (akcje są przy avatarze + u góry)
  const btnRow = wrap.querySelector("#profileBtns");
  if(btnRow) btnRow.innerHTML = "";
}

async function ensureProfile(){
  const p = getProfile();
  if(isProfileComplete(p)){
    // upewnij się, że nr gracza istnieje
    if(!getPlayerNo()){
      ensurePlayerNoForCountry(p.country);
    }
    return true;
  }
  return await new Promise((resolve)=>{
    openProfileModal({required:true, onDone: ()=>resolve(true), onCancel: ()=>resolve(false)});
  });
}

function nickModalAsk(){
  return new Promise((resolve)=>{
    const wrap = document.createElement("div");
    wrap.className = "nickWrap";

    const hero = document.createElement("div");
    hero.className = "nickHero";

    const icon = document.createElement("div");
    icon.className = "nickIcon";
    icon.textContent = "👤";

    const tx = document.createElement("div");
    const title = document.createElement("div");
    title.className = "nickTitle";
    title.textContent = t("addProfileTitle");
    const sub = document.createElement("div");
    sub.className = "nickSub";
    sub.textContent = t("addProfileSub");
    tx.appendChild(title);
    tx.appendChild(sub);

    hero.appendChild(icon);
    hero.appendChild(tx);

    const label = document.createElement("div");
    label.style.fontWeight = "900";
    label.style.opacity = ".85";
    label.textContent = t("nickLabel");

    const row = document.createElement("div");
    row.className = "nickRow";

    const input = document.createElement("input");
    input.className = "nickInput";
    input.type = "text";
    input.maxLength = 16;
    input.placeholder = t("nickPlaceholder");
    input.value = getNick() || "";
    input.autocomplete = "nickname";

    row.appendChild(input);

    const meta = document.createElement("div");
    meta.className = "nickMeta";

    const tip = document.createElement("div");
    tip.textContent = (getLang() === "pl") ? "3–16 znaków • litery/cyfry" : "3–16 chars • letters/numbers";

    const count = document.createElement("div");
    count.className = "nickCount";
    const updateCount = () => { count.textContent = `${(input.value||"").length}/16`; };
    updateCount();
    input.addEventListener("input", updateCount);

    meta.appendChild(tip);
    meta.appendChild(count);

    const btns = document.createElement("div");
    btns.className = "nickBtns";

    const mkImgBtn = (dataBtn, title) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "imgBtn nickImgBtn";
      b.title = title || "";
      const img = document.createElement("img");
      img.alt = title || "";
      img.dataset.btn = dataBtn;
      // src will be set by refreshAllButtonImages()
      b.appendChild(img);
      return b;
    };

    const btnCancel = mkImgBtn("btn_cancel.png", t("cancel"));
    const btnOk = mkImgBtn("btn_ok.png", t("ok"));

    btns.appendChild(btnCancel);
    btns.appendChild(btnOk);

    wrap.appendChild(hero);
    wrap.appendChild(label);
    wrap.appendChild(row);
    wrap.appendChild(meta);
    wrap.appendChild(btns);

    modalOpen(t("addProfileTitle"), wrap);
    refreshAllButtonImages();

    const closeBtn = el("modalClose");
    const prevCloseOnClick = closeBtn ? closeBtn.onclick : null;

    setTimeout(()=>{ try{ input.focus(); input.select(); }catch(e){} }, 50);

    const closeAndResolve = (val)=>{
      if(closeBtn){
        closeBtn.onclick = prevCloseOnClick || (()=> modalClose());
      }
      modalClose();
      resolve(val);
    };

    if(closeBtn){
      // Keep the close button as an image; only override action to cancel for this modal
      closeBtn.onclick = () => closeAndResolve(null);
    }

    btnCancel.onclick = ()=> closeAndResolve(null);

    const submit = ()=>{
      const v = (input.value || "").trim();
      if(!v){
        showToast(t("nickRequired"));
        try{ input.focus(); }catch(e){}
        return;
      }
      closeAndResolve(v);
    };
    btnOk.onclick = submit;

    input.addEventListener("keydown",(e)=>{
      if(e.key === "Enter"){ e.preventDefault(); submit(); }
      if(e.key === "Escape"){ e.preventDefault(); closeAndResolve(null); }
    });
  });
}
function refreshNickLabels(){
  const nick = getNick() || "—";
  if (el("nickLabelRooms")) el("nickLabelRooms").textContent = nick;
  if (el("nickLabelRoom")) el("nickLabelRoom").textContent = nick;
  if (el("leagueNick")) el("leagueNick").textContent = nick;

  // 6016: karta profilu w pokoju (avatar + nick + kraj + ulubiony klub)
  try{
    const p = getProfile() || {};
    const lang = getLang ? getLang() : "pl";
    const nickShow = (p.nick || nick || "—").toString().trim() || "—";
    if(el("roomProfileNick")) el("roomProfileNick").textContent = nickShow;

    const c = String(p.country || "").trim().toUpperCase();
    const countryName = c ? __getCountryDisplayName(lang, c) : "—";
    if(el("roomProfileCountry")) el("roomProfileCountry").textContent = countryName;

    const fav = String(p.favClub || "").trim();
    if(el("roomProfileFav")) el("roomProfileFav").textContent = (fav || "—");

    const avatarFile = String(p.avatar || "").trim();
    const avatarImg = el("roomAvatarImg");
    const avatarFallback = el("roomAvatarFallback");
    if(avatarImg){
      if(avatarFile){
        avatarImg.src = `ui/avatars/${avatarFile}`;
        avatarImg.style.display = "block";
        if(avatarFallback) avatarFallback.style.display = "none";
      }else{
        avatarImg.removeAttribute("src");
        avatarImg.style.display = "none";
        if(avatarFallback) avatarFallback.style.display = "block";
      }
    }
  }catch(e){/* ignore */}
}

function getSavedRoom(){
  return (localStorage.getItem(KEY_ACTIVE_ROOM) || "").trim().toUpperCase();
}
function clearSavedRoom(){
  localStorage.removeItem(KEY_ACTIVE_ROOM);
}
function pushRoomHistory(code){
  code = (code||"").trim().toUpperCase();
  if(code.length !== 6) return;
  const raw = localStorage.getItem(KEY_ROOMS_HISTORY) || "[]";
  let arr = [];
  try{ arr = JSON.parse(raw); }catch{ arr=[]; }
  arr = arr.filter(x => String(x).toUpperCase() !== code);
  arr.unshift(code);
  arr = arr.slice(0, 12);
  localStorage.setItem(KEY_ROOMS_HISTORY, JSON.stringify(arr));
}

// Firebase boot
let app, auth, db;
let userUid = null;
const boot = {};

let unsubRoomDoc = null;
let unsubPlayers = null;
let unsubMatches = null;
let unsubPicks = null;

let currentRoomCode = null;
let currentRoom = null;
let currentRoundNo = 1;
let currentSeasonNo = 1;
let announcementShowing = false;
let announcementChecking = false;

let matchesCache = [];
let picksCache = {};
let picksDocByUid = {};
let submittedByUid = {};
let lastPlayers = [];
let deletePlayerMode = false;


// ===== 6008: COUNTDOWN DO KOŃCA TYPOWANIA =====
// Koniec typowania = 1 minuta przed pierwszym (najwcześniejszym) meczem w kolejce.
let typingDeadlineMs = null; // timestamp ms
let typingClosed = false;

function parseKickoffMs(m){
  const raw = m?.kickoff ?? m?.kickoffAt ?? m?.dateTime ?? m?.datetime ?? m?.date ?? null;
  if(!raw) return null;
  if(raw instanceof Date) return raw.getTime();
  if(typeof raw === "number" && Number.isFinite(raw)) return raw;
  if(typeof raw === "string"){
    const ms = Date.parse(raw);
    if(!Number.isNaN(ms)) return ms;
  }
  return null;
}

function recomputeTypingDeadline(){
  if(!matchesCache || !matchesCache.length){
    typingDeadlineMs = null;
    typingClosed = false;
    return;
  }

  // If room has explicit typing deadline (manual), use it
  try{
    const rawDL = currentRoom?.typingDeadlineMs ?? currentRoom?.typingDeadline ?? null;
    let dlMs = null;
    if(typeof rawDL === "number" && isFinite(rawDL)) dlMs = rawDL;
    else if(typeof rawDL === "string"){
      const p = Date.parse(rawDL);
      if(isFinite(p)) dlMs = p;
    }else if(rawDL && typeof rawDL === "object"){
      // Firestore Timestamp {seconds, nanoseconds}
      if(typeof rawDL.seconds === "number") dlMs = rawDL.seconds*1000;
      else if(typeof rawDL._seconds === "number") dlMs = rawDL._seconds*1000;
    }
    if(dlMs != null){
      typingDeadlineMs = dlMs;
      typingClosed = Date.now() >= typingDeadlineMs;
      return;
    }
  }catch(e){}
  let minKick = null;
  for(const m of matchesCache){
    const ms = parseKickoffMs(m);
    if(ms==null) continue;
    if(minKick==null || ms < minKick) minKick = ms;
  }
  if(minKick==null){
    typingDeadlineMs = null;
    typingClosed = false;
    return;
  }
  typingDeadlineMs = minKick - 60_000; // 1 minuta przed
  typingClosed = Date.now() >= typingDeadlineMs;
}

function formatCountdown(msLeft){
  const s = Math.max(0, Math.floor(msLeft/1000));
  const days = Math.floor(s/86400);
  const hours = Math.floor((s%86400)/3600);
  const mins = Math.floor((s%3600)/60);
  const secs = s%60;
  const pad = (n)=>String(n).padStart(2,"0");
  if(days>0) return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}


let pointsByUid = {};
let myPoints = null;

function roomRef(code){ return boot.doc(db, "rooms", code); }
function playersCol(code){ return boot.collection(db, "rooms", code, "players"); }
function matchesCol(code){ return boot.collection(db, "rooms", code, "matches"); }
function picksCol(code){ return boot.collection(db, "rooms", code, "picks"); }
function roundsCol(code){ return boot.collection(db, "rooms", code, "rounds"); }
function leagueCol(code){ return boot.collection(db, "rooms", code, "league"); }
function eventsCol(code){ return boot.collection(db, "rooms", code, "events"); }

function roundDocRef(code, roundNo, seasonNo=null){
  if(seasonNo==null) return boot.doc(db, "rooms", code, "rounds", `round_${roundNo}`);
  return boot.doc(db, "rooms", code, "rounds", `season_${seasonNo}_round_${roundNo}`);
}
function leagueDocRef(code, uid){
  return boot.doc(db, "rooms", code, "league", uid);
}

function getSeasonRoundLabel(roundNo=currentRoundNo, seasonNo=currentSeasonNo){
  const seasonTxt = (getLang()==="en") ? `Season ${seasonNo}` : `Sezon ${seasonNo}`;
  return `${roundNo} • ${seasonTxt}`;
}
function refreshRoomSeasonLabels(){
  if(el("roundLabel")) el("roundLabel").textContent = getSeasonRoundLabel();
}
function getEventSeenKey(code, eventId, playerNo){
  return `${KEY_SEEN_EVENT_PREFIX}_${String(code||"").toUpperCase()}_${String(playerNo||"").toUpperCase()}_${String(eventId||"")}`;
}
function hasSeenEvent(code, eventId, playerNo){
  try{ return localStorage.getItem(getEventSeenKey(code,eventId,playerNo)) === "1"; }catch(e){ return false; }
}
function markEventSeen(code, eventId, playerNo){
  try{ localStorage.setItem(getEventSeenKey(code,eventId,playerNo), "1"); }catch(e){}
}
function buildAnnouncementPlayerCard(entry, big=false){
  const card = document.createElement("div");
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.alignItems = "center";
  card.style.justifyContent = "flex-start";
  card.style.gap = "8px";
  const avatar = document.createElement("div");
  avatar.style.width = big ? "94px" : "72px";
  avatar.style.height = big ? "94px" : "72px";
  avatar.style.borderRadius = "18px";
  avatar.style.background = "rgba(255,255,255,.08)";
  avatar.style.border = "1px solid rgba(255,255,255,.18)";
  avatar.style.display = "flex";
  avatar.style.alignItems = "center";
  avatar.style.justifyContent = "center";
  avatar.style.overflow = "hidden";
  const av = __normalizeAvatarValue(String(entry?.avatar||"").trim());
  if(av){
    const img = document.createElement("img");
    img.src = av + __avatarCacheBust();
    img.alt = "avatar";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.onerror = () => {
      avatar.innerHTML = "";
      avatar.textContent = "🙂";
      avatar.style.fontSize = big ? "44px" : "34px";
    };
    avatar.appendChild(img);
  }else{
    avatar.textContent = "🙂";
    avatar.style.fontSize = big ? "44px" : "34px";
  }
  const nick = document.createElement("div");
  nick.textContent = String(entry?.nick||"—");
  nick.style.fontWeight = "1000";
  nick.style.textAlign = "center";
  nick.style.maxWidth = big ? "170px" : "140px";
  nick.style.whiteSpace = "nowrap";
  nick.style.overflow = "hidden";
  nick.style.textOverflow = "ellipsis";
  const pts = document.createElement("div");
  pts.textContent = (getLang()==="en") ? `${entry?.points ?? 0} pts` : `${entry?.points ?? 0} pkt`;
  pts.style.opacity = ".9";
  pts.style.fontWeight = "900";
  pts.style.fontSize = big ? "18px" : "15px";
  card.appendChild(avatar);
  card.appendChild(nick);
  card.appendChild(pts);
  return card;
}
function ensureAnnouncementOverlay(){
  let ov = document.getElementById("announcementOverlay");
  if(ov) return ov;
  ov = document.createElement("div");
  ov.id = "announcementOverlay";
  ov.style.position = "fixed";
  ov.style.inset = "0";
  ov.style.zIndex = "999999";
  ov.style.display = "none";
  ov.style.alignItems = "center";
  ov.style.justifyContent = "center";
  ov.style.background = "rgba(0,0,0,.68)";
  ov.style.backdropFilter = "blur(8px)";
  ov.style.webkitBackdropFilter = "blur(8px)";
  document.body.appendChild(ov);
  return ov;
}
function showRoundWinnersAnnouncement(ev){
  return new Promise(resolve=>{
    const ov = ensureAnnouncementOverlay();
    ov.innerHTML = "";
    ov.style.display = "flex";
    const box = document.createElement("div");
    box.style.width = "min(980px,92vw)";
    box.style.borderRadius = "28px";
    box.style.padding = "24px";
    box.style.background = "linear-gradient(180deg, rgba(8,32,76,.98), rgba(3,17,46,.98))";
    box.style.border = "1px solid rgba(255,255,255,.16)";
    box.style.boxShadow = "0 24px 80px rgba(0,0,0,.45)";
    const title = document.createElement("div");
    title.style.fontSize = "34px";
    title.style.fontWeight = "1000";
    title.style.textAlign = "center";
    title.style.marginBottom = "8px";
    title.textContent = (getLang()==="en") ? `Round ${ev.roundNo} winners` : `Zwycięzcy kolejki ${ev.roundNo}`;
    const sub = document.createElement("div");
    sub.style.textAlign = "center";
    sub.style.opacity = ".9";
    sub.style.fontWeight = "900";
    sub.style.marginBottom = "18px";
    sub.textContent = (getLang()==="en") ? `Season ${ev.seasonNo}` : `Sezon ${ev.seasonNo}`;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "center";
    row.style.alignItems = "flex-end";
    row.style.gap = "24px";
    row.style.flexWrap = "wrap";
    (ev.winners||[]).forEach((w, idx)=>{
      const col = buildAnnouncementPlayerCard(w, idx===0);
      col.style.minWidth = idx===0 ? "180px" : "150px";
      const cup = document.createElement("img");
      cup.src = idx===0 ? "ui/medale/puchar_1.png" : idx===1 ? "ui/medale/puchar_2.png" : "ui/medale/puchar_3.png";
      cup.alt = "cup";
      cup.style.width = idx===0 ? "48px" : "42px";
      cup.style.height = idx===0 ? "48px" : "42px";
      cup.style.marginBottom = "8px";
      col.insertBefore(cup, col.firstChild);
      row.appendChild(col);
    });
    box.appendChild(title); box.appendChild(sub); box.appendChild(row); ov.appendChild(box);
    setTimeout(()=>{ ov.style.display = "none"; ov.innerHTML=""; resolve(); }, 5000);
  });
}
function showSeasonPodiumAnnouncement(ev){
  return new Promise(resolve=>{
    const ov = ensureAnnouncementOverlay();
    ov.innerHTML = "";
    ov.style.display = "flex";
    const box = document.createElement("div");
    box.style.width = "min(1100px,94vw)";
    box.style.padding = "18px 18px 10px";
    box.style.borderRadius = "28px";
    box.style.background = "linear-gradient(180deg, rgba(8,32,76,.98), rgba(3,17,46,.98))";
    box.style.border = "1px solid rgba(255,255,255,.16)";
    box.style.boxShadow = "0 24px 80px rgba(0,0,0,.45)";
    const title = document.createElement("div");
    title.style.fontSize = "34px";
    title.style.fontWeight = "1000";
    title.style.textAlign = "center";
    title.style.marginBottom = "8px";
    title.textContent = (getLang()==="en") ? `Season ${ev.seasonNo} podium` : `Podium sezonu ${ev.seasonNo}`;
    const stage = document.createElement("div");
    stage.style.position = "relative";
    stage.style.width = "100%";
    stage.style.aspectRatio = "16 / 9";
    stage.style.background = 'center/contain no-repeat url("ui/medale/podium.png")';
    stage.style.marginTop = "8px";
    const coords = [
      { left:"50%", top:"8%", big:true, trans:"translateX(-50%)" },
      { left:"24%", top:"22%", big:false, trans:"translateX(-50%)" },
      { left:"76%", top:"24%", big:false, trans:"translateX(-50%)" }
    ];
    (ev.podium||[]).slice(0,3).forEach((w, idx)=>{
      const wrap = document.createElement("div");
      wrap.style.position = "absolute";
      wrap.style.left = coords[idx].left;
      wrap.style.top = coords[idx].top;
      wrap.style.transform = coords[idx].trans;
      const card = buildAnnouncementPlayerCard(w, !!coords[idx].big);
      wrap.appendChild(card);
      stage.appendChild(wrap);
    });
    box.appendChild(title); box.appendChild(stage); ov.appendChild(box);
    setTimeout(()=>{ ov.style.display = "none"; ov.innerHTML=""; resolve(); }, 5000);
  });
}
async function maybeShowPendingEvents(){
  if(!currentRoomCode || announcementShowing || announcementChecking) return;
  const playerNo = getPlayerNo();
  if(!playerNo) return;
  announcementChecking = true;
  try{
    const q = boot.query(eventsCol(currentRoomCode), boot.orderBy("eventOrder","asc"));
    const qs = await boot.getDocs(q);
    const pending = [];
    qs.forEach(doc=>{
      const data = doc.data() || {};
      if(!hasSeenEvent(currentRoomCode, doc.id, playerNo)) pending.push({ id: doc.id, ...data });
    });
    if(!pending.length) return;
    announcementShowing = true;
    for(const ev of pending){
      if(ev.type === "season_podium") await showSeasonPodiumAnnouncement(ev);
      else await showRoundWinnersAnnouncement(ev);
      markEventSeen(currentRoomCode, ev.id, playerNo);
    }
    announcementShowing = false;
  }catch(e){
    console.warn("maybeShowPendingEvents failed", e);
  }finally{
    announcementChecking = false;
  }
}

function isCompletePicksObject(picksObj){
  if(!matchesCache.length) return false;
  if(!picksObj || typeof picksObj !== "object") return false;
  for(const m of matchesCache){
    const p = picksObj[m.id];
    if(!p) return false;
    if(!Number.isInteger(p.h) || !Number.isInteger(p.a)) return false;
  }
  return true;
}
function recomputeSubmittedMap(){
  submittedByUid = {};
  for(const [uid, picksObj] of Object.entries(picksDocByUid)){
    submittedByUid[uid] = isCompletePicksObject(picksObj);
  }
}
function iAmSubmitted(){
  return !!submittedByUid[userUid];
}

// Admin powinien wpisywać wyniki dopiero gdy WSZYSCY gracze zapisali typy
function allPlayersSubmitted(){
  if(!matchesCache.length) return false;
  if(!Array.isArray(lastPlayers) || !lastPlayers.length) return false;
  return lastPlayers.every(p => !!submittedByUid[p.uid]);
}
function allResultsComplete(){
  if(!matchesCache.length) return false;
  return matchesCache.every(m => (m && m.cancelled) || (Number.isInteger(m.resultH) && Number.isInteger(m.resultA)));
}

// scoring: 3 exact, 1 outcome, 0 else
function outcomeSign(h,a){
  if(h>a) return 1;
  if(h<a) return -1;
  return 0;
}
function scoreOneMatch(pH,pA,rH,rA){
  if(!Number.isInteger(pH) || !Number.isInteger(pA) || !Number.isInteger(rH) || !Number.isInteger(rA)) return null;
  if(pH===rH && pA===rA) return 3;
  if(outcomeSign(pH,pA) === outcomeSign(rH,rA)) return 1;
  return 0;
}
function dotClassFor(pH,pA,rH,rA){
  const pts = scoreOneMatch(pH,pA,rH,rA);
  if(pts === null) return "gray";
  if(pts === 3) return "green";
  if(pts === 1) return "yellow";
  return "red";
}

function recomputePoints(){
  pointsByUid = {};
  myPoints = null;

  if(!allResultsComplete()){
    if(el("myPointsLabel")) el("myPointsLabel").textContent = "—";
    return;
  }

  for(const [uid, picksObj] of Object.entries(picksDocByUid)){
    if(!isCompletePicksObject(picksObj)) continue;
    let sum = 0;
    for(const m of matchesCache){
      const p = picksObj[m.id];
      const pts = scoreOneMatch(p?.h, p?.a, m.resultH, m.resultA);
      if(pts !== null) sum += pts;
    }
    pointsByUid[uid] = sum;
  }

  myPoints = pointsByUid[userUid] ?? 0;
  if(el("myPointsLabel")) el("myPointsLabel").textContent = String(myPoints);
}

async function initFirebase(){
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  const { getAuth, onAuthStateChanged, signInAnonymously } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
  const {
    getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp,
    collection, query, where, orderBy, onSnapshot,
    writeBatch, deleteDoc, getDocs, increment
  } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  boot.doc = doc; boot.getDoc = getDoc; boot.setDoc = setDoc; boot.updateDoc = updateDoc;
  boot.serverTimestamp = serverTimestamp;
  boot.collection = collection; boot.query = query; boot.orderBy = orderBy; boot.onSnapshot = onSnapshot;
  boot.where = where;
  boot.writeBatch = writeBatch; boot.deleteDoc = deleteDoc; boot.getDocs = getDocs;
  boot.increment = increment;

  await new Promise((resolve, reject)=>{
    const unsub = onAuthStateChanged(auth, async(u)=>{
      try{
        if(u){
          userUid = u.uid;
          unsub();
          resolve();
          return;
        }
        await signInAnonymously(auth);
      }catch(e){ reject(e); }
    });
    setTimeout(()=>reject(new Error("Auth timeout (12s)")), 12000);
  });
}

// ===== MESSAGES (ROOM) =====
let unsubMsgsUnread = null;
let unreadMsgsCount = 0;
let _lastUnreadToastAt = 0;

function updateMessagesBadge(){
  const b = el("msgBadge");
  if(!b) return;
  b.style.display = unreadMsgsCount > 0 ? "flex" : "none";
}

function stopMessagesListener(){
  if(unsubMsgsUnread){ try{unsubMsgsUnread();}catch(e){} }
  unsubMsgsUnread = null;
  unreadMsgsCount = 0;
  updateMessagesBadge();
}

function startMessagesListener(){
  stopMessagesListener();
  if(!db || !currentRoomCode || !userUid) return;

  const col = boot.collection(db, "rooms", currentRoomCode, "messages");
  // Unikamy zapytań wymagających indeksów złożonych (2x where). Filtrujemy po stronie klienta.
  const q = boot.query(col, boot.where("toUid","==", userUid));

  unsubMsgsUnread = boot.onSnapshot(q, (qs)=>{
    const prev = unreadMsgsCount;
    let c = 0;
    qs.forEach((d)=>{
      const x = d.data() || {};
      if(x.read === false) c += 1;
    });
    unreadMsgsCount = c;
    updateMessagesBadge();

    // delikatny toast przy nowej wiadomości (max raz na 4s)
    if(unreadMsgsCount > prev){
      const now = Date.now();
      if(now - _lastUnreadToastAt > 4000){
        _lastUnreadToastAt = now;
        showToast(getLang()==="en" ? "New message" : "Nowa wiadomość");
      }
    }
  });
}

let _msgsCache = { inbox: [], sent: [], system: [] };
let _msgsActiveTab = "inbox";
let _msgsOpenKind = null;
let _msgsOpenId = null;

let _msgsSelected = { inbox: new Set(), sent: new Set(), system: new Set() };

function _updateMsgDeleteBtn(){
  const btn = el("btnMsgDelete");
  if(!btn) return;
  const set = _msgsSelected[_msgsActiveTab];
  const n = set ? set.size : 0;
  // jeśli przycisk ma skórkę obrazkową, nie nadpisuj HTML; tylko pokaż licznik
  let badge = btn.querySelector(".msgDeleteCount");
  if(!badge){
    badge = document.createElement("span");
    badge.className = "msgDeleteCount";
    btn.appendChild(badge);
  }

  if(n>0){
    btn.classList.add("show");
    badge.style.display = "inline-block";
    badge.textContent = String(n);
    btn.title = (getLang()==="en") ? "Delete" : "Usuń";
    btn.setAttribute("aria-label", btn.title);
  }else{
    btn.classList.remove("show");
    badge.style.display = "none";
    badge.textContent = "";
    btn.title = (getLang()==="en") ? "Delete" : "Usuń";
    btn.setAttribute("aria-label", btn.title);
  }
}

function _applyMessagesBtnSkins(){
  const lang = (getLang()==="en") ? "en" : "pl";

  const del = el("btnMsgDelete");
  if(del){
    // zachowaj licznik (span) dodawany w _updateMsgDeleteBtn
    const badge = del.querySelector(".msgDeleteCount");
    del.innerHTML = `<img class="msgBtnImg" src="ui/buttons/${lang}/btn_delete.png" alt=""/>`;
    if(badge) del.appendChild(badge);
  }

  const send = el("btnMsgSend");
  if(send){
    send.innerHTML = `<img class="msgBtnImg" src="ui/buttons/${lang}/btn_send.png" alt=""/>`;
    send.title = (getLang()==="en") ? "Send" : "Wyślij";
    send.setAttribute("aria-label", send.title);
  }
}

async function _deleteSelectedMessages(){
  const kind = _msgsActiveTab;
  const set = _msgsSelected[kind];
  if(!set || set.size===0) return;
  const ids = Array.from(set);
  // usuń definitywnie z firestore
  for(const id of ids){
    try{
      const ref = boot.doc(db, "rooms", currentRoomCode, "messages", id);
      await boot.deleteDoc(ref);
    }catch(e){
      console.warn("delete message failed", id, e);
    }
  }

  // usuń z cache + odśwież widok
  _msgsCache[kind] = (_msgsCache[kind] || []).filter(m=> !set.has(m.id));
  set.clear();
  _updateMsgDeleteBtn();

  // jeżeli skasowano aktualnie podglądaną wiadomość, wyczyść podgląd
  if(_msgsOpenKind === kind && _msgsOpenId && !_msgsCache[kind].some(m=>m.id===_msgsOpenId)){
    _clearView(kind);
    _msgsOpenKind = null;
    _msgsOpenId = null;
  }

  // odśwież listy + badge
  renderMessagesLists();
  startMessagesListener();
}


function _tsToMillis(v){
  try{
    if(!v) return 0;
    if(typeof v === "number") return v;
    if(typeof v?.toMillis === "function") return v.toMillis();
    if(typeof v?.toDate === "function") return v.toDate().getTime();
    if(v?.seconds) return (v.seconds*1000) + Math.floor((v.nanoseconds||0)/1e6);
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }catch{ return 0; }
}
function _fmtMsgTime(v){
  const ms = _tsToMillis(v);
  if(!ms) return "—";
  const d = new Date(ms);
  const pad = (n)=> String(n).padStart(2,"0");
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function _short(s, n=44){
  s = (s||"").trim();
  if(s.length<=n) return s;
  return s.slice(0,n-1) + "…";
}

function switchMessagesTab(tab){
  _msgsActiveTab = tab;
  const tabs = ["inbox","sent","system","compose"];
  tabs.forEach(t=>{
    const b = el("tab"+t.charAt(0).toUpperCase()+t.slice(1));
    if(b) b.classList.toggle("active", t===tab);
    const p = el("pane"+t.charAt(0).toUpperCase()+t.slice(1));
    if(p) p.classList.toggle("show", t===tab);
  });

  // reset zaznaczeń przy zmianie zakładki
  ["inbox","sent","system"].forEach(k=>{ try{ _msgsSelected[k].clear(); }catch(e){} });
  _updateMsgDeleteBtn();

  // czyścimy znacznik nieprzeczytanych po wejściu do Odebrane
  if(tab==="inbox"){
    markAllMyMessagesRead().catch(()=>{});
  }
}

async function _loadMessages(){
  if(!db || !currentRoomCode || !userUid) return;

  const col = boot.collection(db, "rooms", currentRoomCode, "messages");
  const sortDesc = (a,b)=> _tsToMillis(b.createdAt) - _tsToMillis(a.createdAt);

  // Odebrane
  try{
    const qIn = boot.query(col, boot.where("toUid","==", userUid));
    const qs = await boot.getDocs(qIn);
    const arr=[];
    qs.forEach(d=>arr.push({ id:d.id, ...d.data() }));
    arr.sort(sortDesc);
    _msgsCache.inbox = arr.slice(0,50);
  }catch{ _msgsCache.inbox = []; }

  // Wysłane
  try{
    const qOut = boot.query(col, boot.where("fromUid","==", userUid));
    const qs = await boot.getDocs(qOut);
    const arr=[];
    qs.forEach(d=>arr.push({ id:d.id, ...d.data() }));
    arr.sort(sortDesc);
    _msgsCache.sent = arr.slice(0,50);
  }catch{ _msgsCache.sent = []; }

  // Systemowe (na przyszłość)
  try{
    const qSys = boot.query(col, boot.where("type","==","system"));
    const qs = await boot.getDocs(qSys);
    const arr=[];
    qs.forEach(d=>{
      const x = { id:d.id, ...d.data() };
      if(x.toUid === "all" || x.toUid === userUid) arr.push(x);
    });
    arr.sort(sortDesc);
    _msgsCache.system = arr.slice(0,50);
  }catch{ _msgsCache.system = []; }

  renderMessagesLists();
}

function _renderList(kind, nodeId){
  const wrap = el(nodeId);
  if(!wrap) return;

  const arr = _msgsCache[kind] || [];
  const sel = _msgsSelected[kind] || new Set();
  wrap.innerHTML = "";
  if(arr.length===0){
    const div = document.createElement("div");
    div.className = "msgViewEmpty";
    div.textContent = (getLang()==="en") ? "No messages." : "Brak wiadomości.";
    wrap.appendChild(div);
    return;
  }

  arr.forEach(m=>{
    const item = document.createElement("div");
    item.className = "msgItem";
    if(sel.has(m.id)) item.classList.add("msgItemSel");
    item.dataset.kind = kind;
    item.dataset.id = m.id;

    const top = document.createElement("div");
    top.className = "msgItemTop";

    const who = document.createElement("div");
    who.className = "msgItemWho";

    const time = document.createElement("div");
    time.className = "msgItemTime";
    time.textContent = _fmtMsgTime(m.createdAt);

    // kto (nick) + kropka nieprzeczytanych (tylko odebrane)
    if(kind==="inbox"){
      const nick = m.fromNick || "—";
      who.textContent = nick;

      if(m.read === false){
        const dot = document.createElement("span");
        dot.className = "msgDot";
        who.prepend(dot);
      }
    }else if(kind==="sent"){
      who.textContent = (m.toNick || "—");
    }else{
      who.textContent = (m.title || (getLang()==="en" ? "System" : "System"));
    }

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "10px";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "msgChk";
    chk.checked = sel.has(m.id);
    chk.onclick = (e)=>{
      e.stopPropagation();
      if(chk.checked) sel.add(m.id); else sel.delete(m.id);
      item.classList.toggle("msgItemSel", chk.checked);
      _updateMsgDeleteBtn();
    };

    right.appendChild(time);
    right.appendChild(chk);

    top.appendChild(who);
    top.appendChild(right);

    item.appendChild(top);

    item.onclick = ()=> openMessageView(kind, m.id);

    wrap.appendChild(item);
  });
}

function renderMessagesLists(){
  _renderList("inbox","msgInboxList");
  _renderList("sent","msgSentList");
  _renderList("system","msgSystemList");

  // jeśli nie mamy wybranej wiadomości, wyczyść podgląd
  _clearView("inbox");
  _clearView("sent");
  _clearView("system");
}

function _clearView(kind){
  const map = {
    inbox:{ empty:"msgViewEmpty", card:"msgViewCard" },
    sent:{ empty:"msgSentEmpty", card:"msgSentCard" },
    system:{ empty:"msgSystemEmpty", card:"msgSystemCard" }
  };
  const cfg = map[kind];
  if(!cfg) return;
  const empty = el(cfg.empty);
  const card = el(cfg.card);
  if(empty) empty.style.display = "";
  if(card) card.style.display = "none";
}

async function openMessageView(kind, id){
  _msgsOpenKind = kind;
  _msgsOpenId = id;

  const arr = _msgsCache[kind] || [];
  const m = arr.find(x=>x.id===id);
  if(!m) return;

  const map = {
    inbox:{ empty:"msgViewEmpty", card:"msgViewCard", meta:"msgViewMeta", text:"msgViewText" },
    sent:{ empty:"msgSentEmpty", card:"msgSentCard", meta:"msgSentMeta", text:"msgSentText" },
    system:{ empty:"msgSystemEmpty", card:"msgSystemCard", meta:"msgSystemMeta", text:"msgSystemText" }
  };
  const cfg = map[kind];
  if(!cfg) return;

  const empty = el(cfg.empty);
  const card = el(cfg.card);
  const meta = el(cfg.meta);
  const text = el(cfg.text);

  if(empty) empty.style.display = "none";
  if(card) card.style.display = "";
  if(meta){
    if(kind==="inbox"){
      meta.textContent = `${m.fromNick||"—"} → ${getNick()||"—"} • ${_fmtMsgTime(m.createdAt)}`;
    }else if(kind==="sent"){
      meta.textContent = `${getNick()||"—"} → ${m.toNick||"—"} • ${_fmtMsgTime(m.createdAt)}`;
    }else{
      meta.textContent = `${m.title || (getLang()==="en" ? "System" : "System")} • ${_fmtMsgTime(m.createdAt)}`;
    }
  }
  if(text){
    text.textContent = (m.text || m.body || "").trim();
  }

  // oznacz jako przeczytane po otwarciu (tylko odebrane)
  if(kind==="inbox" && m.read === false){
    try{
      const ref = boot.doc(db, "rooms", currentRoomCode, "messages", id);
      await boot.updateDoc(ref, { read:true, readAt: boot.serverTimestamp() });
      m.read = true;
      // odśwież listę żeby zniknęła kropka
      renderMessagesLists();
      startMessagesListener(); // przeliczy badge
    }catch{}
  }
}

function openMessagesModal(){
  const ov = el("messagesOverlay");
  if(!ov) return;

  // wypełnij select graczami z pokoju
  const sel = el("msgToSelect");
  if(sel){
    sel.innerHTML = "";
    const opts = lastPlayers
      .filter(p=>p && p.uid && p.uid !== userUid)
      .map(p=>({ uid: p.uid, nick: p.nick || "—" }));

    if(opts.length === 0){
      const o = document.createElement("option");
      o.value = "";
      o.textContent = getLang()==="en" ? "No other players" : "Brak innych graczy";
      sel.appendChild(o);
      sel.disabled = true;
    }else{
      sel.disabled = false;
      opts.forEach(p=>{
        const o = document.createElement("option");
        o.value = p.uid;
        o.textContent = p.nick;
        sel.appendChild(o);
      });
    }
  }

  const ta = el("msgText");
  if(ta) ta.value = "";

  // domyślnie pokaż Odebrane
  switchMessagesTab("inbox");

  // reset zaznaczeń i przycisku Usuń
  ["inbox","sent","system"].forEach(k=>{ try{ _msgsSelected[k].clear(); }catch(e){} });
  _updateMsgDeleteBtn();

  // podmień przyciski na grafiki (btn_send / btn_delete)
  _applyMessagesBtnSkins();

  ov.classList.add("show");
  ov.setAttribute("aria-hidden","false");

  _loadMessages().catch(()=>{});
}

function closeMessagesModal(){
  ["inbox","sent","system"].forEach(k=>{ try{ _msgsSelected[k].clear(); }catch(e){} });
  _updateMsgDeleteBtn();
  const ov = el("messagesOverlay");
  if(!ov) return;
  ov.classList.remove("show");
  ov.setAttribute("aria-hidden","true");
}

// ===== SUBSTITUTE (Zastępstwo) – BUILD 8004 =====
let _subMode = "player"; // "player" | "admin"

function openSubstituteMenu(){
  const ov = el("substituteOverlay");
  if(!ov) return;

  // Admin button active only for admin
  const bAdmin = el("btnSubAdmin");
  if(bAdmin){
    bAdmin.disabled = !isAdmin();
    bAdmin.style.opacity = isAdmin() ? "" : "0.45";
  }

  ov.classList.add("show");
  ov.setAttribute("aria-hidden","false");
}

function closeSubstituteMenu(){
  const ov = el("substituteOverlay");
  if(!ov) return;
  ov.classList.remove("show");
  ov.setAttribute("aria-hidden","true");
}

function openSubstitutePick(mode){
  _subMode = mode || "player";
  const ov = el("substitutePickOverlay");
  if(!ov) return;

  // Fill players list
  const sel = el("substitutePlayerSelect");
  if(sel){
    sel.innerHTML = "";
    const opts = (lastPlayers||[])
      .filter(p=>p && p.uid && p.uid !== userUid)
      .map(p=>({ uid:p.uid, nick:(p.nick||"—") }));

    if(opts.length === 0){
      const o = document.createElement("option");
      o.value = "";
      o.textContent = getLang()==="en" ? "No other players" : "Brak innych graczy";
      sel.appendChild(o);
      sel.disabled = true;
    }else{
      sel.disabled = false;
      opts.forEach(p=>{
        const o = document.createElement("option");
        o.value = p.uid;
        o.textContent = p.nick;
        sel.appendChild(o);
      });
    }
  }

  // YES is intentionally inactive for now
  const bYes = el("btnSubYes");
  if(bYes){ bYes.disabled = true; bYes.style.opacity = "0.45"; }
  const bNo = el("btnSubNo");
  if(bNo){ bNo.disabled = false; bNo.style.opacity = ""; }

  // Show
  ov.classList.add("show");
  ov.setAttribute("aria-hidden","false");
}

function closeSubstitutePick(){
  const ov = el("substitutePickOverlay");
  if(!ov) return;
  ov.classList.remove("show");
  ov.setAttribute("aria-hidden","true");
}


async function sendRoomMessage(){
  if(!db || !currentRoomCode) return;
  const sel = el("msgToSelect");
  const ta = el("msgText");
  const toUid = sel?.value || "";
  const text = (ta?.value || "").trim();
  if(!toUid){ showToast(getLang()==="en" ? "Select player" : "Wybierz gracza"); return; }
  if(text.length < 1){ showToast(getLang()==="en" ? "Write message" : "Wpisz wiadomość"); return; }

  const fromNick = getNick() || (currentRoom?.myNick) || "—";
  const toNick = (lastPlayers.find(p=>p.uid===toUid)?.nick) || "—";

  const col = boot.collection(db, "rooms", currentRoomCode, "messages");
  const ref = boot.doc(col);
  await boot.setDoc(ref, {
    fromUid: userUid,
    fromNick,
    toUid,
    toNick,
    text,
    read: false,
    createdAt: boot.serverTimestamp()
  });

  closeMessagesModal();
  showToast(getLang()==="en" ? "Sent" : "Wysłano");
}

async function markAllMyMessagesRead(){
  if(!db || !currentRoomCode || !userUid) return;
  const col = boot.collection(db, "rooms", currentRoomCode, "messages");
  const q = boot.query(col, boot.where("toUid","==", userUid));
  const qs = await boot.getDocs(q);
  if(qs.empty) { unreadMsgsCount = 0; updateMessagesBadge(); return; }

  const batch = boot.writeBatch(db);
  let any = false;
  qs.forEach(d=>{
    const x = d.data() || {};
    if(x.read === false){
      any = true;
      batch.update(d.ref, { read:true, readAt: boot.serverTimestamp() });
    }
  });
  if(!any){ unreadMsgsCount = 0; updateMessagesBadge(); return; }
  await batch.commit();
}


// ===== UI =====
function bindUI(){
  // Modal
  if(el("modalClose")) el("modalClose").onclick = modalClose;
  if(el("modal")) el("modal").addEventListener("click",(e)=>{
    if(e.target && e.target.id === "modal") modalClose();
  });

  // HOME: settings
  const btnSet = el("btnHomeSettings");
  if(btnSet) btnSet.onclick = () => openSettings();


  // HOME language flags
  const langPL = el("btnLangPL");
  const langEN = el("btnLangEN");
  const bindLang = (node, langVal) => {
    if(!node) return;
    const go = (e) => { if(e) e.preventDefault(); setLang(langVal); refreshAllButtonImages(); updateHomeButtonsImages(); updateLangButtonsVisual(); };
    node.addEventListener("click", go);
    node.addEventListener("touchstart", go, {passive:false});
  };
  bindLang(langPL, "pl");
  bindLang(langEN, "en");


  // HOME
  el("btnHomeRooms").onclick = async ()=>{
    // Profil uzupełniamy przy pierwszym wejściu do gry (nick + kraj)
    const okProfile = await ensureProfile();
    if(!okProfile) return;
    if(!getNick()){ const n = await ensureNick(); if(!n) return; }
    openRoomsChoiceModal();
  };

  el("btnHomeStats").onclick = async ()=>{
    if(!getNick()){ const n = await ensureNick(); if(!n) return; }
    const saved = getSavedRoom();
    if(saved && saved.length === 6){
      await openLeagueTable(saved);
      return;
    }
    showToast(getLang()==="en" ? "Join a room first" : "Najpierw wybierz / dołącz do pokoju");
    showScreen("rooms");
  };

  const __btnHomeExit = el("btnHomeExit");
  if(__btnHomeExit) __btnHomeExit.onclick = ()=> showToast(getLang()==="en" ? "You can close the browser tab." : "Możesz zamknąć kartę przeglądarki.");

  // CONTINUE
  el("btnContYes").onclick = async ()=>{
    const code = getSavedRoom();
    if(!code) { showScreen("rooms"); return; }
    await openRoom(code, { force:true });
  };
  el("btnContNo").onclick = ()=> showScreen("rooms");
  el("btnContForget").onclick = ()=>{
    clearSavedRoom();
    showToast(getLang()==="en" ? "Room forgotten" : "Zapomniano pokój");
    showScreen("rooms");
  };

  // ROOMS
  el("btnBackHomeFromRooms").onclick = ()=> showScreen("home");
  el("btnChangeNickRooms").onclick = async ()=>{
    localStorage.removeItem(KEY_NICK);
  const n = await ensureNick(); if(!n) return;
    showToast(getLang()==="en" ? "Nick changed" : "Zmieniono nick");
  };
  el("btnCreateRoom").onclick = async ()=>{
    if(!getNick()){ const n = await ensureNick(); if(!n) return; }
    const name = (el("inpRoomName").value || "").trim();
    if(name.length < 2){ showToast(getLang()==="en" ? "Enter room name" : "Podaj nazwę pokoju"); return; }
    await createRoom(name);
  };
  el("btnJoinRoom").onclick = async ()=>{
    if(!getNick()){ const n = await ensureNick(); if(!n) return; }
    const code = (el("inpJoinCode").value || "").trim().toUpperCase();
    if(code.length !== 6){ showToast(getLang()==="en" ? "Code must be 6 chars" : "Kod musi mieć 6 znaków"); return; }
    await joinRoom(code);
  };

  // ROOM
  // Back-from-room action is now attached to the right-bottom "Wyjście" button.
  // (Leaving the room is handled by the "Opuść" button under the room code.)
  const __goHomeFromRoom = ()=> showScreen("home");
  const __btnBackFromRoom = el("btnBackFromRoom");
  if(__btnBackFromRoom) __btnBackFromRoom.onclick = __goHomeFromRoom;

  const __btnCopyCode = el("btnCopyCode");
  if(__btnCopyCode) __btnCopyCode.onclick = async ()=>{
    if(!currentRoomCode) return;
    try{
      await navigator.clipboard.writeText(currentRoomCode);
      showToast(getLang()==="en" ? "Code copied" : "Skopiowano kod");
    }catch{ showToast(getLang()==="en" ? "Copy failed" : "Nie udało się skopiować"); }
  };

  const __btnLeave = el("btnLeave");
  if(__btnLeave) __btnLeave.onclick = async ()=>{
    const ok = await customConfirmLeaveRoom();
    if(!ok) return;
    await leaveRoom();
  };

  // 7009+: kasowanie pokoju (ADMIN)
  const __btnDeleteRoom = el("btnDeleteRoom");
  if(__btnDeleteRoom) __btnDeleteRoom.onclick = async ()=>{
    await deleteRoomConfirmAndDelete();
  };

  // 8037: usuwanie gracza (ADMIN)
  const __btnDeletePlayer = el("btnDeletePlayer");
  if(__btnDeletePlayer) __btnDeletePlayer.onclick = ()=>{
    if(!isAdmin()) return;
    deletePlayerMode = !deletePlayerMode;
    renderPlayers(lastPlayers);
    showToast(getLang()==="en"
      ? (deletePlayerMode ? "Select a player to delete" : "Delete mode off")
      : (deletePlayerMode ? "Zaznacz gracza do usunięcia" : "Tryb usuwania wyłączony"));
  };

  // 8004: zastępstwo
  const __btnSubstitute = el("btnSubstitute");
  if(__btnSubstitute) __btnSubstitute.onclick = ()=> openSubstituteMenu();

  const __subOv = el("substituteOverlay");
  if(__subOv){
    __subOv.addEventListener("click", (e)=>{ if(e.target === __subOv) closeSubstituteMenu(); });
  }
  const __subPickOv = el("substitutePickOverlay");
  if(__subPickOv){
    __subPickOv.addEventListener("click", (e)=>{ if(e.target === __subPickOv) { closeSubstitutePick(); openSubstituteMenu(); } });
  }

  const __btnSubBack = el("btnSubBack");
  if(__btnSubBack) __btnSubBack.onclick = ()=> closeSubstituteMenu();
  const __btnSubPlayer = el("btnSubPlayer");
  if(__btnSubPlayer) __btnSubPlayer.onclick = ()=>{ closeSubstituteMenu(); openSubstitutePick("player"); };
  const __btnSubAdmin = el("btnSubAdmin");
  if(__btnSubAdmin) __btnSubAdmin.onclick = ()=>{ if(!isAdmin()) return; closeSubstituteMenu(); openSubstitutePick("admin"); };
  const __btnSubNo = el("btnSubNo");
  if(__btnSubNo) __btnSubNo.onclick = ()=>{ closeSubstitutePick(); openSubstituteMenu(); };
  const __btnSubYes = el("btnSubYes");
  if(__btnSubYes) __btnSubYes.onclick = ()=>{ /* intentionally inactive for now */ };


  // dodatkowy przycisk „Wyjście” po prawej stronie (obok „Tabela typerów”)
  const __btnExitFromRoomRight = el("btnExitFromRoomRight");
  if(__btnExitFromRoomRight) __btnExitFromRoomRight.onclick = __goHomeFromRoom;

  // Wiadomości (otwórz okno + czyść wykrzyknik po wejściu)
  const __btnMsgs = el("btnMessagesFromRoom");
  if(__btnMsgs) __btnMsgs.onclick = ()=> openMessagesModal();
  const __btnRefresh = el("btnRefresh");
  if(__btnRefresh) __btnRefresh.onclick = async ()=>{ if(currentRoomCode) await openRoom(currentRoomCode, {silent:true, force:true}); };

  el("btnSaveAll").onclick = async ()=>{ await saveAllPicks(); };

  // ADMIN
  el("btnEnterResults").onclick = async ()=>{
    if(!isAdmin()) { showToast(getLang()==="en" ? "Admin only" : "Tylko admin"); return; }
    if(!matchesCache.length){ showToast(getLang()==="en" ? "No matches" : "Brak meczów"); return; }
    openResultsScreen();
  };

  el("btnEndRound").onclick = async ()=>{
    await endRoundConfirmAndArchive();
  };

  el("btnAddQueue").onclick = ()=>{ openManualQueueMenu(); };
  if (el("btnMyQueue")) {
    el("btnMyQueue").onclick = async ()=>{ showToast(getLang()==="en" ? "My fixture – coming next" : "Własna kolejka – dopinamy dalej"); };
  }

  // Add Queue menu (modal)
  const __ov = el("addQueueOverlay");
  if(__ov){
    __ov.addEventListener("click", (e)=>{
      if(e.target === __ov) closeAddQueueMenu();
    });
  }
  const __btnAQBack = el("btnAQBack");
  if(__btnAQBack) __btnAQBack.onclick = ()=> closeAddQueueMenu();

  // Random / Manual – obsługę dopinamy w następnym kroku
  const __btnAQRandom = el("btnAQRandom");
  if(__btnAQRandom) __btnAQRandom.onclick = async ()=>{ closeAddQueueMenu(); await addRandomQueue(); };
  const __btnAQManual = el("btnAQManual");
  if(__btnAQManual) __btnAQManual.onclick = ()=>{ closeAddQueueMenu(); openManualQueueMenu(); };

  // Manual queue modal
  const __mov = el("manualQueueOverlay");
  if(__mov){
    __mov.addEventListener("click", (e)=>{ if(e.target === __mov) closeManualQueueMenu(); });
  }
  const __btnMQBack = el("btnMQBack");
  if(__btnMQBack) __btnMQBack.onclick = ()=> closeManualQueueMenu();
  const __btnMQSave = el("btnMQSave");
  if(__btnMQSave) __btnMQSave.onclick = async ()=>{ await saveManualQueueFromUI(); };
  const __btnMQDeadlineYes = el("btnMQDeadlineYes");
  if(__btnMQDeadlineYes) __btnMQDeadlineYes.onclick = ()=> confirmMQDeadline();
  const __btnMQDeadlineNo = el("btnMQDeadlineNo");
  if(__btnMQDeadlineNo) __btnMQDeadlineNo.onclick = ()=> closeMQDeadlineOverlay();

  // Messages modal
  const __msgOv = el("messagesOverlay");
  if(__msgOv){
    __msgOv.addEventListener("click", (e)=>{ if(e.target === __msgOv) closeMessagesModal(); });
  }
  const __msgBack = el("btnMsgBack");
  if(__msgBack) __msgBack.onclick = ()=> closeMessagesModal();
  const __msgSend = el("btnMsgSend");
  if(__msgSend) __msgSend.onclick = async ()=>{ await sendRoomMessage(); };

  const __msgDel = el("btnMsgDelete");
  if(__msgDel) __msgDel.onclick = async ()=>{ await _deleteSelectedMessages(); };

  // Wiadomości - zakładki
  ["inbox","sent","system","compose"].forEach(t=>{
    const id = "tab"+t.charAt(0).toUpperCase()+t.slice(1);
    const node = el(id);
    if(node){
      node.onclick = ()=> switchMessagesTab(t);
    }
  });

  // RESULTS
  el("btnResBack").onclick = ()=> showScreen("room");
  el("btnResSave").onclick = async ()=>{ await saveResults(); };
  const __btnResCancelMatches = el("btnResCancelMatches");
  if(__btnResCancelMatches){
    __btnResCancelMatches.onclick = ()=>{
      resultsCancelMode = !resultsCancelMode;
      if(!resultsCancelMode) resultsCancelSelected.clear();
      renderResultsList();
    };
  }

  // League from room
  el("btnLeagueFromRoom").onclick = async ()=>{
    if(!currentRoomCode) return;
    await openLeagueTable(currentRoomCode);
  };

  // All‑time ranking from room (btn_all_ranking.png)
  const __btnAllRanking = el("btnAllRankingFromRoom");
  if(__btnAllRanking){
    __btnAllRanking.onclick = async ()=>{
      if(!currentRoomCode) return;
      await openAllTimeRanking(currentRoomCode);
    };
  }

  // League
  el("btnLeagueBack").onclick = ()=>{ if(currentRoomCode) showScreen("room"); else showScreen("home"); };
  // btnLeagueRefresh removed (BUILD 6014)


  // 6008: odświeżaj licznik co 1s (bez dodatkowych renderów)
  if(!window.__typingCountdownTimer){
    window.__typingCountdownTimer = setInterval(()=>{
      if(typingDeadlineMs == null) return;
      const left = typingDeadlineMs - Date.now();
      const v = el("typingCountdownValue");
      if(v) v.textContent = formatCountdown(left);

      // gdy dojdzie do 0 – blokujemy typowanie i odświeżamy widok (żeby inputy dostały disabled)
      if(left <= 0 && !typingClosed){
        typingClosed = true;
        try{ renderMatches(); syncActionButtons(); }catch(e){}
      }
    }, 1000);
  }
}


// ===== ADD QUEUE MENU (BUILD 5204) =====
function openAddQueueMenu(){
  const ov = el("addQueueOverlay");
  if(!ov) return;
  ov.style.display = "flex";
}
function closeAddQueueMenu(){
  const ov = el("addQueueOverlay");
  if(!ov) return;
  ov.style.display = "none";
}

// ===== MANUAL QUEUE MENU (BUILD 6006) =====
async function openManualQueueMenu(){
  const ov = el("manualQueueOverlay");
  if(!ov) return;
  ov.style.display = "flex";
  try{ setMQOverlayMode("manual"); }catch{}
  await buildManualQueueUI();
}
function closeManualQueueMenu(){
  const ov = el("manualQueueOverlay");
  if(!ov) return;
  ov.style.display = "none";
}

// ===== RANDOM QUEUE PREVIEW (BUILD 7035) =====
// Losowe: najpierw pokazujemy wylosowane mecze w tym samym oknie co manualne,
// a dopiero przy "Zapisz kolejkę" prosimy o czas końca typowania.
function openRandomQueuePreview(){
  const ov = el("manualQueueOverlay");
  if(!ov) return;
  ov.style.display = "flex";
  try{ setMQOverlayMode("random"); }catch{}
  renderRandomPreviewMatches();

  const btnSave = el("btnMQSave");
  if(btnSave){
    btnSave.style.display = "inline-flex";
    btnSave.onclick = ()=>{
      // ask for deadline on save
      openMQDeadlineOverlay("random");
    };
  }
  const btnBack = el("btnMQBack");
  if(btnBack){
    btnBack.style.display = "inline-flex";
    btnBack.onclick = ()=>{
      // cancel random draft
      try{ delete window.__randomQueueDraft; }catch{}
      closeManualQueueMenu();
    };
  }
}

function renderRandomPreviewMatches(){
  const box = el("manualMatchesList");
  if(!box) return;
  const cnt = el("manualMatchesCount");
  const title = el("mqTitle");

  const draft = window.__randomQueueDraft;
  const ms = (draft && Array.isArray(draft.matches)) ? draft.matches : [];
  if(title) title.textContent = getLang()==="en" ? "Random queue" : "Losowe dodawanie kolejki";

  if(cnt){
    cnt.textContent = (getLang()==="en")
      ? `Matches: ${ms.length}/10`
      : `Mecze: ${ms.length}/10`;
  }

  box.innerHTML = "";
  if(!ms.length){
    const empty = document.createElement("div");
    empty.className = "mqEmpty";
    empty.textContent = getLang()==="en" ? "No matches generated." : "Nie wygenerowano meczów.";
    box.appendChild(empty);
    return;
  }

  ms.forEach((m, idx)=>{
    const row = document.createElement("div");
    row.className = "mqMatchRow";
    const txt = document.createElement("div");
    txt.className = "mqMatchTxt";
    const l = MANUAL_LEAGUES.find(x=>x.key===(m.leagueKey||"PL"))?.label || (m.leagueKey||"PL");
    txt.textContent = `${idx+1}. [${l}] ${m.home} — ${m.away}`;
    row.appendChild(txt);
    box.appendChild(row);
  });
}

function setMQOverlayMode(mode){
  // mode: "manual" | "random"
  window.__mqOverlayMode = mode;
  const leagueWrap = document.querySelector("#manualQueueOverlay .mqLeagueWrap");
  const builder = document.querySelector("#manualQueueOverlay .mqBuilder");
  const btnAdd = el("btnMQAddMatch");
  const title = el("mqTitle");

  if(mode === "random"){
    if(title) title.textContent = getLang()==="en" ? "Random queue" : "Losowe dodawanie kolejki";
    if(leagueWrap) leagueWrap.style.display = "none";
    if(builder) builder.style.display = "none";
    if(btnAdd) btnAdd.style.display = "none";
  }else{
    if(title) title.textContent = getLang()==="en" ? "Manual queue" : "Ręczne dodawanie kolejki";
    if(leagueWrap) leagueWrap.style.display = "flex";
    if(builder) builder.style.display = "block";
    if(btnAdd) btnAdd.style.display = "block";
  }
}


// ===== MANUAL QUEUE DEADLINE (BUILD 7031) =====
function openMQDeadlineOverlay(mode="manual"){
  // mode: "manual" | "random"
  window.__deadlineMode = mode;

  const ov = el("mqDeadlineOverlay");
  if(!ov) return;
  ov.style.display = "flex";

  // title/desc (same text for now)
  const t = el("mqDeadlineTitle");
  const dsc = el("mqDeadlineDesc");
  if(t) t.textContent = getLang()==="en" ? "Set typing deadline" : "Ustaw czas końca typowania";
  if(dsc) dsc.textContent = getLang()==="en"
    ? "Set date and time (with minutes) until which users can submit picks for this round."
    : "Ustaw datę i godzinę (z minutami), do której będzie można typować tę kolejkę.";

  // default value: now + 2h (rounded to 5 minutes)
  const inp = el("mqDeadlineInput");
  if(inp){
    let ms = null;

    if(mode === "manual"){
      const st = __getManualState();
      ms = st.deadlineMs || null;
    }else if(mode === "random"){
      const st = window.__randomQueueDraft || null;
      ms = st?.deadlineMs || null;
    }

    if(ms==null){
      const dd = new Date(Date.now() + 2*60*60*1000);
      dd.setSeconds(0,0);
      const mm0 = dd.getMinutes();
      dd.setMinutes(mm0 - (mm0%5));
      ms = dd.getTime();
    }
    inp.value = toDateTimeLocal(ms);
  }
}
function closeMQDeadlineOverlay(){
  const ov = el("mqDeadlineOverlay");
  if(!ov) return;
  ov.style.display = "none";
  window.__deadlineMode = "manual";
}
function toDateTimeLocal(ms){
  const d = new Date(ms);
  const pad = (n)=> String(n).padStart(2,"0");
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mi}`;
}
async function confirmMQDeadline(){
  const inp = el("mqDeadlineInput");
  if(!inp) return;
  const val = (inp.value||"").trim();
  const ms = Date.parse(val);
  if(!isFinite(ms)){
    showToast(getLang()==="en" ? "Select date & time" : "Wybierz datę i godzinę");
    return;
  }

  const mode = window.__deadlineMode || "manual";

  if(mode === "random"){
    const draft = window.__randomQueueDraft;
    if(!draft || !Array.isArray(draft.matches) || draft.matches.length !== 10){
      closeMQDeadlineOverlay();
      showToast(getLang()==="en" ? "No draft matches" : "Brak meczów do zapisania");
      return;
    }
    draft.deadlineMs = ms;
    window.__randomQueueDraft = draft;
    closeMQDeadlineOverlay();
    await commitRandomQueueDraft();
    // po zapisie zamknij podgląd losowej kolejki
    try{ closeManualQueueMenu(); }catch{}
    return;
  }

  // manual
  const st = __getManualState();
  st.deadlineMs = ms;
  window.__manualQueue = st;
  __saveManualQueueState(st);
  closeMQDeadlineOverlay();
  renderManualMatchesList();
}


// Manual: ligi i kluby — domyślne dane awaryjne, docelowo ładowane z data/leagues.json
let MANUAL_LEAGUES = [
  { key: "PL", label: "Ekstraklasa - POLSKA" },
  { key: "BEL", label: "Jupiter League - BELGIA" },
  { key: "FL1", label: "Ligue 1 - FRANCJA" },
  { key: "PD", label: "LaLiga - HISZPANIA" },
  { key: "DED", label: "Eredivisie - HOLANDIA" },
  { key: "BL1", label: "Bundesliga - NIEMCY" },
  { key: "SA", label: "Serie A - WŁOCHY" },
  { key: "PPL", label: "Liga Portugal - PORTUGALIA" }
];

let CLUBS_BY_LEAGUE = {
  "PL": [
    "Jagiellonia Białystok","Legia Warszawa","Lech Poznań","Raków Częstochowa","Pogoń Szczecin","Widzew Łódź","Korona Kielce","Górnik Zabrze","Radomiak Radom","Cracovia","Piast Gliwice","Zagłębie Lubin","Stal Mielec","Puszcza Niepołomice","Lechia Gdańsk","GKS Katowice","Motor Lublin","Śląsk Wrocław"
  ],
  "BEL": [
    "Anderlecht","Club Brugge","Genk","Gent","Royal Antwerp","Standard Liège","Charleroi","Cercle Brugge","Mechelen","OH Leuven","Sint-Truiden","Kortrijk","Westerlo","Dender","Union Saint-Gilloise","Beerschot"
  ],
  "FL1": [
    "Paris Saint-Germain","Olympique Marseille","Olympique Lyon","AS Monaco","Lille","Nice","Lens","Rennes","Nantes","Montpellier","Strasbourg","Reims","Brest","Toulouse","Le Havre","Auxerre","Saint-Étienne","Angers"
  ],
  "PD": [
    "Real Madrid","Barcelona","Atlético Madrid","Sevilla","Valencia","Villarreal","Real Betis","Real Sociedad","Athletic Club","Getafe","Osasuna","Mallorca","Celta Vigo","Girona","Las Palmas","Espanyol","Alavés","Rayo Vallecano","Valladolid","Leganés"
  ],
  "DED": [
    "Ajax","PSV Eindhoven","Feyenoord","AZ Alkmaar","Twente","Utrecht","Heerenveen","NEC Nijmegen","Sparta Rotterdam","Go Ahead Eagles","Groningen","Heracles Almelo","PEC Zwolle","Fortuna Sittard","NAC Breda","Willem II","RKC Waalwijk","Almere City"
  ],
  "BL1": [
    "Bayern Monachium","Borussia Dortmund","Bayer Leverkusen","RB Leipzig","VfB Stuttgart","Eintracht Frankfurt","Wolfsburg","Borussia Mönchengladbach","SC Freiburg","Mainz","Werder Brema","Augsburg","Union Berlin","Hoffenheim","St. Pauli","Heidenheim","Bochum","Holstein Kiel"
  ],
  "SA": [
    "Inter","Milan","Juventus","Roma","Lazio","Napoli","Atalanta","Fiorentina","Bologna","Torino","Genoa","Udinese","Monza","Lecce","Empoli","Parma","Como","Venezia","Verona","Cagliari"
  ],
  "PPL": [
    "FC Porto","Sporting CP","Benfica","Braga","Vitória Guimarães","Moreirense","Famalicão","Casa Pia","Rio Ave","Gil Vicente","Arouca","Estoril","Farense","Nacional","Santa Clara","Boavista","AVS","Estrela Amadora"
  ]
};

let __leaguesDataLoaded = false;
let __leaguesDataPromise = null;

function __leagueLabelFromEntry(entry){
  const name = String(entry?.name || entry?.label || entry?.key || "Liga").trim();
  const country = String(entry?.country || "").trim();
  return country ? `${name} - ${country.toUpperCase()}` : name;
}

async function ensureLeaguesDataLoaded(){
  if(__leaguesDataLoaded) return;
  if(__leaguesDataPromise) return __leaguesDataPromise;

  __leaguesDataPromise = (async ()=>{
    try{
      const res = await fetch(`data/leagues.json?v=${BUILD}`, { cache: "no-store" });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.leagues) ? data.leagues : [];
      if(list.length){
        MANUAL_LEAGUES = list.map(l => ({
          key: String(l.key || "").trim() || String(l.name || "").trim(),
          label: __leagueLabelFromEntry(l)
        })).filter(l => l.key);

        const clubs = {};
        for(const l of list){
          const key = String(l.key || "").trim() || String(l.name || "").trim();
          if(!key) continue;
          clubs[key] = Array.isArray(l.teams) ? l.teams.map(x => String(x || "").trim()).filter(Boolean) : [];
        }
        if(Object.keys(clubs).length) CLUBS_BY_LEAGUE = clubs;
      }
    }catch(err){
      console.warn("Nie udało się wczytać data/leagues.json — używam danych wbudowanych.", err);
    }finally{
      __leaguesDataLoaded = true;
    }
  })();

  return __leaguesDataPromise;
}

function __loadManualQueueState(){
  try{
    const raw = localStorage.getItem("manualQueueState");
    if(!raw) return null;
    const st = JSON.parse(raw);
    return st && typeof st==="object" ? st : null;
  }catch{ return null; }
}
function __saveManualQueueState(st){
  try{ localStorage.setItem("manualQueueState", JSON.stringify(st)); }catch{}
}
function __getManualState(){
  let st = window.__manualQueue;
  if(!st){
    st = __loadManualQueueState() || null;
  }

  // migrate old shapes:
  // - {leagueKey, drafts:{...}}  -> {leagueKey, all:[...]}
  // - {leagueKey, matches:[...]} -> {leagueKey, all:[...]}
  if(st && typeof st==="object"){
    if(Array.isArray(st.matches) && !Array.isArray(st.all)){
      st.all = st.matches.map(m=>({ leagueKey: st.leagueKey || "PL", home:m.home, away:m.away }));
      delete st.matches;
    }
    if(st.drafts && typeof st.drafts==="object" && !Array.isArray(st.all)){
      const all = [];
      for(const [k, arr] of Object.entries(st.drafts)){
        if(!Array.isArray(arr)) continue;
        for(const m of arr){
          if(!m || !m.home || !m.away) continue;
          all.push({ leagueKey:k, home:m.home, away:m.away });
        }
      }
      st.all = all;
      delete st.drafts;
    }
  }

  if(!st || typeof st!=="object") st = { leagueKey:"PL", all:[] };
  if(!st.leagueKey) st.leagueKey = "PL";
  if(!Array.isArray(st.all)) st.all = [];

  window.__manualQueue = st;
  __saveManualQueueState(st);
  return st;
}
function __getAllManualMatches(){
  const st = __getManualState();
  if(!Array.isArray(st.all)) st.all = [];
  return st.all;
}

async function buildManualQueueUI(){
  await ensureLeaguesDataLoaded();
  const st = __getManualState();

  if(!MANUAL_LEAGUES.some(x => x.key === (st.leagueKey || ""))){
    st.leagueKey = MANUAL_LEAGUES[0]?.key || "PL";
  }

  // league select
  const leagueSel = el("manualLeagueSelect");
  if(leagueSel){
    leagueSel.innerHTML = "";
    for(const l of MANUAL_LEAGUES){
      const opt = document.createElement("option");
      opt.value = l.key;
      opt.textContent = l.label;
      leagueSel.appendChild(opt);
    }
    leagueSel.value = st.leagueKey || "PL";
    leagueSel.onchange = ()=>{
      st.leagueKey = leagueSel.value;
      window.__manualQueue = st;
      __saveManualQueueState(st);
      rebuildManualClubSelectors();
      renderManualMatchesList();
    };
  }

  const btnAdd = el("btnMQAddMatch");
  if(btnAdd){
    btnAdd.onclick = ()=> addManualMatchFromUI();
  }

  rebuildManualClubSelectors();
  renderManualMatchesList();
}

function getManualLeagueClubs(){
  const key = (window.__manualQueue?.leagueKey) || "PL";
  return (CLUBS_BY_LEAGUE[key] || []).slice();
}

function rebuildManualClubSelectors(){
  const clubs = getManualLeagueClubs();
  const homeSel = el("manualHomeSelect");
  const awaySel = el("manualAwaySelect");
  if(!homeSel || !awaySel) return;

  const prevHome = homeSel.value;
  homeSel.innerHTML = "";
  for(const c of clubs){
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    homeSel.appendChild(opt);
  }
  // restore if possible
  if(prevHome && clubs.includes(prevHome)) homeSel.value = prevHome;

  const fillAway = ()=>{
    const home = homeSel.value;
    const prevAway = awaySel.value;
    awaySel.innerHTML = "";
    for(const c of clubs){
      if(c === home) continue;
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      awaySel.appendChild(opt);
    }
    if(prevAway && prevAway !== home && clubs.includes(prevAway)) awaySel.value = prevAway;
  };
  homeSel.onchange = fillAway;
  fillAway();
}

function addManualMatchFromUI(){
  const homeSel = el("manualHomeSelect");
  const awaySel = el("manualAwaySelect");
  if(!homeSel || !awaySel) return;

  const home = (homeSel.value || "").trim();
  const away = (awaySel.value || "").trim();
  if(!home || !away) return;

  const st = __getManualState();
  const ms = __getAllManualMatches();

  if(ms.length >= 10){
    showToast(getLang()==="en" ? "Max 10 matches" : "Maksymalnie 10 meczów");
    return;
  }
  if(home === away){
    showToast(getLang()==="en" ? "Teams must be different" : "Drużyny muszą być różne");
    return;
  }

    // no duplicate pair (w obrębie tej samej ligi) + opcjonalnie nie powtarzamy drużyn w tej samej lidze
  const leagueKey = st.leagueKey || "PL";
  const usedTeams = new Set();
  for(const m of ms){
    if((m.leagueKey || leagueKey) !== leagueKey) continue;
    usedTeams.add(m.home);
    usedTeams.add(m.away);
    if((m.home===home && m.away===away) || (m.home===away && m.away===home)){
      showToast(getLang()==="en" ? "Match already added" : "Ten mecz już dodano");
      return;
    }
  }
  if(usedTeams.has(home) || usedTeams.has(away)){
    showToast(getLang()==="en" ? "Team already used in this league" : "Ta drużyna jest już użyta w tej lidze");
    return;
  }

  ms.push({ leagueKey, home, away });
  window.__manualQueue = st;
  __saveManualQueueState(st);
  renderManualMatchesList();

  // After 10th match: ask for typing deadline
  if(ms.length === 10){
    const st2 = __getManualState();
    if(!st2.deadlineMs) openMQDeadlineOverlay();
  }
}

function renderManualMatchesList(){
  const box = el("manualMatchesList");
  if(!box) return;
  const st = __getManualState();
  const ms = __getAllManualMatches();

  const cnt = el("manualMatchesCount");
  if(cnt){
    cnt.textContent = (getLang()==="en")
      ? `Matches: ${ms.length}/10`
      : `Mecze: ${ms.length}/10`;
  }

  const footer = el("manualQueueFooter");
  if(footer){
    // 7030: przycisk "Cofnij" ma być zawsze widoczny; "Zapisz kolejkę" tylko przy 10/10
    footer.style.display = "flex";
    footer.style.justifyContent = "center";
    footer.style.gap = "20px";
    const btnSave = el("btnMQSave");
    if(btnSave){
      btnSave.style.display = (ms.length === 10 && !!st.deadlineMs) ? "inline-flex" : "none";
    }
  }

  box.innerHTML = "";

  if(!ms.length){
    const empty = document.createElement("div");
    empty.className = "mqEmpty";
    empty.textContent = getLang()==="en" ? "No matches added yet." : "Nie dodano jeszcze meczów.";
    box.appendChild(empty);
    return;
  }

  ms.forEach((m, idx)=>{
    const row = document.createElement("div");
    row.className = "mqMatchRow";

    const txt = document.createElement("div");
    txt.className = "mqMatchTxt";
    const l = MANUAL_LEAGUES.find(x=>x.key===(m.leagueKey||st.leagueKey))?.label || (m.leagueKey||st.leagueKey||"");
    txt.textContent = `${idx+1}. [${l}] ${m.home} — ${m.away}`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "mqDelBtn";
    del.textContent = getLang()==="en" ? "Remove" : "Usuń";
    del.onclick = ()=>{
      ms.splice(idx,1);
      window.__manualQueue = st;
      __saveManualQueueState(st);
      renderManualMatchesList();
    };

    row.appendChild(txt);
    row.appendChild(del);
    box.appendChild(row);
  });
}

async function saveManualQueueFromUI(){
  if(!currentRoomCode) return;
  if(!isAdmin()){
    showToast(getLang()==="en" ? "Admin only" : "Tylko admin");
    return;
  }

  const sel = el("manualLeagueSelect");
  if(!sel) return;
  const key = sel.value;

  const st = __getManualState();
  st.leagueKey = key;
  window.__manualQueue = st;
  __saveManualQueueState(st);

  const ms = __getAllManualMatches();

  // wymagamy dokładnie 10 meczów
  if(ms.length !== 10){
    showToast(getLang()==="en"
      ? `Add 10 matches first (${ms.length}/10)`
      : `Najpierw dodaj 10 meczów (${ms.length}/10)`
    );
    return;
  }


  // wymagamy ustawienia czasu końca typowania (deadline)
  if(!st.deadlineMs){
    showToast(getLang()==="en" ? "Set typing deadline" : "Ustaw czas końca typowania");
    openMQDeadlineOverlay();
    return;
  }

  // Jeśli już są mecze w aktywnej kolejce – nie dokładamy kolejnych.
  // UWAGA: matchesCache bywa niezsynchronizowane (np. po przejściu między kolejkami),
  // więc sprawdzamy bezpośrednio w Firestore.
  try{
    const snap = await boot.getDocs(matchesCol(currentRoomCode));
    if(snap && !snap.empty){
      showToast(getLang()==="en" ? "Matches already exist" : "Mecze już istnieją w tej kolejce");
      return;
    }
  }catch(e){
    // Jeśli nie udało się sprawdzić – nie ryzykujemy nadpisania.
    showToast(getLang()==="en" ? "Cannot check existing matches" : "Nie można sprawdzić czy mecze już istnieją");
    return;
  }

  // Zapisz do Firestore jako aktywną kolejkę (matches)
  const b = boot.writeBatch(db);
  const now = Date.now();
  for(let i=0;i<ms.length;i++){
    const m = ms[i];
    const id = `m_${now}_${i}`;
    const ref = boot.doc(db, "rooms", currentRoomCode, "matches", id);
    b.set(ref, {
      idx: i,
      home: m.home,
      away: m.away,
      leagueKey: (m.leagueKey || st.leagueKey || "PL"),
      createdAt: boot.serverTimestamp()
    });
  }
  // aktualizacja pokoju (tylko znacznik czasu)
  b.set(roomRef(currentRoomCode), { updatedAt: boot.serverTimestamp(), typingDeadlineMs: st.deadlineMs }, { merge:true });

  await b.commit();

  // wyczyść szkic po zapisie
  try{
    st.all = [];
    st.deadlineMs = null;
    window.__manualQueue = st;
    __saveManualQueueState(st);
  }catch{}

  showToast(getLang()==="en" ? "Queue saved ✅" : "Zapisano kolejkę ✅");
  closeManualQueueMenu();

  try{ syncActionButtons(); }catch{}
}
function isAdmin(){
  return currentRoom?.adminUid === userUid;
}

// ===== CONTINUE FLOW =====
async function showContinueIfRoomExists(code){
  code = (code||"").trim().toUpperCase();
  if(code.length !== 6){ showScreen("rooms"); return; }

  try{
    const snap = await boot.getDoc(roomRef(code));
    if(!snap.exists()){
      clearSavedRoom();
      showToast(getLang()==="en" ? "Saved room not found" : "Zapisany pokój nie istnieje");
      showScreen("rooms");
      return;
    }
    const room = snap.data();
    el("contNick").textContent = getNick() || "—";
    el("contRoomName").textContent = room?.name || "—";
    showScreen("continue");
  }catch{
    showToast(getLang()==="en" ? "Cannot check room" : "Nie udało się sprawdzić pokoju");
    showScreen("rooms");
  }
}

// ===== ROOMS LOGIC =====
async function createRoom(roomName){
  const nick = getNick();
  el("debugRooms").textContent = (getLang()==="en") ? "Creating room…" : "Tworzę pokój…";

  for(let tries=0; tries<12; tries++){
    const code = genCode6();
    const ref = roomRef(code);
    const snap = await boot.getDoc(ref);
    if(snap.exists()) continue;

    await boot.setDoc(ref, {
      name: roomName,
      adminUid: userUid,
      adminNick: nick,
      createdAt: boot.serverTimestamp(),
      currentRoundNo: 1,
      currentSeasonNo: 1,
      archiveCount: 0
    });

    const prof = getProfile() || {};
    const playerNo = prof.playerNo || getPlayerNo() || "";
    await boot.setDoc(boot.doc(db, "rooms", code, "players", userUid), {
      nick,
      uid: userUid,
      playerNo: String(playerNo||"").toUpperCase() || null,
      country: (prof.country || null),
      favClub: (prof.favClub || null),
      avatar: (prof.avatar || null),
      joinedAt: boot.serverTimestamp(),
      lastActiveAt: boot.serverTimestamp()
    });

    localStorage.setItem(KEY_ACTIVE_ROOM, code);
    pushRoomHistory(code);

    el("debugRooms").textContent = (getLang()==="en") ? `Room created ${code}` : `Utworzono pokój ${code}`;
    await openRoom(code);
    return;
  }
  el("debugRooms").textContent = (getLang()==="en")
    ? "Could not generate a free code (try again)."
    : "Nie udało się wygenerować wolnego kodu (spróbuj ponownie).";
}

async function joinRoom(code){
  const nick = getNick();
  el("debugRooms").textContent = (getLang()==="en") ? "Joining…" : "Dołączam…";

  const ref = roomRef(code);
  const snap = await boot.getDoc(ref);
  if(!snap.exists()){
    el("debugRooms").textContent = (getLang()==="en") ? "Room not found." : "Nie ma takiego pokoju.";
    showToast(getLang()==="en" ? "Room not found" : "Nie ma takiego pokoju");
    return;
  }

  const prof = getProfile() || {};
  const playerNo = String(prof.playerNo || getPlayerNo() || "").trim().toUpperCase();

  // jeśli ten numer gracza już istnieje w pokoju, ZAWSZE użyj tego samego dokumentu gracza
  if(/^[A-Z0-9]{7}$/.test(playerNo)){
    const canonical = await __resolveRoomIdentityByPlayerNo(code, playerNo);
    if(canonical){
      const data = canonical.data() || {};
      if(data.nick) localStorage.setItem(KEY_NICK, String(data.nick));
      const merged = getProfile() || {};
      merged.nick = String(data.nick || nick || merged.nick || "");
      merged.playerNo = playerNo;
      if(data.country) merged.country = String(data.country);
      if(data.favClub) merged.favClub = String(data.favClub);
      if(data.avatar) merged.avatar = String(data.avatar);
      setProfile(merged);
      localStorage.setItem(KEY_PLAYER_NO, playerNo);
      localStorage.setItem(KEY_LAST_PLAYERNO, playerNo);
      __setAuthedThisSession(playerNo);
      localStorage.setItem(KEY_ACTIVE_ROOM, code);
      pushRoomHistory(code);
      el("debugRooms").textContent = (getLang()==="en") ? `Joined ${code}` : `Dołączono do ${code}`;
      await openRoom(code);
      return;
    }
  }

  // jeżeli numeru jeszcze nie ma w pokoju, utwórz normalny wpis tylko raz
  await boot.setDoc(boot.doc(db, "rooms", code, "players", userUid), {
    nick,
    uid: userUid,
    playerNo: playerNo || null,
    country: (prof.country || null),
    favClub: (prof.favClub || null),
    avatar: (prof.avatar || null),
    joinedAt: boot.serverTimestamp(),
    lastActiveAt: boot.serverTimestamp()
  }, { merge:true });

  localStorage.setItem(KEY_ACTIVE_ROOM, code);
  pushRoomHistory(code);

  el("debugRooms").textContent = (getLang()==="en") ? `Joined ${code}` : `Dołączono do ${code}`;
  await openRoom(code);
}

// Aktualizuj dane profilu gracza w bieżącym pokoju (jeśli jest otwarty)
async function updatePlayerDocProfile(){
  if(!currentRoomCode || !userUid) return;
  const prof = getProfile() || {};
  const nick = getNick();
  const playerNo = (prof.playerNo || getPlayerNo() || "").toUpperCase();
  try{
    await boot.setDoc(
      boot.doc(db, "rooms", currentRoomCode, "players", userUid),
      {
        nick: nick || null,
        playerNo: playerNo || null,
        country: prof.country || null,
        favClub: prof.favClub || null,
        avatar: prof.avatar || null,
        lastActiveAt: boot.serverTimestamp()
      },
      { merge:true }
    );
  }catch(e){
    // ignore
  }
}

async function leaveRoom(){
  if(!currentRoomCode) return;
  try{
    await boot.deleteDoc(boot.doc(db, "rooms", currentRoomCode, "players", userUid));
  }catch{}

  clearSavedRoom();
  cleanupRoomListeners();

  currentRoomCode = null;
  currentRoom = null;

  matchesCache = [];
  picksCache = {};
  picksDocByUid = {};
  submittedByUid = {};
  lastPlayers = [];
  pointsByUid = {};
  myPoints = null;

  renderMatches();
  renderPlayers([]);

  showScreen("home");
  showToast(getLang()==="en" ? "Left room" : "Opuszczono pokój");
}

function cleanupRoomListeners(){
  if(unsubRoomDoc){ unsubRoomDoc(); unsubRoomDoc=null; }
  if(unsubPlayers){ unsubPlayers(); unsubPlayers=null; }
  if(unsubMatches){ unsubMatches(); unsubMatches=null; }
  if(unsubPicks){ unsubPicks(); unsubPicks=null; }
  stopMessagesListener();
}

// ===== OPEN ROOM =====
async function openRoom(code, opts={}){
  const { silent=false, force=false } = opts;
  code = (code||"").trim().toUpperCase();
  if(!code || code.length!==6) throw new Error("Bad code");

  if(!force && currentRoomCode === code){
    showScreen("room");
    return;
  }

  cleanupRoomListeners();
  currentRoomCode = code;
  showScreen("room");

  matchesCache = [];
  picksCache = {};
  picksDocByUid = {};
  submittedByUid = {};
  lastPlayers = [];
  pointsByUid = {};
  myPoints = null;

  renderMatches();
  renderPlayers([]);
  if(el("myPointsLabel")) el("myPointsLabel").textContent = "—";

  const ref = roomRef(code);
  const snap = await boot.getDoc(ref);
  if(!snap.exists()) throw new Error("Room not found");
  currentRoom = snap.data();

  currentRoundNo = currentRoom?.currentRoundNo || 1;
  currentSeasonNo = currentRoom?.currentSeasonNo || 1;
  refreshRoomSeasonLabels();

  el("roomName").textContent = currentRoom.name || "—";
  el("roomAdmin").textContent = currentRoom.adminNick || "—";
  el("roomCode").textContent = code;

  refreshNickLabels();

  const adm = isAdmin();
  el("btnAddQueue").style.display = adm ? "block" : "none";
  if (el("btnMyQueue")) el("btnMyQueue").style.display = adm ? "block" : "none";
  // 6000: widoczność „Wpisz wyniki” sterowana przez syncActionButtons()
  el("btnEnterResults").style.display = adm ? "block" : "none";
  el("btnEndRound").style.display = adm ? "block" : "none";
  el("btnEndRound").disabled = true;
  syncActionButtons();

  unsubRoomDoc = boot.onSnapshot(ref, (d)=>{
    if(!d.exists()) return;
    currentRoom = d.data();
    el("roomName").textContent = currentRoom.name || "—";
    el("roomAdmin").textContent = currentRoom.adminNick || "—";
    currentRoundNo = currentRoom?.currentRoundNo || 1;
    currentSeasonNo = currentRoom?.currentSeasonNo || 1;
    refreshRoomSeasonLabels();

    const adm2 = isAdmin();
    el("btnAddQueue").style.display = adm2 ? "block" : "none";
    if (el("btnMyQueue")) el("btnMyQueue").style.display = adm2 ? "block" : "none";
    // 6000: widoczność „Wpisz wyniki” sterowana przez syncActionButtons()
    el("btnEnterResults").style.display = adm2 ? "block" : "none";
    el("btnEndRound").style.display = adm2 ? "block" : "none";
    el("btnEndRound").disabled = !(adm2 && matchesCache.length && allResultsComplete());
    syncActionButtons();
    setTimeout(()=>{ maybeShowPendingEvents(); }, 200);
  });

  const pq = boot.query(playersCol(code), boot.orderBy("joinedAt","asc"));
  unsubPlayers = boot.onSnapshot(pq, (qs)=>{
    const arr = [];
    qs.forEach(docu=> arr.push(docu.data()));
    lastPlayers = arr;
    renderPlayers(arr);
  });

  unsubPicks = boot.onSnapshot(picksCol(code), (qs)=>{
    picksDocByUid = {};
    qs.forEach(d=>{
      const data = d.data();
      picksDocByUid[d.id] = data?.picks || {};
    });
    recomputeSubmittedMap();
    recomputePoints();
    renderPlayers(lastPlayers);
  });

  const mq = boot.query(matchesCol(code), boot.orderBy("idx","asc"));
  unsubMatches = boot.onSnapshot(mq, async (qs)=>{
    const arr = [];
    qs.forEach(docu=>{
      arr.push({ id: docu.id, ...docu.data() });
    });
    matchesCache = arr;

    recomputeSubmittedMap();
    recomputePoints();

    renderPlayers(lastPlayers);

    await loadMyPicks();
    renderMatches();

    syncActionButtons();
    if(el("btnEndRound")) el("btnEndRound").disabled = !(isAdmin() && matchesCache.length && allResultsComplete());
  });

  // Wiadomości (czerwony wykrzyknik na btn_messages)
  startMessagesListener();

  // Presence (online dot)
  startPresenceHeartbeat();

  if(!silent) showToast((getLang()==="en") ? `In room: ${code}` : `W pokoju: ${code}`);
}

// ===== PICKS =====
async function loadMyPicks(){
  try{
    const ref = boot.doc(db, "rooms", currentRoomCode, "picks", userUid);
    const snap = await boot.getDoc(ref);
    if(!snap.exists()){
      picksCache = {};
      return;
    }
    const data = snap.data();
    picksCache = data?.picks || {};
  }catch{
    picksCache = {};
  }
}

function allMyPicksFilled(){
  return isCompletePicksObject(picksCache);
}

// ===== 6000: ACTION BUTTON VISIBILITY =====
// Zasada: zanim zapiszesz typy -> widać „Zapisz typy”
// Po zapisaniu typów -> „Zapisz typy” znika, a adminowi pojawia się „Wpisz wyniki”.
function syncActionButtons(){
  const btnSave = el("btnSaveAll");
  const btnEnter = el("btnEnterResults");
  const btnAddQueue = el("btnAddQueue");
  const submitted = iAmSubmitted();
  const adm = isAdmin();
  const resultsOk = allResultsComplete();
  const everyoneSubmitted = allPlayersSubmitted();

  if(btnSave){
    btnSave.style.display = submitted ? "none" : "block";
    // jeśli nie zapisane, pilnujemy kompletności typów
    // 6008: po zamknięciu typowania blokujemy dopisywanie/zmianę typów
    btnSave.disabled = submitted ? true : (typingClosed || !allMyPicksFilled());
  }

  if(btnEnter){
    // 7028: "Wpisz wyniki" ma pojawić się adminowi po zapisaniu JEGO typów.
    // (inni gracze mogą jeszcze nie mieć zapisanych typów)
    const canEnter = (adm && matchesCache.length && (submitted || typingClosed));
    btnEnter.style.display = canEnter ? "block" : "none";
    btnEnter.disabled = !canEnter || resultsOk;
  }

  // 6003: po dodaniu kolejki (gdy istnieją mecze w aktywnej kolejce) blokujemy "Dodaj kolejkę"
  // aż do zakończenia kolejki (archiwizacja usuwa mecze -> przycisk znów aktywny).
  if(btnAddQueue){
    btnAddQueue.disabled = !!(adm && matchesCache.length);
  }
  // 7009+: przycisk usuwania pokoju widoczny tylko dla admina
  const btnDel = el("btnDeleteRoom");
  const delWrap = el("leftDeleteRoomCard");
  if(delWrap){
    delWrap.style.display = adm ? "flex" : "none";
  }
  if(btnDel){
    btnDel.style.display = adm ? "inline-flex" : "none";
    btnDel.disabled = !adm;
  }

}

async function saveAllPicks(){
  if(!currentRoomCode) return;

  if(typingClosed){
    showToast(getLang()==="en" ? "Typing closed" : "Typowanie zamknięte");
    return;
  }

  if(!matchesCache.length){
    showToast(getLang()==="en" ? "No matches" : "Brak meczów");
    return;
  }
  if(!allMyPicksFilled()){
    showToast(getLang()==="en" ? "Fill all picks" : "Uzupełnij wszystkie typy");
    return;
  }

  const ref = boot.doc(db, "rooms", currentRoomCode, "picks", userUid);
  await boot.setDoc(ref, {
    uid: userUid,
    nick: getNick(),
    updatedAt: boot.serverTimestamp(),
    picks: picksCache
  }, { merge:true });

  showToast(getLang()==="en" ? "Picks saved ✅" : "Zapisano typy ✅");

  recomputeSubmittedMap();
  recomputePoints();
  renderPlayers(lastPlayers);
  syncActionButtons();
}

// ===== RENDER =====
function renderPlayers(players){
  const box = el("playersList");
  if(!box) return;
  box.innerHTML = "";

  // v2032: pokazujemy tylko graczy z przypisanym numerem gracza
  const visiblePlayers = (players||[]).filter(p => String(p?.playerNo || "").trim());

  const delBtn = el("btnDeletePlayer");
  if(delBtn) delBtn.style.display = isAdmin() ? "" : "none";

  const adminUid = currentRoom?.adminUid;
  const myOk = iAmSubmitted();
  const resultsOk = allResultsComplete();

  visiblePlayers.forEach(p=>{
    const row = document.createElement("div");
    row.className = "playerRow";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "8px";
    left.style.minWidth = "0";

    const dot = document.createElement("div");
    dot.className = "presenceDot";
    const active = isPlayerActive(p);
    dot.style.width = "8px";
    dot.style.height = "8px";
    dot.style.borderRadius = "999px";
    dot.style.flex = "0 0 auto";
    dot.style.background = active ? "#33ff88" : "#ff4d4d";
    dot.style.boxShadow = active ? "0 0 10px rgba(51,255,136,.55)" : "0 0 10px rgba(255,77,77,.45)";
    dot.title = active ? (getLang()==="en" ? "Active" : "Aktywny") : (getLang()==="en" ? "Inactive" : "Nieaktywny");

    const name = document.createElement("div");
    // Admin: show player number next to nick
    const baseNick = p.nick || "—";
    const pn = (isAdmin() && p.playerNo) ? String(p.playerNo).trim().toUpperCase() : "";
    name.textContent = pn ? `${baseNick} [${pn}]` : baseNick;
    name.style.whiteSpace = "nowrap";
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";

    const status = document.createElement("div");
    const ok = !!submittedByUid[p.uid];
    status.textContent = ok ? "✓" : "✗";
    status.style.fontWeight = "1000";
    status.style.fontSize = "16px";
    status.style.lineHeight = "1";
    status.style.color = ok ? "#33ff88" : "#ff4d4d";
    status.title = ok ? "Picks saved" : "Missing";
    if(getLang()==="pl") status.title = ok ? "Typy zapisane" : "Brak zapisanych typów";

    left.appendChild(dot);
    left.appendChild(name);
    left.appendChild(status);

    const right = document.createElement("div");
    right.className = "row";
    right.style.gap = "6px";


    // Delete player mode (admin) – show checkbox
    if(isAdmin() && deletePlayerMode && p.uid !== adminUid && p.uid !== userUid){
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "delChk";
      chk.title = (getLang()==="en") ? "Delete player" : "Usuń gracza";
      chk.onchange = async ()=>{
        if(!chk.checked) return;
        // confirm and delete
        const ok = await confirmDeletePlayer(p.nick || "—");
        if(!ok){ chk.checked = false; return; }
        await adminDeletePlayer(p.uid, p.nick || "—");
      };
      right.appendChild(chk);
    }

    if(resultsOk && isCompletePicksObject(picksDocByUid[p.uid])){
      const pts = pointsByUid[p.uid] ?? 0;
      const ptsBadge = document.createElement("div");
      ptsBadge.className = "badge";
      ptsBadge.textContent = (getLang()==="en") ? `${pts} pts` : `${pts} pkt`;
      right.appendChild(ptsBadge);
    }

    const eye = document.createElement("button");
    eye.className = "eyeBtn";
    eye.textContent = "👁";
    eye.title = myOk
      ? (getLang()==="en" ? "Preview picks" : "Podgląd typów")
      : (getLang()==="en" ? "Save your picks to preview others" : "Zapisz swoje typy, aby podglądać innych");
    eye.disabled = !myOk;
    eye.onclick = ()=> openPicksPreview(p.uid, p.nick || "—");
    right.appendChild(eye);

    if(p.uid === adminUid){
      const b = document.createElement("div");
      b.className = "badge";
      b.textContent = "ADMIN";
      right.appendChild(b);
    }
    // 6028: usunięto etykietę "TY"/"YOU" w panelu Gracze (zajmowała miejsce)

    row.appendChild(left);
    row.appendChild(right);
    box.appendChild(row);
  });
}

function createLogoImg(teamName){
  const slug = normalizeSlug(teamName);
  const img = document.createElement("img");
  img.className = "logo";
  img.alt = teamName;

  img.src = `./logos/${slug}.png`;
  img.onerror = () => {
    if(img.dataset.try === "jpg"){ img.style.display="none"; return; }
    img.dataset.try = "jpg";
    img.src = `./logos/${slug}.jpg`;
  };
  return img;
}

function renderMatches(){
  const list = el("matchesList");
  if(!list) return;
  list.innerHTML = "";

  recomputeTypingDeadline();

  el("matchesCount").textContent = String(matchesCache.length || 0);

  if(el("myPointsLabel")){
    if(allResultsComplete() && isCompletePicksObject(picksDocByUid[userUid])){
      el("myPointsLabel").textContent = String(pointsByUid[userUid] ?? 0);
    }else{
      el("myPointsLabel").textContent = "—";
    }
  }

  if(el("btnEndRound")) el("btnEndRound").disabled = !(isAdmin() && matchesCache.length && allResultsComplete());

  if(!matchesCache.length){
    const info = document.createElement("div");
    info.className = "sub";
    info.textContent = (getLang()==="en")
      ? "No active round. Admin can add a fixture."
      : "Brak aktywnej kolejki. Admin może dodać własną kolejkę.";
    list.appendChild(info);
    updateSaveButtonState();
    return;
  }

  // 6009: jeśli czas typowania minął i gracz NIE zapisał typów, chowamy mecze z ekranu typowania.
  // Admin dalej widzi mecze (żeby mógł wpisać wyniki / zakończyć kolejkę / dodać nową).
  const hideMatchesForNonSubmitter = !!(typingClosed && !isAdmin() && !iAmSubmitted());
  if(hideMatchesForNonSubmitter){
    const info = document.createElement("div");
    info.className = "sub";
    info.style.padding = "14px 12px";
    info.style.border = "1px solid rgba(255,255,255,.12)";
    info.style.borderRadius = "16px";
    info.style.background = "rgba(0,0,0,.18)";
    info.style.textAlign = "center";
    info.style.fontWeight = "900";
    info.textContent = (getLang()==="en")
      ? "Typing time is over. You didn't save your picks."
      : "Czas typowania minął. Nie zapisano Twoich typów.";
    list.appendChild(info);

    // nadal pokazujemy pasek licznika (00:00:00), żeby było jasne dlaczego zniknęły mecze
    const cd = document.createElement("div");
    cd.className = "typingCountdown";
    cd.style.marginTop = "auto";
    cd.style.padding = "10px 12px";
    cd.style.borderRadius = "16px";
    cd.style.border = "1px solid rgba(255,255,255,.12)";
    cd.style.background = "rgba(0,0,0,.18)";
    cd.style.display = "flex";
    cd.style.alignItems = "center";
    cd.style.justifyContent = "center";
    cd.style.gap = "10px";

    const label = document.createElement("div");
    label.style.fontWeight = "950";
    label.style.color = "rgba(255,255,255,.92)";
    label.textContent = "Do końca typowania pozostało:";

    const val = document.createElement("div");
    val.id = "typingCountdownValue";
    val.style.fontWeight = "1000";
    val.style.letterSpacing = ".5px";
    val.textContent = "00:00:00";

    cd.appendChild(label);
    cd.appendChild(val);
    list.appendChild(cd);

    updateSaveButtonState();
    return;
  }

  const fmtKickoff = (m) => {
    // wspieramy różne nazwy pól z poprzednich/ przyszłych wersji
    const raw = m.kickoff ?? m.kickoffAt ?? m.dateTime ?? m.datetime ?? m.date ?? null;
    if(!raw) return "—";

    let d = null;
    if(raw instanceof Date) d = raw;
    else if(typeof raw === "number") d = new Date(raw);
    else if(typeof raw === "string"){
      const ms = Date.parse(raw);
      if(!Number.isNaN(ms)) d = new Date(ms);
    }
    if(!d || Number.isNaN(d.getTime())) return "—";

    try{
      const lang = (getLang && getLang()==="en") ? "en-GB" : "pl-PL";
      const dd = new Intl.DateTimeFormat(lang, { day:"2-digit", month:"2-digit" }).format(d);
      const tt = new Intl.DateTimeFormat(lang, { hour:"2-digit", minute:"2-digit" }).format(d);
      return `${dd} ${tt}`;
    }catch{
      const pad = (n)=>String(n).padStart(2,"0");
      return `${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  };

  for(const m of matchesCache){
    const row = document.createElement("div");
    row.className = "matchRow";
    if(m.cancelled){ row.classList.add("cancelledRow"); }

    // ===== KOLUMNA 1: MECZ DO TYPOWANIA =====
    const pickCol = document.createElement("div");
    pickCol.className = "matchPickCol";

    const leftTeam = document.createElement("div");
    leftTeam.className = "team";
    const lLogo = createLogoImg(m.home);
    const lName = document.createElement("div");
    lName.className = "teamName";
    lName.textContent = m.home || "—";
    leftTeam.appendChild(lLogo);
    leftTeam.appendChild(lName);

    const rightTeam = document.createElement("div");
    rightTeam.className = "team";
    rightTeam.style.justifyContent = "flex-end";
    const rName = document.createElement("div");
    rName.className = "teamName";
    rName.style.textAlign = "right";
    rName.textContent = m.away || "—";
    const rLogo = createLogoImg(m.away);
    rightTeam.appendChild(rName);
    rightTeam.appendChild(rLogo);

    const score = document.createElement("div");
    score.className = "scoreBox";

    const inpH = document.createElement("input");
    inpH.className = "scoreInput";
    inpH.inputMode = "numeric";
    inpH.placeholder = "0";
    inpH.value = (picksCache[m.id]?.h ?? "") === "" ? "" : String(picksCache[m.id]?.h ?? "");
    inpH.disabled = typingClosed;
    inpH.oninput = () => {
      const v = clampInt(inpH.value, 0, 20);
      picksCache[m.id] = picksCache[m.id] || {};
      picksCache[m.id].h = v;
      updateSaveButtonState();
    };

    const sep = document.createElement("div");
    sep.className = "sep";
    sep.textContent = ":";

    const inpA = document.createElement("input");
    inpA.className = "scoreInput";
    inpA.inputMode = "numeric";
    inpA.placeholder = "0";
    inpA.value = (picksCache[m.id]?.a ?? "") === "" ? "" : String(picksCache[m.id]?.a ?? "");
    inpA.disabled = typingClosed;
    inpA.oninput = () => {
      const v = clampInt(inpA.value, 0, 20);
      picksCache[m.id] = picksCache[m.id] || {};
      picksCache[m.id].a = v;
      updateSaveButtonState();
    };

    score.appendChild(inpH);
    score.appendChild(sep);
    score.appendChild(inpA);

    // 5208: wynik jest wyświetlany w osobnej kolumnie (matchResultCol)

    pickCol.appendChild(leftTeam);
    pickCol.appendChild(score);
    pickCol.appendChild(rightTeam);

    // ===== KOLUMNA 2: WYNIK =====
    const resCol = document.createElement("div");
    resCol.className = "matchResultCol";
    if(m.cancelled){
      resCol.textContent = (getLang()==="en") ? "Cancelled" : "Odwołano";
      resCol.classList.add("cancelledLabel");
    }else if(Number.isInteger(m.resultH) && Number.isInteger(m.resultA)){
      resCol.textContent = `${m.resultH}:${m.resultA}`;
    }else{
      resCol.textContent = "—";
    }

    // ===== KOLUMNA 3: STATUS TYPU + PUNKTY ZA MECZ =====
    const dtCol = document.createElement("div");
    dtCol.className = "matchDateCol matchJudgeCol";

    const pNow = picksCache[m.id] || {};
    const ptsOne = scoreOneMatch(pNow.h, pNow.a, m.resultH, m.resultA);
    const dot = document.createElement("span");
    dot.className = "dot matchJudgeDot " + ((ptsOne === null) ? "gray" : dotClassFor(pNow.h, pNow.a, m.resultH, m.resultA));
    dot.title = (ptsOne === null)
      ? ((getLang()==="en") ? "No settled points yet" : "Brak rozliczonych punktów")
      : ((getLang()==="en") ? `${ptsOne} pts` : `${ptsOne} pkt`);

    const ptsLbl = document.createElement("div");
    ptsLbl.className = "matchJudgePts";
    ptsLbl.textContent = (ptsOne === null)
      ? ((getLang()==="en") ? "pts —" : "pkt —")
      : ((getLang()==="en") ? `pts ${ptsOne}` : `pkt ${ptsOne}`);

    dtCol.appendChild(dot);
    dtCol.appendChild(ptsLbl);

    row.appendChild(pickCol);
    row.appendChild(resCol);
    row.appendChild(dtCol);
    list.appendChild(row);
  }



  // ===== 6008: licznik do końca typowania (1 min przed pierwszym meczem) + suma rozliczonych punktów =====
  const cd = document.createElement("div");
  cd.className = "typingCountdown";
  cd.style.marginTop = "auto";
  cd.style.padding = "10px 12px";
  cd.style.borderRadius = "16px";
  cd.style.border = "1px solid rgba(255,255,255,.12)";
  cd.style.background = "rgba(0,0,0,.18)";
  cd.style.display = "flex";
  cd.style.alignItems = "center";
  cd.style.justifyContent = "space-between";
  cd.style.gap = "10px";

  const label = document.createElement("div");
  label.style.fontWeight = "950";
  label.style.color = "rgba(255,255,255,.92)";
  label.textContent = "Do końca typowania pozostało:";

  const val = document.createElement("div");
  val.id = "typingCountdownValue";
  val.style.fontWeight = "1000";
  val.style.letterSpacing = ".5px";

  if(typingDeadlineMs == null){
    cd.style.display = "none";
  }else{
    const left = typingDeadlineMs - Date.now();
    val.textContent = formatCountdown(left);
    if(left <= 0){
      typingClosed = true;
      val.textContent = "00:00:00";
    }
  }

  const settledPtsSum = matchesCache.reduce((acc, mm)=>{
    const pp = picksCache[mm.id] || {};
    const one = scoreOneMatch(pp.h, pp.a, mm.resultH, mm.resultA);
    return acc + (Number.isInteger(one) ? one : 0);
  }, 0);

  const leftWrap = document.createElement("div");
  leftWrap.style.display = "flex";
  leftWrap.style.alignItems = "center";
  leftWrap.style.justifyContent = "center";
  leftWrap.style.gap = "10px";
  leftWrap.style.flex = "1 1 auto";
  leftWrap.appendChild(label);
  leftWrap.appendChild(val);

  const settledBox = document.createElement("div");
  settledBox.className = "settledPointsBox";
  settledBox.textContent = (getLang()==="en") ? `Settled pts: ${settledPtsSum}` : `Suma pkt: ${settledPtsSum}`;

  cd.appendChild(leftWrap);
  cd.appendChild(settledBox);
  list.appendChild(cd);
  updateSaveButtonState();
}

function updateSaveButtonState(){
  // 6000: aktualizuje też widoczność przycisków akcji
  syncActionButtons();
}

// ===== PODGLĄD TYPOW (MODAL) =====
function openPicksPreview(uid, nick){
  if(!currentRoomCode) return;

  const picksObj = picksDocByUid[uid] || null;
  const hasPicks = isCompletePicksObject(picksObj);

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "10px";

  const top = document.createElement("div");
  top.className = "row";
  top.style.flexWrap = "wrap";

  const titleChip = document.createElement("div");
  titleChip.className = "chip";
  titleChip.textContent = (getLang()==="en") ? `Player: ${nick}` : `Gracz: ${nick}`;

  const roundChip = document.createElement("div");
  roundChip.className = "chip";
  roundChip.textContent = `${t("round")} ${currentRoundNo} • ${(getLang()==="en") ? `Season ${currentSeasonNo}` : `Sezon ${currentSeasonNo}`}`;

  const ptsChip = document.createElement("div");
  ptsChip.className = "chip";
  if(allResultsComplete() && hasPicks){
    const pts = pointsByUid[uid] ?? 0;
    ptsChip.textContent = (getLang()==="en") ? `POINTS: ${pts}` : `PUNKTY: ${pts}`;
  }else{
    ptsChip.textContent = (getLang()==="en") ? `POINTS: —` : `PUNKTY: —`;
  }

  top.appendChild(titleChip);
  top.appendChild(roundChip);
  top.appendChild(ptsChip);
  wrap.appendChild(top);

  if(!hasPicks){
    const info = document.createElement("div");
    info.className = "sub";
    info.textContent = (getLang()==="en")
      ? "This player has not saved picks for this round."
      : "Ten gracz nie ma jeszcze zapisanych typów w tej kolejce.";
    wrap.appendChild(info);
    modalOpen((getLang()==="en") ? "Picks preview" : "Podgląd typów", wrap);
    return;
  }

  for(const m of matchesCache){
    const row = document.createElement("div");
    row.className = "matchCard";

    const leftTeam = document.createElement("div");
    leftTeam.className = "team";
    leftTeam.appendChild(createLogoImg(m.home));
    const ln = document.createElement("div");
    ln.className = "teamName";
    ln.textContent = m.home || "—";
    leftTeam.appendChild(ln);

    const score = document.createElement("div");
    score.className = "scoreBox";

    const p = picksObj[m.id];
    const pickPill = document.createElement("div");
    pickPill.className = "resultPill";
    pickPill.textContent = (getLang()==="en") ? `Pick: ${p.h}:${p.a}` : `Typ: ${p.h}:${p.a}`;
    score.appendChild(pickPill);

    const resOk = Number.isInteger(m.resultH) && Number.isInteger(m.resultA);
    const dot = document.createElement("span");
    dot.className = "dot " + (resOk ? dotClassFor(p.h,p.a,m.resultH,m.resultA) : "gray");

    const resPill = document.createElement("div");
    resPill.className = "resultPill";
    resPill.textContent = resOk
      ? ((getLang()==="en") ? `Result: ${m.resultH}:${m.resultA}` : `Wynik: ${m.resultH}:${m.resultA}`)
      : ((getLang()==="en") ? "Result: —" : "Wynik: —");

    const pts = resOk ? scoreOneMatch(p.h,p.a,m.resultH,m.resultA) : null;
    const ptsPill = document.createElement("div");
    ptsPill.className = "resultPill";
    ptsPill.textContent = (pts === null)
      ? ((getLang()==="en") ? "pts: —" : "pkt: —")
      : ((getLang()==="en") ? `pts: ${pts}` : `pkt: ${pts}`);

    score.appendChild(dot);
    score.appendChild(resPill);
    score.appendChild(ptsPill);

    const rightTeam = document.createElement("div");
    rightTeam.className = "team";
    rightTeam.style.justifyContent = "flex-end";
    const rn = document.createElement("div");
    rn.className = "teamName";
    rn.style.textAlign = "right";
    rn.textContent = m.away || "—";
    rightTeam.appendChild(rn);
    rightTeam.appendChild(createLogoImg(m.away));

    row.appendChild(leftTeam);
    row.appendChild(score);
    row.appendChild(rightTeam);

    wrap.appendChild(row);
  }

  modalOpen((getLang()==="en") ? "Picks preview" : "Podgląd typów", wrap);
}

// ===== RESULTS SCREEN (ADMIN) =====
const resultsDraft = {}; // matchId -> {h,a}

// 7030: odwoływanie meczów z ekranu wpisywania wyników (btn_matches_cancel.png)
let resultsCancelMode = false;
const resultsCancelSelected = new Set();

let _cancelMatchConfirmModal = null;
function ensureCancelMatchConfirmModal(){
  if(_cancelMatchConfirmModal) return _cancelMatchConfirmModal;

  if(!document.getElementById('cancelMatchConfirmStyles')){
    const st = document.createElement('style');
    st.id = 'cancelMatchConfirmStyles';
    st.textContent = `
      .cancelMatchOverlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;}
      .cancelMatchBox{width:min(760px,92vw);background:rgba(6,18,40,.92);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:22px 22px 18px;}
      .cancelMatchTitle{font-weight:800;font-size:22px;margin:0 0 10px 0;color:#fff;}
      .cancelMatchText{font-weight:600;line-height:1.35;font-size:15px;color:rgba(255,255,255,.88);}
      .cancelMatchActions{display:flex;gap:18px;justify-content:center;align-items:center;margin-top:18px;}
      .cancelMatchBtnImg{height:58px;cursor:pointer;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));}
      .cancelMatchBtnImg:active{transform:translateY(1px);}
      @media (max-width:520px){.cancelMatchBtnImg{height:52px;}}
    `;
    document.head.appendChild(st);
  }

  const overlay = document.createElement('div');
  overlay.className = 'cancelMatchOverlay';
  overlay.innerHTML = `
    <div class="cancelMatchBox" role="dialog" aria-modal="true">
      <div class="cancelMatchTitle">${getLang()==='en' ? 'Cancelled match' : 'Mecz odwołany'}</div>
      <div class="cancelMatchText" id="cancelMatchConfirmText"></div>
      <div class="cancelMatchActions">
        <img id="cancelMatchBtnYes" class="cancelMatchBtnImg" alt="YES" />
        <img id="cancelMatchBtnNo" class="cancelMatchBtnImg" alt="NO" />
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const elText = overlay.querySelector('#cancelMatchConfirmText');
  const btnYes = overlay.querySelector('#cancelMatchBtnYes');
  const btnNo = overlay.querySelector('#cancelMatchBtnNo');

  let _resolver = null;
  function close(val){
    overlay.style.display = 'none';
    const r = _resolver; _resolver = null;
    if(r) r(val);
  }

  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(false); });
  btnNo.addEventListener('click', ()=>close(false));
  btnYes.addEventListener('click', ()=>close(true));

  _cancelMatchConfirmModal = {
    open: (text)=>{
      const lang = getLang()==='en' ? 'en' : 'pl';
      btnYes.src = `ui/buttons/${lang}/btn_yes.png`;
      btnNo.src  = `ui/buttons/${lang}/btn_no.png`;
      elText.textContent = text;
      overlay.style.display = 'flex';
      return new Promise(resolve=>{ _resolver = resolve; });
    }
  };

  return _cancelMatchConfirmModal;
}

function openResultsScreen(){
  if(!currentRoomCode) return;
  if(!isAdmin()) return;

  // 7030: reset odwoływania meczów
  resultsCancelMode = false;
  resultsCancelSelected.clear();

  el("resRoomName").textContent = currentRoom?.name || "—";
  el("resRound").textContent = `${t("round")} ${currentRoundNo}`;

  for(const m of matchesCache){
    resultsDraft[m.id] = {
      h: Number.isInteger(m.resultH) ? m.resultH : null,
      a: Number.isInteger(m.resultA) ? m.resultA : null
    };
  }

  renderResultsList();
  showScreen("results");
}

function renderResultsList(){
  const list = el("resultsList");
  if(!list) return;
  list.innerHTML = "";

  for(const m of matchesCache){
    const card = document.createElement("div");
    card.className = "matchCard";

    const leftTeam = document.createElement("div");
    leftTeam.className = "team";
    leftTeam.appendChild(createLogoImg(m.home));
    const lName = document.createElement("div");
    lName.className = "teamName";
    lName.textContent = m.home || "—";
    leftTeam.appendChild(lName);

    const rightTeam = document.createElement("div");
    rightTeam.className = "team";
    rightTeam.style.justifyContent = "flex-end";
    const rName = document.createElement("div");
    rName.className = "teamName";
    rName.style.textAlign = "right";
    rName.textContent = m.away || "—";
    rightTeam.appendChild(rName);
    rightTeam.appendChild(createLogoImg(m.away));

    const score = document.createElement("div");
    score.className = "scoreBox";

    const inpH = document.createElement("input");
    inpH.className = "scoreInput";
    inpH.inputMode = "numeric";
    inpH.placeholder = "0";
    inpH.value = resultsDraft[m.id]?.h ?? "";
    inpH.oninput = () => {
      const v = clampInt(inpH.value, 0, 20);
      resultsDraft[m.id].h = v;
    };

    const sep = document.createElement("div");
    sep.className = "sep";
    sep.textContent = ":";

    const inpA = document.createElement("input");
    inpA.className = "scoreInput";
    inpA.inputMode = "numeric";
    inpA.placeholder = "0";
    inpA.value = resultsDraft[m.id]?.a ?? "";
    inpA.oninput = () => {
      const v = clampInt(inpA.value, 0, 20);
      resultsDraft[m.id].a = v;
    };

    // jeśli mecz odwołany – pokazujemy etykietę i blokujemy wpisywanie
    if(m.cancelled){
      const lab = document.createElement("div");
      lab.className = "cancelledPill";
      lab.textContent = (getLang()==="en") ? "Cancelled" : "Odwołano";
      score.appendChild(lab);
      inpH.disabled = true;
      inpA.disabled = true;
      inpH.value = "";
      inpA.value = "";
    }else{
      score.appendChild(inpH);
      score.appendChild(sep);
      score.appendChild(inpA);
    }

    card.appendChild(leftTeam);
    card.appendChild(score);
    card.appendChild(rightTeam);

    // 7030: checkboxy do odwoływania meczów – kolumna po prawej stronie
    const cancelCol = document.createElement("div");
    cancelCol.className = "cancelCol";
    if(resultsCancelMode && !m.cancelled){
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "cancelChk";
      chk.checked = resultsCancelSelected.has(m.id);
      chk.onchange = () => {
        if(chk.checked) resultsCancelSelected.add(m.id);
        else resultsCancelSelected.delete(m.id);
      };
      cancelCol.appendChild(chk);
    }else{
      cancelCol.innerHTML = "&nbsp;";
    }
    card.appendChild(cancelCol);

    if(m.cancelled) card.classList.add("cancelledRow");

    list.appendChild(card);
  }
}

async function saveResults(){
  if(!currentRoomCode) return;
  if(!isAdmin()) { showToast(getLang()==="en" ? "Admin only" : "Tylko admin"); return; }
  if(!matchesCache.length) { showToast(getLang()==="en" ? "No matches" : "Brak meczów"); return; }

  // 7030: jeśli zaznaczono mecze do odwołania – potwierdź i oznacz je jako cancelled
  if(resultsCancelSelected.size){
    const txt = (getLang()==='en')
      ? 'Was the match cancelled and there is no final result?'
      : 'Czy mecz został odwołany i nie ma ostatecznego wyniku pojedynku?';
    const ok = await ensureCancelMatchConfirmModal().open(txt);
    if(!ok) {
      // nie zmieniamy nic; użytkownik może dalej wpisać wyniki
    } else {
      const b0 = boot.writeBatch(db);
      for(const id of resultsCancelSelected){
        const ref = boot.doc(db, 'rooms', currentRoomCode, 'matches', id);
        b0.update(ref, {
          cancelled: true,
          cancelledAt: boot.serverTimestamp(),
          cancelledBy: userUid,
          resultH: null,
          resultA: null
        });
      }
      await b0.commit();

      for(const id of resultsCancelSelected){
        const m = matchesCache.find(x=>x.id===id);
        if(m){
          m.cancelled = true;
          m.resultH = null;
          m.resultA = null;
        }
        if(resultsDraft[id]){ resultsDraft[id].h = null; resultsDraft[id].a = null; }
      }
      resultsCancelSelected.clear();
      resultsCancelMode = false;
      renderResultsList();
      renderMatches();
      syncActionButtons();
    }
  }

  // 6002: pozwalamy wpisywać pojedyncze wyniki (nie wszystkie mecze są równocześnie).
  // Zapisujemy tylko te mecze, gdzie podano OBA pola wyniku.
  const updates = [];
  for(const m of matchesCache){
    const d = resultsDraft[m.id];
    const hOk = d && Number.isInteger(d.h);
    const aOk = d && Number.isInteger(d.a);

    // jeśli coś wpisane, wymagamy kompletu dla danego meczu
    if(hOk || aOk){
      if(!(hOk && aOk)){
        showToast(getLang()==="en" ? "Enter both scores for a match" : "Wpisz oba pola wyniku dla meczu");
        return;
      }
      updates.push({ id: m.id, h: d.h, a: d.a });
    }
  }

  if(!updates.length){
    showToast(getLang()==="en" ? "No results to save" : "Brak wyników do zapisania");
    return;
  }

  const b = boot.writeBatch(db);
  for(const u of updates){
    const ref = boot.doc(db, "rooms", currentRoomCode, "matches", u.id);
    b.update(ref, {
      resultH: u.h,
      resultA: u.a,
      resultAt: boot.serverTimestamp(),
      resultBy: userUid
    });
  }
  await b.commit();

  // natychmiast odśwież lokalny cache, żeby wyniki od razu pokazały się na ekranie
  for(const u of updates){
    const m = matchesCache.find(x=>x.id===u.id);
    if(m){
      m.resultH = u.h;
      m.resultA = u.a;
    }
  }

  recomputePoints();
  renderPlayers(lastPlayers);
  renderMatches();
  syncActionButtons();
  if(el("btnEndRound")) el("btnEndRound").disabled = !(isAdmin() && matchesCache.length && allResultsComplete());

  showToast(getLang()==="en" ? "Results saved ✅" : "Zapisano wyniki ✅");
  showScreen("room");
}

// ===== ARCHIWUM KOLEJEK (HISTORIA) =====

// Custom confirm modal (instead of system window.confirm) for ending a round.
// Uses ui/buttons/{lang}/btn_yes.png and btn_no.png
let _endRoundConfirmModal = null;

// ===== POTWIERDZENIE ZMIAN W PROFILU =====
let _profileChangeConfirmModal = null;
function ensureProfileChangeConfirmModal(){
  if(_profileChangeConfirmModal) return _profileChangeConfirmModal;

  if(!document.getElementById("profileChangeConfirmStyles")){
    const st = document.createElement('style');
    st.id = "profileChangeConfirmStyles";
    st.textContent = `
      .profileChangeOverlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;}
      .profileChangeBox{width:min(760px,92vw);background:rgba(6,18,40,.92);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:22px 22px 18px;}
      .profileChangeTitle{font-weight:800;font-size:20px;margin:0 0 10px 0;color:#fff;}
      .profileChangeText{font-weight:600;line-height:1.35;font-size:15px;color:rgba(255,255,255,.88);}
      .profileChangeActions{display:flex;gap:18px;justify-content:center;align-items:center;margin-top:18px;}
      .profileChangeBtnImg{height:58px;cursor:pointer;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));}
      .profileChangeBtnImg:active{transform:translateY(1px);}
      @media (max-width:520px){.profileChangeBtnImg{height:52px;}}
    `;
    document.head.appendChild(st);
  }

  const overlay = document.createElement('div');
  overlay.className = 'profileChangeOverlay';
  overlay.innerHTML = `
    <div class="profileChangeBox" role="dialog" aria-modal="true">
      <div class="profileChangeTitle" id="profileChangeTitle"></div>
      <div class="profileChangeText" id="profileChangeText"></div>
      <div class="profileChangeActions">
        <img id="profileChangeYes" class="profileChangeBtnImg" alt="Yes" />
        <img id="profileChangeNo" class="profileChangeBtnImg" alt="No" />
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const elTitle = overlay.querySelector('#profileChangeTitle');
  const elText  = overlay.querySelector('#profileChangeText');
  const btnYes  = overlay.querySelector('#profileChangeYes');
  const btnNo   = overlay.querySelector('#profileChangeNo');

  let _resolver = null;

  function close(val){
    overlay.style.display = 'none';
    const r = _resolver; _resolver = null;
    if(r) r(val);
  }

  btnYes.addEventListener('click', ()=>close(true));
  btnNo.addEventListener('click', ()=>close(false));
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(false); });

  _profileChangeConfirmModal = {
    open: ({title, text}={})=>{
      const lang = getLang()==='en' ? 'en' : 'pl';
      btnYes.src = `ui/buttons/${lang}/btn_yes.png`;
      btnNo.src  = `ui/buttons/${lang}/btn_no.png`;
      elTitle.textContent = title || (lang==='en' ? 'Profile changes' : 'Zmiany profilu');
      elText.textContent  = text  || '';
      overlay.style.display = 'flex';
      return new Promise(resolve=>{ _resolver = resolve; });
    }
  };
  return _profileChangeConfirmModal;
}

function generateFreshPlayerNo(countryCode){
  const c = String(countryCode || "").trim().toUpperCase();
  const prefix = (c && /^[A-Z]{2}$/.test(c)) ? c[0] : "X";
  const digits = String(Math.floor(Math.random()*1_000_000)).padStart(6, "0");
  const next = prefix + digits;
  localStorage.setItem(KEY_PLAYER_NO, next);
  const p = getProfile() || {};
  p.playerNo = next;
  setProfile(p);
  return next;
}

function ensureEndRoundConfirmModal(){
  if(_endRoundConfirmModal) return _endRoundConfirmModal;

  // styles (once)
  if(!document.getElementById("endRoundConfirmStyles")){
    const st = document.createElement('style');
    st.id = "endRoundConfirmStyles";
    st.textContent = `
      .endRoundOverlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;}
      .endRoundBox{width:min(720px,92vw);background:rgba(6,18,40,.92);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:22px 22px 18px;}
      .endRoundTitle{font-weight:800;font-size:22px;margin:0 0 10px 0;color:#fff;}
      .endRoundText{font-weight:600;line-height:1.35;font-size:15px;color:rgba(255,255,255,.88);}
      .endRoundActions{display:flex;gap:18px;justify-content:center;align-items:center;margin-top:18px;}
      .endRoundBtnImg{height:58px;cursor:pointer;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));}
      .endRoundBtnImg:active{transform:translateY(1px);}
      @media (max-width:520px){.endRoundBtnImg{height:52px;}}
    `;
    document.head.appendChild(st);
  }

  const overlay = document.createElement('div');
  overlay.className = 'endRoundOverlay';
  overlay.innerHTML = `
    <div class="endRoundBox" role="dialog" aria-modal="true">
      <div class="endRoundTitle">${getLang()==='en' ? 'End round' : 'Zakończ kolejkę'}</div>
      <div class="endRoundText" id="endRoundConfirmText"></div>
      <div class="endRoundActions">
        <img id="endRoundBtnYes" class="endRoundBtnImg" alt="YES" />
        <img id="endRoundBtnNo" class="endRoundBtnImg" alt="NO" />
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const elText = overlay.querySelector('#endRoundConfirmText');
  const btnYes = overlay.querySelector('#endRoundBtnYes');
  const btnNo = overlay.querySelector('#endRoundBtnNo');

  let _resolver = null;
  function close(val){
    overlay.style.display = 'none';
    const r = _resolver; _resolver = null;
    if(r) r(val);
  }

  overlay.addEventListener('click', (e)=>{
    if(e.target === overlay) close(false);
  });
  btnNo.addEventListener('click', ()=>close(false));
  btnYes.addEventListener('click', ()=>close(true));

  _endRoundConfirmModal = {
    open: (text)=>{
      const lang = getLang()==='en' ? 'en' : 'pl';
      btnYes.src = `ui/buttons/${lang}/btn_yes.png`;
      btnNo.src  = `ui/buttons/${lang}/btn_no.png`;
      elText.textContent = text;
      overlay.style.display = 'flex';
      return new Promise(resolve=>{ _resolver = resolve; });
    }
  };

  return _endRoundConfirmModal;
}

async function customConfirmEndRound(){
  const txt = (getLang()==='en')
    ? 'End the round? Ending will archive the round and add all points to players.'
    : 'Czy zakończyć kolejkę? Zakończenie spowoduje przeniesienie do archiwum a wszystkie punkty doliczone do graczy.';
  return await ensureEndRoundConfirmModal().open(txt);
}

// Custom confirm modal for leaving room (instead of system confirm)
let _leaveRoomConfirmModal = null;
function ensureLeaveRoomConfirmModal(){
  if(_leaveRoomConfirmModal) return _leaveRoomConfirmModal;

  if(!document.getElementById("leaveRoomConfirmStyles")){
    const st = document.createElement('style');
    st.id = "leaveRoomConfirmStyles";
    st.textContent = `
      .leaveRoomOverlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;}
      .leaveRoomBox{width:min(820px,92vw);background:rgba(6,18,40,.92);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:22px 22px 18px;}
      .leaveRoomTitle{font-weight:900;font-size:22px;margin:0 0 10px 0;color:#fff;}
      .leaveRoomText{font-weight:650;line-height:1.35;font-size:15px;color:rgba(255,255,255,.90);white-space:pre-wrap;}
      .leaveRoomActions{display:flex;gap:18px;justify-content:center;align-items:center;margin-top:18px;}
      .leaveRoomBtnImg{height:58px;cursor:pointer;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));}
      .leaveRoomBtnImg:active{transform:translateY(1px);} 
      @media (max-width:520px){.leaveRoomBtnImg{height:52px;}}
    `;
    document.head.appendChild(st);
  }

  const overlay = document.createElement('div');
  overlay.className = 'leaveRoomOverlay';
  overlay.innerHTML = `
    <div class="leaveRoomBox" role="dialog" aria-modal="true">
      <div class="leaveRoomTitle">${getLang()==='en' ? 'Leave room' : 'Opuść pokój'}</div>
      <div class="leaveRoomText" id="leaveRoomConfirmText"></div>
      <div class="leaveRoomActions">
        <img id="leaveRoomBtnYes" class="leaveRoomBtnImg" alt="YES" />
        <img id="leaveRoomBtnNo" class="leaveRoomBtnImg" alt="NO" />
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const elText = overlay.querySelector('#leaveRoomConfirmText');
  const btnYes = overlay.querySelector('#leaveRoomBtnYes');
  const btnNo = overlay.querySelector('#leaveRoomBtnNo');

  let _resolver = null;
  function close(val){
    overlay.style.display = 'none';
    const r = _resolver; _resolver = null;
    if(r) r(val);
  }

  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(false); });
  btnNo.addEventListener('click', ()=>close(false));
  btnYes.addEventListener('click', ()=>close(true));

  _leaveRoomConfirmModal = {
    open: (text)=>{
      const lang = getLang()==='en' ? 'en' : 'pl';
      btnYes.src = `ui/buttons/${lang}/btn_yes.png`;
      btnNo.src  = `ui/buttons/${lang}/btn_no.png`;
      elText.textContent = text;
      overlay.style.display = 'flex';
      return new Promise(resolve=>{ _resolver = resolve; });
    }
  };
  return _leaveRoomConfirmModal;
}

async function customConfirmLeaveRoom(){
  const txt = (getLang()==='en')
    ? 'When you leave the room, you can return later, but you will need the access code.\nBefore leaving, save the code so you can join again.\nContinue?'
    : 'Kiedy opuścisz pokój ponownie będziesz mógł do niego powrócić ale trzeba będzie podać kod dostępu do pokoju.\nPrzed opuszczeniem pokoju zapisz sobie kod aby móc do niego ponownie wejść.\nCzy kontynuować?';
  return await ensureLeaveRoomConfirmModal().open(txt);
}


// ===== 7009/7019: Custom confirm modal for deleting room (ADMIN ONLY) =====
// (W v7018 brakowało implementacji – przez to przycisk "Usuwanie pokoju" nie reagował.)
let _deleteRoomConfirmModal = null;
function ensureDeleteRoomConfirmModal(){
  if(_deleteRoomConfirmModal) return _deleteRoomConfirmModal;

  if(!document.getElementById('deleteRoomConfirmStyles')){
    const st = document.createElement('style');
    st.id = 'deleteRoomConfirmStyles';
    st.textContent = `
      .deleteRoomOverlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.62);display:none;align-items:center;justify-content:center;}
      .deleteRoomBox{width:min(900px,92vw);background:rgba(6,18,40,.94);border:1px solid rgba(255,255,255,.14);border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.6);padding:24px 22px 18px;}
      .deleteRoomTitle{font-weight:950;font-size:22px;margin:0 0 10px 0;color:#fff;}
      .deleteRoomText{font-weight:700;line-height:1.35;font-size:15px;color:rgba(255,255,255,.92);white-space:pre-wrap;}
      .deleteRoomActions{display:flex;gap:18px;justify-content:center;align-items:center;margin-top:18px;}
      .deleteRoomBtnImg{height:58px;cursor:pointer;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));}
      .deleteRoomBtnImg:active{transform:translateY(1px);} 
      @media (max-width:520px){.deleteRoomBtnImg{height:52px;}}
    `;
    document.head.appendChild(st);
  }

  const overlay = document.createElement('div');
  overlay.className = 'deleteRoomOverlay';
  overlay.innerHTML = `
    <div class="deleteRoomBox" role="dialog" aria-modal="true">
      <div class="deleteRoomTitle">${getLang()==='en' ? 'Delete room' : 'Usuń pokój'}</div>
      <div class="deleteRoomText" id="deleteRoomConfirmText"></div>
      <div class="deleteRoomActions">
        <img id="deleteRoomBtnYes" class="deleteRoomBtnImg" alt="YES" />
        <img id="deleteRoomBtnNo" class="deleteRoomBtnImg" alt="NO" />
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const elText = overlay.querySelector('#deleteRoomConfirmText');
  const btnYes = overlay.querySelector('#deleteRoomBtnYes');
  const btnNo  = overlay.querySelector('#deleteRoomBtnNo');

  let _resolver = null;
  function close(val){
    overlay.style.display = 'none';
    const r = _resolver; _resolver = null;
    if(r) r(val);
  }

  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(false); });
  btnNo.addEventListener('click', ()=>close(false));
  btnYes.addEventListener('click', ()=>close(true));

  _deleteRoomConfirmModal = {
    open: (text)=>{
      const lang = getLang()==='en' ? 'en' : 'pl';
      btnYes.src = `ui/buttons/${lang}/btn_yes.png`;
      btnNo.src  = `ui/buttons/${lang}/btn_no.png`;
      elText.textContent = text;
      overlay.style.display = 'flex';
      return new Promise(resolve=>{ _resolver = resolve; });
    }
  };

  return _deleteRoomConfirmModal;
}

async function customConfirmDeleteRoom(){
  const txt = (getLang()==='en')
    ? 'Are you sure you want to delete this room?\nThis process is permanent and cannot be undone.'
    : 'Czy na pewno chcesz usunąć ten pokój.\nProces ten jest definitywny i nie ma po nim możliwości cofnięcia procesu.';
  return await ensureDeleteRoomConfirmModal().open(txt);
}

async function __deleteAllDocsInCollection(colRef){
  const snap = await boot.getDocs(colRef);
  const docs = snap.docs || [];
  const CHUNK = 400;
  for(let i=0;i<docs.length;i+=CHUNK){
    const b = boot.writeBatch(db);
    docs.slice(i,i+CHUNK).forEach(d=> b.delete(d.ref));
    await b.commit();
  }
}

async function deleteRoomConfirmAndDelete(){
  if(!currentRoomCode) return;
  if(!isAdmin()) { showToast(getLang()==='en' ? 'Admin only' : 'Tylko admin'); return; }

  const ok = await customConfirmDeleteRoom();
  if(!ok) return;

  const code = currentRoomCode;
  try{
    showToast(getLang()==='en' ? 'Deleting room…' : 'Usuwanie pokoju…');

    // Kolekcje pokoju: players, matches, picks, rounds (archiwum), league, messages.
    await __deleteAllDocsInCollection(playersCol(code));
    await __deleteAllDocsInCollection(matchesCol(code));
    await __deleteAllDocsInCollection(picksCol(code));
    await __deleteAllDocsInCollection(roundsCol(code));
    await __deleteAllDocsInCollection(leagueCol(code));
    await __deleteAllDocsInCollection(boot.collection(db, 'rooms', code, 'messages'));

    // Na końcu dokument pokoju
    await boot.deleteDoc(roomRef(code));

  }catch(e){
    console.error(e);
    showToast(getLang()==='en' ? 'Delete failed' : 'Nie udało się usunąć');
    return;
  }

  // lokalny cleanup + wyjście
  clearSavedRoom();
  cleanupRoomListeners();
  currentRoomCode = null;
  currentRoom = null;
  matchesCache = [];
  picksCache = {};
  picksDocByUid = {};

  showScreen('home');
}

async function endRoundConfirmAndArchive(){
  if(!currentRoomCode) return;
  if(!isAdmin()) { showToast(getLang()==="en" ? "Admin only" : "Tylko admin"); return; }
  if(!matchesCache.length){ showToast(getLang()==="en" ? "No matches" : "Brak meczów"); return; }
  if(!allResultsComplete()){ showToast(getLang()==="en" ? "Enter all results first" : "Najpierw wpisz komplet wyników"); return; }

  const ok = await customConfirmEndRound();
  if(!ok) return;

  await archiveCurrentRound();
}

async function archiveCurrentRound(){
  const code = currentRoomCode;
  const roundNo = currentRoundNo;
  const seasonNo = currentSeasonNo || currentRoom?.currentSeasonNo || 1;
  const roomArchiveCount = Number(currentRoom?.archiveCount || 0);
  const nextArchiveIndex = roomArchiveCount + 1;

  const picksSnap = await boot.getDocs(picksCol(code));
  const picksByUid = {};
  const nickByUid = {};
  picksSnap.forEach(d=>{
    const data = d.data();
    picksByUid[d.id] = data?.picks || {};
    if(data?.nick) nickByUid[d.id] = data.nick;
  });

  const matches = matchesCache.map(m=>({
    id: m.id,
    idx: Number.isInteger(m.idx) ? m.idx : 0,
    home: m.home || "",
    away: m.away || "",
    resultH: m.resultH,
    resultA: m.resultA
  }));

  const pointsMap = {};
  for(const [uid, picksObj] of Object.entries(picksByUid)){
    let complete = true;
    for(const m of matchesCache){
      const p = picksObj?.[m.id];
      if(!p || !Number.isInteger(p.h) || !Number.isInteger(p.a)){ complete = false; break; }
    }
    if(!complete) continue;

    let sum = 0;
    for(const m of matchesCache){
      const p = picksObj[m.id];
      sum += scoreOneMatch(p.h, p.a, m.resultH, m.resultA) ?? 0;
    }
    pointsMap[uid] = sum;
  }

  const playersByUid = {};
  (lastPlayers||[]).forEach(p=>{ playersByUid[p.uid] = p; });

  const roundRanking = Object.entries(pointsMap).map(([uid, pts])=>({
    uid,
    points: Number(pts||0),
    nick: String(nickByUid[uid] || playersByUid[uid]?.nick || "—"),
    avatar: String(playersByUid[uid]?.avatar || "")
  })).sort((a,b)=>{
    if(b.points !== a.points) return b.points - a.points;
    return String(a.nick).localeCompare(String(b.nick), "pl");
  });
  const roundTop3 = roundRanking.slice(0,3);

  const leagueSnap = await boot.getDocs(leagueCol(code));
  const leagueMap = {};
  leagueSnap.forEach(d=>{ leagueMap[d.id] = d.data() || {}; });

  const seasonScoreMap = {};
  const seasonRoundsMap = {};
  const allUids = new Set([...Object.keys(leagueMap), ...Object.keys(pointsMap)]);
  allUids.forEach(uid=>{
    const ld = leagueMap[uid] || {};
    const nick = String((playersByUid[uid]?.nick) || ld.nick || nickByUid[uid] || "—");
    const avatar = String((playersByUid[uid]?.avatar) || ld.avatar || "");
    seasonScoreMap[uid] = {
      uid,
      nick,
      avatar,
      points: Number(ld.seasonPoints || 0) + Number(pointsMap[uid] || 0),
      rounds: Number(ld.seasonRoundsPlayed || 0) + (Object.prototype.hasOwnProperty.call(pointsMap, uid) ? 1 : 0)
    };
  });
  const seasonRanking = Object.values(seasonScoreMap).sort((a,b)=>{
    if(b.points !== a.points) return b.points - a.points;
    return String(a.nick).localeCompare(String(b.nick), "pl");
  });
  const seasonEnd = roundNo >= SEASON_ROUNDS;
  const seasonTop3 = seasonRanking.slice(0,3);

  const b = boot.writeBatch(db);

  const rd = roundDocRef(code, roundNo, seasonNo);
  b.set(rd, {
    roundNo,
    seasonNo,
    seasonRoundNo: roundNo,
    archiveIndex: nextArchiveIndex,
    roomCode: code,
    roomName: currentRoom?.name || "",
    createdAt: boot.serverTimestamp(),
    closedAt: boot.serverTimestamp(),
    closedBy: userUid,
    matchesCount: matches.length,
    matches,
    picksByUid,
    pointsByUid: pointsMap,
    nickByUid
  }, { merge:false });

  const cupByUid = {};
  if(seasonEnd){
    seasonTop3.forEach((x, idx)=>{ cupByUid[x.uid] = idx + 1; });
  }

  allUids.forEach(uid=>{
    const pts = Number(pointsMap[uid] || 0);
    const p = playersByUid[uid] || {};
    const ld = leagueMap[uid] || {};
    const patch = {
      uid,
      nick: String(p.nick || ld.nick || nickByUid[uid] || "—"),
      avatar: String(p.avatar || ld.avatar || ""),
      playerNo: String(p.playerNo || ld.playerNo || ""),
      updatedAt: boot.serverTimestamp()
    };
    if(pts){
      patch.totalPoints = boot.increment(pts);
      patch.roundsPlayed = boot.increment(1);
      if(!seasonEnd){
        patch.seasonPoints = boot.increment(pts);
        patch.seasonRoundsPlayed = boot.increment(1);
      }
    }
    if(seasonEnd){
      patch.seasonPoints = 0;
      patch.seasonRoundsPlayed = 0;
      if(cupByUid[uid] === 1) patch.cupGold = boot.increment(1);
      else if(cupByUid[uid] === 2) patch.cupSilver = boot.increment(1);
      else if(cupByUid[uid] === 3) patch.cupBronze = boot.increment(1);
    }
    b.set(leagueDocRef(code, uid), patch, { merge:true });
  });

  const roundEventRef = boot.doc(eventsCol(code));
  b.set(roundEventRef, {
    type: "round_winners",
    eventOrder: nextArchiveIndex * 10 + 1,
    seasonNo,
    roundNo,
    archiveIndex: nextArchiveIndex,
    winners: roundTop3,
    createdAt: boot.serverTimestamp()
  }, { merge:false });

  if(seasonEnd){
    const seasonEventRef = boot.doc(eventsCol(code));
    b.set(seasonEventRef, {
      type: "season_podium",
      eventOrder: nextArchiveIndex * 10 + 2,
      seasonNo,
      archiveIndex: nextArchiveIndex,
      podium: seasonTop3,
      createdAt: boot.serverTimestamp()
    }, { merge:false });
  }

  b.update(roomRef(code), {
    currentRoundNo: seasonEnd ? 1 : (roundNo + 1),
    currentSeasonNo: seasonEnd ? (seasonNo + 1) : seasonNo,
    archiveCount: nextArchiveIndex,
    updatedAt: boot.serverTimestamp()
  });

  for(const m of matchesCache){
    b.delete(boot.doc(db, "rooms", code, "matches", m.id));
  }
  picksSnap.forEach(d=>{
    b.delete(boot.doc(db, "rooms", code, "picks", d.id));
  });

  await b.commit();
  setTimeout(()=>{ maybeShowPendingEvents(); }, 400);
  showToast(getLang()==="en" ? `ROUND ${roundNo} ended ✅` : `Zakończono KOLEJKĘ ${roundNo} ✅`);
}


// ===== TEST QUEUE =====
async function addTestQueue(){
  if(!currentRoomCode) return;
  if(!isAdmin()){
    showToast(getLang()==="en" ? "Admin only" : "Tylko admin");
    return;
  }

  const sample = [
    ["Jagiellonia","Piast"],
    ["Lechia","Legia"],
    ["Wisla Plock","Radomiak"],
    ["GKS Katowice","Gornik"],
    ["Arka","Cracovia"],
    ["Lech","Pogon"],
    ["Motor","Rakow"],
    ["Korona","Widzew"],
    ["Slask","Zaglebie"],
    ["Stal Mielec","Puszcza"]
  ];

  const b = boot.writeBatch(db);
  sample.forEach((pair, idx)=>{
    const id = `m_${Date.now()}_${idx}`;
    const ref = boot.doc(db, "rooms", currentRoomCode, "matches", id);
    b.set(ref, {
      idx,
      home: pair[0],
      away: pair[1],
      createdAt: boot.serverTimestamp()
    });
  });
  await b.commit();
  showToast(getLang()==="en" ? "Fixture added (test)" : "Dodano kolejkę (test)");
}

// ===== RANDOM QUEUE (btn_random.png) =====
// Podpinamy pod przycisk "Losowe" (btn_random.png) losowe wybieranie pojedynków
// (wcześniej było to automatyczne wybieranie pojedynków).
function __shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    const t = arr[i]; arr[i]=arr[j]; arr[j]=t;
  }
  return arr;
}


async function commitRandomQueueDraft(){
  if(!currentRoomCode) return;
  if(!isAdmin()){
    showToast(getLang()==="en" ? "Admin only" : "Tylko admin");
    return;
  }

  const draft = window.__randomQueueDraft;
  if(!draft || !Array.isArray(draft.matches) || draft.matches.length !== 10){
    showToast(getLang()==="en" ? "No draft matches" : "Brak meczów do zapisania");
    return;
  }

  // If already have matches in active round, don't overwrite
  if(matchesCache && matchesCache.length){
    showToast(getLang()==="en" ? "Matches already exist" : "Mecze już istnieją w tej kolejce");
    return;
  }

  const b = boot.writeBatch(db);
  const now = Date.now();
  for(let i=0;i<draft.matches.length;i++){
    const m = draft.matches[i];
    const id = `m_${now}_${i}`;
    const ref = boot.doc(db, "rooms", currentRoomCode, "matches", id);
    b.set(ref, {
      idx: i,
      home: m.home,
      away: m.away,
      leagueKey: m.leagueKey || "PL",
      createdAt: boot.serverTimestamp()
    });
  }

  // Save typing deadline on room
  b.set(roomRef(currentRoomCode), {
    updatedAt: boot.serverTimestamp(),
    typingDeadlineMs: draft.deadlineMs
  }, { merge:true });

  await b.commit();

  try{ delete window.__randomQueueDraft; }catch{}
  showToast(getLang()==="en" ? "Random queue saved ✅" : "Zapisano losową kolejkę ✅");
  try{ syncActionButtons(); }catch{}
}

async function addRandomQueue(){
  if(!currentRoomCode) return;
  if(!isAdmin()){
    showToast(getLang()==="en" ? "Admin only" : "Tylko admin");
    return;
  }

  // If already have matches in active round, do not add another set
  if(matchesCache && matchesCache.length){
    showToast(getLang()==="en" ? "Matches already exist" : "Mecze już istnieją w tej kolejce");
    return;
  }

  // Pool 20 teams -> 10 random pairs
  const teams = [
    "Jagiellonia","Piast","Lechia","Legia","Wisla Plock","Radomiak","GKS Katowice","Gornik",
    "Arka","Cracovia","Lech","Pogon","Motor","Rakow","Korona","Widzew",
    "Slask","Zaglebie","Stal Mielec","Puszcza"
  ];

  __shuffle(teams);

  const draftMatches = [];
  for(let i=0;i<10;i++){
    const a = teams[i*2];
    const b = teams[i*2+1];
    const homeFirst = Math.random() < 0.5;
    draftMatches.push({
      idx: i,
      home: homeFirst ? a : b,
      away: homeFirst ? b : a,
      leagueKey: "PL"
    });
  }

  // Store draft and show matches first (deadline on save)
  window.__randomQueueDraft = { matches: draftMatches, deadlineMs: null };
  // 7035: najpierw pokaż mecze, deadline dopiero przy zapisie
  openRandomQueuePreview();
  showToast(getLang()==="en" ? "Random matches generated" : "Wylosowano mecze");
}


// ===== LEAGUE (prawdziwa) =====
const leagueState = {
  roomCode: null,
  roomName: null,
  afterRound: 0,
  rows: [],
  finishedRounds: [],
  roundCache: new Map(),
  viewMode: "TOTAL", // TOTAL | ROUND
  selectedRound: "ALL" // ALL or roundNo string
};

async function loadLeagueFinishedRounds(code){
  leagueState.finishedRounds = [];
  leagueState.roundCache = new Map();
  try{
    let qs = await boot.getDocs(boot.query(roundsCol(code), boot.orderBy("archiveIndex","asc")));
    if(qs.empty){
      qs = await boot.getDocs(boot.query(roundsCol(code), boot.orderBy("roundNo","asc")));
    }
    const list = [];
    qs.forEach(d=>{
      const rd = d.data() || {};
      const rn = Number(rd.seasonRoundNo || rd.roundNo || 0);
      const sn = Number(rd.seasonNo || 1);
      const ai = Number(rd.archiveIndex || 0);
      if(rn>0){
        const entry = { id: d.id, seasonNo: sn, roundNo: rn, archiveIndex: ai };
        list.push(entry);
        leagueState.roundCache.set(d.id, { ...rd, _id: d.id });
      }
    });
    leagueState.finishedRounds = list;
  }catch(e){
    console.warn("loadLeagueFinishedRounds failed", e);
  }
}

function updateLeagueHintForMode(){
  const hint = el("leagueHint");
  if(!hint) return;
  if(leagueState.viewMode === "ROUND" && leagueState.selectedRound !== "ALL"){
    const rd = leagueState.roundCache.get(leagueState.selectedRound) || {};
    const rn = Number(rd.seasonRoundNo || rd.roundNo || 0);
    const sn = Number(rd.seasonNo || 1);
    hint.textContent = (getLang()==="en")
      ? `Round preview: choose a player to open picks preview for round ${rn} (Season ${sn}).`
      : `Podgląd kolejki: kliknij gracza, aby zobaczyć podgląd typów dla kolejki ${rn} (Sezon ${sn}).`;
  }else{
    hint.textContent = (getLang()==="en")
      ? "Click a player to see stats (rounds + picks preview)."
      : "Kliknij gracza, aby zobaczyć statystyki (kolejki + podgląd typów).";
  }
}

function buildLeagueRoundDropdown(){
  const sel = el("leagueAfterRound");
  if(!sel) return;
  sel.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "ALL";
  optAll.textContent = (getLang()==="en")
    ? `Total (after ${leagueState.afterRound})`
    : `Suma (po ${leagueState.afterRound})`;
  sel.appendChild(optAll);

  for(const rd of leagueState.finishedRounds){
    const o = document.createElement("option");
    o.value = String(rd.id);
    o.textContent = (getLang()==="en") ? `Round ${rd.roundNo} • Season ${rd.seasonNo}` : `Kolejka ${rd.roundNo} • Sezon ${rd.seasonNo}`;
    sel.appendChild(o);
  }

  leagueState.selectedRound = "ALL";
  leagueState.viewMode = "TOTAL";
  sel.value = "ALL";

  sel.onchange = async ()=>{
    const v = String(sel.value || "ALL");
    leagueState.selectedRound = v;
    if(v === "ALL"){
      leagueState.viewMode = "TOTAL";
      renderLeagueTable();
      updateLeagueHintForMode();
      return;
    }
    if(!leagueState.roundCache.get(v)){
      leagueState.viewMode = "TOTAL";
      leagueState.selectedRound = "ALL";
      sel.value = "ALL";
      renderLeagueTable();
      updateLeagueHintForMode();
      return;
    }
    leagueState.viewMode = "ROUND";
    await setLeagueTableForRound(v);
    updateLeagueHintForMode();
  };
}

async function setLeagueTableForRound(roundKey){
  if(!leagueState.roomCode) return;
  let rd = leagueState.roundCache.get(roundKey);
  if(!rd){
    try{
      const snap = await boot.getDoc(boot.doc(db, "rooms", leagueState.roomCode, "rounds", String(roundKey)));
      if(snap.exists()){
        rd = { ...snap.data(), _id: snap.id };
        leagueState.roundCache.set(roundKey, rd);
      }
    }catch(e){
      console.warn("setLeagueTableForRound getDoc failed", e);
    }
  }
  const ptsMap = rd?.pointsByUid || {};
  const nickMap = rd?.nickByUid || {};

  const baseUids = new Set();
  (leagueState.rows||[]).forEach(r=> baseUids.add(r.uid));
  Object.keys(ptsMap||{}).forEach(uid=> baseUids.add(uid));

  const display = [];
  baseUids.forEach(uid=>{
    const pts = ptsMap?.[uid];
    const played = (pts !== undefined && pts !== null);
    const base = (leagueState.rows||[]).find(x=> x.uid===uid);
    display.push({
      uid,
      nick: String(nickMap?.[uid] || base?.nick || "—"),
      playerNo: String(base?.playerNo || ""),
      rounds: played ? 1 : 0,
      points: played ? Number(pts) : 0,
      _played: played,
      _roundKey: roundKey
    });
  });

  display.sort((a,b)=>{
    if(b.points!==a.points) return b.points-a.points;
    return String(a.nick).localeCompare(String(b.nick), "pl");
  });

  leagueState._displayRows = display;
  renderLeagueTable();
}

async function openLeagueTable(roomCode, opts={}) {
  const { silent=false } = opts;
  roomCode = (roomCode||"").trim().toUpperCase();
  if(roomCode.length !== 6){
    showToast(getLang()==="en" ? "No room" : "Brak pokoju");
    return;
  }

  try{
    const snap = await boot.getDoc(roomRef(roomCode));
    if(!snap.exists()){
      showToast(getLang()==="en" ? "Room not found" : "Pokój nie istnieje");
      return;
    }
    const room = snap.data();
    leagueState.roomCode = roomCode;
    leagueState.roomName = room?.name || "—";
    leagueState.afterRound = Number(room?.archiveCount || 0);

    el("leagueRoomName").textContent = leagueState.roomName;
    await loadLeagueFinishedRounds(roomCode);
    buildLeagueRoundDropdown();
    updateLeagueHintForMode();

    // Player numbers (admin only display): build uid -> playerNo map from current room players
    const pnMap = {};
    try{
      const pqs = await boot.getDocs(playersCol(roomCode));
      pqs.forEach(pd=>{
        const d = pd.data() || {};
        const uid = d.uid || pd.id;
        const pn = String(d.playerNo || "").trim().toUpperCase();
        if(uid && pn) pnMap[uid] = pn;
      });
    }catch(e){
      // ignore (player numbers are optional)
    }

    const q = boot.query(leagueCol(roomCode), boot.orderBy("totalPoints","desc"));
    const qs = await boot.getDocs(q);

    const arr = [];
    qs.forEach(d=>{
      const x = d.data();
      const playerNo = pnMap[x.uid || d.id] || "";
      if(!String(playerNo).trim()) return;
      arr.push({
        uid: x.uid || d.id,
        nick: x.nick || "—",
        playerNo,
        rounds: Number.isInteger(x.roundsPlayed) ? x.roundsPlayed : (x.roundsPlayed ?? 0),
        points: Number.isInteger(x.totalPoints) ? x.totalPoints : (x.totalPoints ?? 0),
        cupGold: Number(x.cupGold || 0),
        cupSilver: Number(x.cupSilver || 0),
        cupBronze: Number(x.cupBronze || 0),
        avatar: String(x.avatar || "")
      });
    });

    leagueState.rows = arr;
    // start as TOTAL
    leagueState.viewMode = "TOTAL";
    leagueState.selectedRound = "ALL";
    leagueState._displayRows = null;
    renderLeagueTable();
    showScreen("league");
    if(!silent) showToast(getLang()==="en" ? "League table" : "Tabela ligi");
  }catch(e){
    console.error(e);
    showToast(getLang()==="en" ? "Cannot open league table" : "Nie udało się otworzyć tabeli");
  }
}

// Wrapper for the dedicated "all‑time" button.
// Currently it shows the same totals table, but with a different header.
async function openAllTimeRanking(roomCode){
  await openLeagueTable(roomCode, {silent:true});
  const header = el("t_league");
  if(header) header.textContent = (getLang()==="en") ? "All‑time ranking" : "Ranking wszechczasów";
  showToast(getLang()==="en" ? "All‑time ranking" : "Ranking wszechczasów");
}

function renderLeagueTable(){
  const body = el("leagueBody");
  if(!body) return;
  body.innerHTML = "";

  const source = (leagueState.viewMode === "ROUND" && leagueState.selectedRound !== "ALL" && Array.isArray(leagueState._displayRows))
    ? leagueState._displayRows
    : leagueState.rows;

  const rows = [...(source||[])];
  rows.sort((a,b)=>{
    if(b.points !== a.points) return b.points - a.points;
    return String(a.nick).localeCompare(String(b.nick), "pl");
  });

  if(!rows.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" style="color:rgba(255,255,255,.75)">${getLang()==="en" ? "No data…" : "Brak danych…"}</td>`;
    body.appendChild(tr);
    return;
  }

  rows.forEach((r, idx)=>{
    const cupSrc = (idx===0) ? "ui/medale/puchar_1.png" : (idx===1) ? "ui/medale/puchar_2.png" : (idx===2) ? "ui/medale/puchar_3.png" : "";
    const cupHtml = cupSrc ? `<img alt="cup" src="${cupSrc}" style="width:22px;height:22px;vertical-align:middle;margin-right:6px"/>` : "";
    const pn = (isAdmin() && r.playerNo) ? ` <span style="opacity:.75;font-weight:800">[${escapeHtml(String(r.playerNo))}]</span>` : "";
    const tr = document.createElement("tr");
    tr.className = "linkRow";
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${cupHtml}${escapeHtml(r.nick)}${pn}${(r.uid===userUid) ? (getLang()==="en" ? " (YOU)" : " (TY)") : ""}</td>
      <td>${r.rounds}</td>
      <td>${r.points}</td>
    `;
    if(leagueState.viewMode === "ROUND" && leagueState.selectedRound !== "ALL"){
      tr.onclick = ()=> openArchivedPicksPreview(leagueState.roomCode, String(r._roundKey || leagueState.selectedRound), r.uid, r.nick);
    }else{
      tr.onclick = ()=> openPlayerStatsFromLeague(r.uid, r.nick);
    }
    body.appendChild(tr);
  });
}

// ===== STATYSTYKI GRACZA (MODAL) =====
async function openPlayerStatsFromLeague(uid, nick){
  if(!leagueState.roomCode) return;

  const code = leagueState.roomCode;

  let qs = await boot.getDocs(boot.query(roundsCol(code), boot.orderBy("archiveIndex","desc")));
  if(qs.empty){
    qs = await boot.getDocs(boot.query(roundsCol(code), boot.orderBy("roundNo","desc")));
  }
  const leagueSelf = (leagueState.rows||[]).find(x=> x.uid===uid) || {};

  const wrap = document.createElement("div");
  wrap.style.display="flex";
  wrap.style.flexDirection="column";
  // ciaśniej, aby weszło więcej kolejek bez scrolla
  wrap.style.gap="4px";

  const head = document.createElement("div");
  head.className="row";
  head.style.flexWrap="wrap";
  head.appendChild(chip(`${t("room")}: ${leagueState.roomName}`));
  head.appendChild(chip((getLang()==="en") ? `Player: ${nick}` : `Gracz: ${nick}`));
  wrap.appendChild(head);

  if(qs.empty){
    const info = document.createElement("div");
    info.className="sub";
    info.textContent = (getLang()==="en")
      ? "No finished rounds in history."
      : "Brak zakończonych kolejek w historii.";
    wrap.appendChild(info);
    modalOpen((getLang()==="en") ? "Player stats" : "Statystyki gracza", wrap);
    return;
  }

  // === Medale za kolejki (TOP3 w zakończonych kolejkach) ===
  const medalCounts = {1:0,2:0,3:0};
  const medalRounds = {1:[],2:[],3:[]};

  const roundDocs = [];
  qs.forEach(d=> roundDocs.push({ _id: d.id, ...(d.data()||{}) }));

  for(const rd of roundDocs){
    const rn = rd?.seasonRoundNo ?? rd?.roundNo ?? 0;
    const ptsMap = rd?.pointsByUid || {};
    const nickMap = rd?.nickByUid || {};
    const entries = Object.entries(ptsMap)
      .filter(([,v])=> Number.isFinite(v))
      .map(([k,v])=>({uid:k, pts:Number(v), nick: String(nickMap[k]||"") }));
    if(entries.length<1) continue;
    entries.sort((a,b)=>{
      if(b.pts!==a.pts) return b.pts-a.pts;
      return String(a.nick||a.uid).localeCompare(String(b.nick||b.uid), "pl");
    });
    const pos = entries.findIndex(x=> x.uid===uid);
    if(pos>=0 && pos<3){
      const m = pos+1;
      medalCounts[m] += 1;
      medalRounds[m].push(rd._id || `${rd.seasonNo||1}_${rn}`);
    }
  }

  const awards = document.createElement("div");
  awards.className = "row statsAwardsRow";
  awards.style.flexWrap = "wrap";
  awards.style.gap = "6px";

  const mkAward = (src, label)=>{
    const d = document.createElement("div");
    d.className = "chip statsChip";
    d.style.display = "inline-flex";
    d.style.alignItems = "center";
    d.style.gap = "6px";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "award";
    img.style.width = "22px";
    img.style.height = "22px";
    d.appendChild(img);
    const sp = document.createElement("span");
    sp.textContent = label;
    d.appendChild(sp);
    return d;
  };

  if(leagueSelf.cupGold) awards.appendChild(mkAward("ui/medale/puchar_1.png", `x${leagueSelf.cupGold}`));
  if(leagueSelf.cupSilver) awards.appendChild(mkAward("ui/medale/puchar_2.png", `x${leagueSelf.cupSilver}`));
  if(leagueSelf.cupBronze) awards.appendChild(mkAward("ui/medale/puchar_3.png", `x${leagueSelf.cupBronze}`));

  if(medalCounts[1]||medalCounts[2]||medalCounts[3]){
    if(medalCounts[1]) awards.appendChild(mkAward("ui/medale/medal_1.png", `x${medalCounts[1]}`));
    if(medalCounts[2]) awards.appendChild(mkAward("ui/medale/medal_2.png", `x${medalCounts[2]}`));
    if(medalCounts[3]) awards.appendChild(mkAward("ui/medale/medal_3.png", `x${medalCounts[3]}`));
  }

  if(awards.childNodes.length){
    wrap.appendChild(awards);
  }

  roundDocs.forEach(rd=>{
    const rn = rd.seasonRoundNo ?? rd.roundNo ?? 0;
    const pts = rd?.pointsByUid?.[uid];
    const played = (pts !== undefined && pts !== null);

    // Medal for this round (if any)
    let medalSrc = "";
    const rdKey = rd._id || `${rd.seasonNo||1}_${rn}`;
    if(medalRounds[1].includes(rdKey)) medalSrc = "ui/medale/medal_1.png";
    else if(medalRounds[2].includes(rdKey)) medalSrc = "ui/medale/medal_2.png";
    else if(medalRounds[3].includes(rdKey)) medalSrc = "ui/medale/medal_3.png";

    const row = document.createElement("div");
    row.className="matchCard statsRoundCard";
    row.style.justifyContent="space-between";

    const left = document.createElement("div");
    left.style.display="flex";
    left.style.flexDirection="column";
    left.style.gap="0px";
    // W Statystykach gracza nie pokazujemy linii statusu (Zagrana / Brak typów / niepełne),
    // aby wiersze były niższe i mieściło się więcej kolejek.
    const sn = rd?.seasonNo || 1;
    left.innerHTML = `<div style="font-weight:1000">${medalSrc ? `<img alt="medal" src="${medalSrc}" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"/>` : ""}${t("round")} ${rn} • ${(getLang()==="en") ? `Season ${sn}` : `Sezon ${sn}`}</div>`;

    const right = document.createElement("div");
    right.className="row statsRightRow";

    const ptsChip = document.createElement("div");
    ptsChip.className="chip statsChip statsPointsChip";
    const ptsVal = played ? pts : "—";
    ptsChip.innerHTML = (getLang()==="en")
      ? `<span class="statsPtsLabel">Pts</span><span class="statsPtsVal">${ptsVal}</span>`
      : `<span class="statsPtsLabel">Pkt</span><span class="statsPtsVal">${ptsVal}</span>`;

    const btn = document.createElement("button");
    btn.className="btn btnSmall";
    btn.textContent = (getLang()==="en") ? "Preview" : "Podgląd";
    btn.disabled = !played;
    btn.onclick = async ()=>{
      await openArchivedPicksPreview(code, rd._id || rn, uid, nick);
    };

    right.appendChild(ptsChip);
    right.appendChild(btn);

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });

  modalOpen((getLang()==="en") ? "Player stats" : "Statystyki gracza", wrap);
}

async function openArchivedPicksPreview(code, roundKey, uid, nick){
  let rd = null;
  let data = null;
  if(String(roundKey||"").startsWith("season_")){
    rd = await boot.getDoc(boot.doc(db, "rooms", code, "rounds", String(roundKey)));
  }else{
    rd = await boot.getDoc(roundDocRef(code, roundKey));
  }
  if(!rd.exists()){ showToast(getLang()==="en" ? "Round archive missing" : "Brak archiwum tej kolejki"); return; }
  data = rd.data();

  const matches = data.matches || [];
  const picksByUid = data.picksByUid || {};
  const picksObj = picksByUid[uid] || null;

  const wrap = document.createElement("div");
  wrap.style.display="flex";
  wrap.style.flexDirection="column";
  wrap.style.gap="6px";

  const top = document.createElement("div");
  top.className="row";
  top.style.flexWrap="wrap";
  top.appendChild(chip((getLang()==="en") ? `Player: ${nick}` : `Gracz: ${nick}`));
  const labelRound = Number(data?.seasonRoundNo || data?.roundNo || 0);
  const labelSeason = Number(data?.seasonNo || 1);
  top.appendChild(chip(`${t("round")} ${labelRound} • ${(getLang()==="en") ? `Season ${labelSeason}` : `Sezon ${labelSeason}`}`));
  const pts = data?.pointsByUid?.[uid];
  top.appendChild(chip((getLang()==="en") ? `POINTS: ${pts ?? "—"}` : `PUNKTY: ${pts ?? "—"}`));
  wrap.appendChild(top);

  if(!picksObj){
    const info = document.createElement("div");
    info.className="sub";
    info.textContent = (getLang()==="en")
      ? "No saved picks in this round."
      : "Brak zapisanych typów w tej kolejce.";
    wrap.appendChild(info);
    modalOpen((getLang()==="en") ? "Archive preview" : "Podgląd (archiwum)", wrap);
    return;
  }

  for(const m of matches){
    const row = document.createElement("div");
    row.className="matchCard";

    const leftTeam = document.createElement("div");
    leftTeam.className="team";
    leftTeam.appendChild(createLogoImg(m.home));
    const ln = document.createElement("div");
    ln.className="teamName";
    ln.textContent = m.home;
    leftTeam.appendChild(ln);

    const score = document.createElement("div");
    score.className="scoreBox";

    const p = picksObj[m.id];
    const pickPill = document.createElement("div");
    pickPill.className="resultPill";
    pickPill.textContent = p
      ? ((getLang()==="en") ? `Pick: ${p.h}:${p.a}` : `Typ: ${p.h}:${p.a}`)
      : ((getLang()==="en") ? "Pick: —" : "Typ: —");
    score.appendChild(pickPill);

    const resOk = Number.isInteger(m.resultH) && Number.isInteger(m.resultA) && p;
    const dot = document.createElement("span");
    dot.className = "dot " + (resOk ? dotClassFor(p.h,p.a,m.resultH,m.resultA) : "gray");

    const isCancelled = (m.cancelled === true) || (m.canceled === true) || (m.odwolany === true) || (String(m.status||'').toUpperCase() === 'CANCELLED');

    const resPill = document.createElement("div");
    resPill.className="resultPill";
    // Jeśli mecz był odwołany, nie pokazuj "Wynik: null:null" tylko "Odwołany".
    if(isCancelled && (m.resultH==null) && (m.resultA==null)){
      resPill.textContent = (getLang()==="en") ? 'Cancelled' : 'Odwołany';
    }else if((m.resultH==null) || (m.resultA==null)){
      resPill.textContent = (getLang()==="en") ? 'Result: —' : 'Wynik: —';
    }else{
      resPill.textContent = (getLang()==="en") ? `Result: ${m.resultH}:${m.resultA}` : `Wynik: ${m.resultH}:${m.resultA}`;
    }

    const ptsOne = resOk ? scoreOneMatch(p.h,p.a,m.resultH,m.resultA) : null;
    const ptsPill = document.createElement("div");
    ptsPill.className="resultPill";
    ptsPill.textContent = (ptsOne===null)
      ? ((getLang()==="en") ? "pts: —" : "pkt: —")
      : ((getLang()==="en") ? `pts: ${ptsOne}` : `pkt: ${ptsOne}`);

    score.appendChild(dot);
    score.appendChild(resPill);
    score.appendChild(ptsPill);

    const rightTeam = document.createElement("div");
    rightTeam.className="team";
    rightTeam.style.justifyContent="flex-end";
    const rn = document.createElement("div");
    rn.className="teamName";
    rn.style.textAlign="right";
    rn.textContent = m.away;
    rightTeam.appendChild(rn);
    rightTeam.appendChild(createLogoImg(m.away));

    row.appendChild(leftTeam);
    row.appendChild(score);
    row.appendChild(rightTeam);
    wrap.appendChild(row);
  }

  modalOpen((getLang()==="en") ? "Archive preview" : "Podgląd (archiwum)", wrap);
}

function chip(text){
  const d = document.createElement("div");
  d.className="chip";
  d.textContent = text;
  return d;
}

function escapeHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ===== ORIENTATION (phones: landscape-first) =====
function updateLandscapeLock(){
  const overlay = el("rotateOverlay");
  if(overlay) overlay.style.display = "none";
  document.body.classList.remove("lockedPortrait");
}

window.addEventListener("resize", ()=>{ try{ updateLandscapeLock(); }catch(e){} }, {passive:true});
window.addEventListener("orientationchange", ()=>{ setTimeout(()=>{ try{ updateLandscapeLock(); }catch(e){} }, 60); });

// ===== START =====
(async()=>{
  try{
    setBg(BG_HOME);
    setFooter(`ZGADNIJ v${BUILD}`);
    setSplash(`ZGADNIJ v${BUILD}\nŁadowanie Firebase…`);

    await initFirebase();
    bindUI();
    ensurePlayersPanelFillFix();

    if(getNick()) refreshNickLabels();

    // zastosuj język od razu
    applyLangToUI();

    // wymagane logowanie PIN przed wejściem — zawsze pokazuj okno logowania na starcie
    const okLogin = await ensurePinLogin(true);
    if(!okLogin) return;

    showScreen("home");
    showCenterLoading();
    await new Promise(r=>setTimeout(r, 2000));
    openJoinRoomModal();
    hideCenterLoading();
  }catch(e){
    console.error(e);
    setSplash("BŁĄD:\n" + (e?.message || String(e)));
    throw e;
  }
})();

// Backward-compat helper (some cached HTML may call closeModal)
window.closeModal = function(){
  try{ document.querySelectorAll('.modal.active').forEach(m=>m.classList.remove('active')); }catch(e){}
};

try{applyZgadnijStartButtonByLang();}catch(e){}
