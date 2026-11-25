import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Public client configuration — the publishable key is safe to expose in a browser.
const SUPABASE_URL = "https://klcvmaxehmezozckumuq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Q5bzdadRMxc9loQqOx0RBQ_eN_5P-J9";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CHOICES = ["new_homepage", "keep_current", "optional_toggle"];
const LABELS = {
  new_homepage: "Ship the new homepage",
  keep_current: "Keep the current homepage",
  optional_toggle: "Add it, but make it optional",
};

const VOTER_ID_KEY = "nx_homepage_voter_id";
const VOTE_KEY = "nx_homepage_vote";

const optionButtons = Array.from(document.querySelectorAll(".option[data-choice]"));
const statusEl = document.getElementById("voteStatus");
const toastEl = document.getElementById("toast");
const heroTotalEl = document.getElementById("heroTotal");
const totalVotesEl = document.getElementById("totalVotes");
const resultsNoteEl = document.getElementById("resultsNote");

let currentVote = readStoredVote();
let busy = false;
let toastTimer = null;

function readStoredVote() {
  try {
    const stored = localStorage.getItem(VOTE_KEY);
    return CHOICES.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

function getVoterId() {
  try {
    let id = localStorage.getItem(VOTER_ID_KEY);
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return id;
    }
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_ID_KEY, id);
    return id;
  } catch {
    // Storage can be blocked; the vote still works for this page view.
    return crypto.randomUUID();
  }
}

function normalizeCounts(raw) {
  const counts = { new_homepage: 0, keep_current: 0, optional_toggle: 0, total: 0 };
  if (raw && typeof raw === "object") {
    for (const choice of CHOICES) {
      const value = Number(raw[choice]);
      counts[choice] = Number.isFinite(value) ? value : 0;
    }
    const total = Number(raw.total);
    counts.total = Number.isFinite(total)
      ? total
      : CHOICES.reduce((sum, choice) => sum + counts[choice], 0);
  }
  return counts;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function renderCounts(raw) {
  const counts = normalizeCounts(raw);
  const total = counts.total;
  heroTotalEl.textContent = formatNumber(total);
  totalVotesEl.textContent = formatNumber(total);

  for (const choice of CHOICES) {
    const row = document.querySelector(`.result[data-result="${choice}"]`);
    if (!row) continue;
    const count = counts[choice];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    row.querySelector("[data-count]").textContent = formatNumber(count);
    row.querySelector("[data-pct]").textContent = `${pct}%`;
    row.querySelector("[data-bar]").style.width = `${total > 0 ? pct : 0}%`;
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function paintSelection() {
  for (const button of optionButtons) {
    const selected = button.dataset.choice === currentVote;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", String(selected));
    const action = button.querySelector(".option-action");
    const letter = button.dataset.letter;
    action.innerHTML = selected
      ? `Your pick <span aria-hidden="true">✓</span>`
      : `Vote for ${letter} <span aria-hidden="true">→</span>`;
  }

  if (currentVote) {
    setStatus(`Your vote: ${LABELS[currentVote]}. Click another option to change it.`);
  } else {
    setStatus("Pick one option. You can change your vote later.");
  }
}

function setBusy(value) {
  busy = value;
  for (const button of optionButtons) {
    button.disabled = value;
  }
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
}

async function loadResults() {
  try {
    const { data, error } = await supabase.rpc("get_homepage_vote_counts");
    if (error) throw error;
    renderCounts(data);
    resultsNoteEl.textContent = "votes so far";
  } catch (error) {
    console.error("Could not load results:", error);
    resultsNoteEl.textContent = "results unavailable — refresh to retry";
  }
}

async function castVote(choice) {
  if (busy || !CHOICES.includes(choice)) return;

  setBusy(true);
  setStatus("Saving your vote…");

  try {
    const { data, error } = await supabase.rpc("cast_homepage_vote", {
      p_voter_id: getVoterId(),
      p_choice: choice,
    });
    if (error) throw error;

    currentVote = choice;
    try {
      localStorage.setItem(VOTE_KEY, choice);
    } catch {
      // Ignore storage failures — the vote is already recorded.
    }

    paintSelection();
    renderCounts(data);
    setStatus(`Vote saved — ${LABELS[choice]}. You can change it any time.`);
    showToast("Vote saved");
  } catch (error) {
    console.error("Could not save vote:", error);
    setStatus("Couldn't save your vote. Check your connection and try again.", true);
    showToast("Vote failed — try again");
  } finally {
    setBusy(false);
  }
}

for (const button of optionButtons) {
  button.addEventListener("click", () => castVote(button.dataset.choice));
}

paintSelection();
loadResults();

window.setInterval(() => {
  if (document.visibilityState === "visible" && !busy) loadResults();
}, 30000);
