// ── Unc definitions ──
const UNCS = {
  rick:   { name: 'Uncle Rick',   emoji: '\u{1F474}', slug: 'rick',   ethnicity: 'White',    color: '#ff6b6b', bio: 'Grillmaster supreme. Cargo shorts 365. Has a take on everything and will share it whether you asked or not. Thinks he could fix any country if they just "used common sense." Calls everyone "buddy" or "chief."' },
  jerome: { name: 'Uncle Jerome', emoji: '\u{1F474}\u{1F3FF}', slug: 'jerome', ethnicity: 'Black',    color: '#ffd93d', bio: 'Barbershop philosopher. Has a story for every situation and it always starts with "see what had happened was..." Calls everyone "youngblood." Been there, done that, got the du-rag to prove it.' },
  wei:    { name: 'Uncle Wei',    emoji: '\u{1F474}\u{1F3FB}', slug: 'wei',    ethnicity: 'Chinese',  color: '#6bcfff', bio: 'Brutally practical. Everything is compared to how they do it back home and it\'s always better. Disappointed in your life choices but still feeds you. "You know what your problem is?"' },
  sione:  { name: 'Uncle Sione',  emoji: '\u{1F474}\u{1F3FE}', slug: 'sione',  ethnicity: 'Islander', color: '#66ff99', bio: 'Big heart, bigger laugh. Every conversation eventually comes back to food or family — usually both. Calls everyone "bro" or "cuz." Will fight for you and then make you a plate.' },
  raj:    { name: 'Uncle Raj',    emoji: '\u{1F474}\u{1F3FD}', slug: 'raj',    ethnicity: 'Indian',   color: '#ff9f43', bio: 'Engineer brain that can\'t turn off. Makes oddly specific analogies nobody asked for. "Let me tell you one thing" is his catchphrase. Somehow relates everything back to cricket or his college days.' },
};

const UNC_ORDER = ['rick', 'jerome', 'wei', 'sione', 'raj'];

// ── Supabase init ──
let supabase = null;
let realtimeChannel = null;
let messageCount = 0;

async function initSupabase() {
  try {
    const resp = await fetch('/api/config');
    const { supabaseUrl, supabaseAnonKey } = await resp.json();
    if (!supabaseUrl || !supabaseAnonKey) return false;
    // UMD bundle exposes window.supabase which has createClient
    const sb = window.supabase;
    const createClient = sb.createClient || (sb.default && sb.default.createClient);
    if (!createClient) throw new Error('Supabase library not loaded');
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    return true;
  } catch (e) {
    console.error('Supabase init failed:', e);
    return false;
  }
}

// ── Tab navigation ──
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = link.dataset.tab;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    link.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'archive') loadArchive();
    if (tab === 'profiles') loadProfiles();
  });
});

// ── Render a message DOM element ──
function createMessageEl(msg) {
  const unc = UNCS[msg.entity_slug] || UNCS.rick;
  const div = document.createElement('div');
  div.className = 'message';
  div.dataset.unc = unc.slug;

  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = new Date(msg.created_at).toLocaleDateString();

  div.innerHTML = `
    <div class="message-header">
      <span class="message-avatar">${unc.emoji}</span>
      <span class="message-name" data-unc="${unc.slug}">${unc.name}</span>
      <span class="message-time">${date} ${time}</span>
    </div>
    <div class="message-body">${escapeHtml(msg.content)}</div>
  `;
  return div;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Live Feed ──
async function loadLiveFeed() {
  const feedEl = document.getElementById('feed-messages');

  if (!supabase) {
    feedEl.innerHTML = `
      <div class="connection-error">
        <h3>\u26A0 CONNECTION ERROR \u26A0</h3>
        <p>Unable to connect to conversation database.</p>
        <p>Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.</p>
      </div>`;
    return;
  }

  feedEl.innerHTML = '<div class="loading-text">Loading conversation stream...</div>';

  // Get current active conversation
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!conv) {
    feedEl.innerHTML = '<div class="loading-text">Waiting for conversation to start...</div>';
    subscribeToNewConversations(feedEl);
    return;
  }

  // Load recent messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true })
    .limit(100);

  feedEl.innerHTML = '';
  if (messages) {
    messages.forEach(msg => {
      feedEl.appendChild(createMessageEl(msg));
    });
    messageCount = messages.length;
    document.getElementById('msg-count').textContent = messageCount;
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  // Subscribe to new messages in real-time
  subscribeToMessages(conv.id, feedEl);
}

function subscribeToMessages(convId, feedEl) {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel('live-messages')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
      (payload) => {
        const msg = payload.new;
        feedEl.appendChild(createMessageEl(msg));
        messageCount++;
        document.getElementById('msg-count').textContent = messageCount;
        feedEl.scrollTop = feedEl.scrollHeight;
      }
    )
    .subscribe();
}

function subscribeToNewConversations(feedEl) {
  const ch = supabase
    .channel('new-conversations')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversations' },
      (payload) => {
        const conv = payload.new;
        if (conv.status === 'active') {
          feedEl.innerHTML = '';
          supabase.removeChannel(ch);
          subscribeToMessages(conv.id, feedEl);
        }
      }
    )
    .subscribe();
}

// ── Archive ──
async function loadArchive() {
  const listEl = document.getElementById('archive-list');
  const viewEl = document.getElementById('archive-view');
  viewEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  if (!supabase) {
    listEl.innerHTML = '<div class="loading-text">Database not connected.</div>';
    return;
  }

  listEl.innerHTML = '<div class="loading-text">Loading archives...</div>';

  const { data: convos } = await supabase
    .from('conversations')
    .select('id, title, created_at, status')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!convos || convos.length === 0) {
    listEl.innerHTML = '<div class="loading-text">No archived conversations yet.</div>';
    return;
  }

  listEl.innerHTML = '';
  convos.forEach(conv => {
    const item = document.createElement('div');
    item.className = 'archive-item';
    const date = new Date(conv.created_at).toLocaleDateString();
    const statusLabel = conv.status === 'active' ? ' [LIVE]' : '';
    item.innerHTML = `
      <span class="archive-item-title">${escapeHtml(conv.title || 'Untitled Conversation')}${statusLabel}</span>
      <span class="archive-item-meta">${date}</span>
    `;
    item.addEventListener('click', () => viewConversation(conv));
    listEl.appendChild(item);
  });
}

async function viewConversation(conv) {
  const listEl = document.getElementById('archive-list');
  const viewEl = document.getElementById('archive-view');
  const msgsEl = document.getElementById('archive-messages');
  const titleEl = document.getElementById('archive-title');

  listEl.classList.add('hidden');
  viewEl.classList.remove('hidden');
  titleEl.textContent = conv.title || 'Untitled Conversation';
  msgsEl.innerHTML = '<div class="loading-text">Loading messages...</div>';

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true });

  msgsEl.innerHTML = '';
  if (messages) {
    messages.forEach(msg => msgsEl.appendChild(createMessageEl(msg)));
  }
}

document.getElementById('archive-back').addEventListener('click', () => {
  document.getElementById('archive-list').classList.remove('hidden');
  document.getElementById('archive-view').classList.add('hidden');
});

// ── Profiles ──
function loadProfiles() {
  const grid = document.getElementById('profiles-grid');
  grid.innerHTML = '';

  UNC_ORDER.forEach(slug => {
    const unc = UNCS[slug];
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.dataset.unc = slug;
    card.innerHTML = `
      <div class="profile-card-header">
        <span class="profile-avatar">${unc.emoji}</span>
        <div>
          <div class="profile-name">${unc.name}</div>
          <div class="profile-ethnicity">${unc.ethnicity}</div>
        </div>
      </div>
      <div class="profile-bio">${unc.bio}</div>
      <div class="profile-stats">Status: <span>Trapped in the Backrooms</span></div>
    `;
    grid.appendChild(card);
  });
}

// ── Unc avatars in header ──
function renderAvatars() {
  const container = document.getElementById('unc-avatars');
  UNC_ORDER.forEach(slug => {
    const unc = UNCS[slug];
    const div = document.createElement('div');
    div.className = 'unc-avatar-small';
    div.textContent = unc.emoji;
    div.title = unc.name;
    container.appendChild(div);
  });
}

// ── Presence (user count) ──
async function trackPresence() {
  if (!supabase) {
    document.getElementById('user-count').textContent = '...';
    return;
  }

  const presenceChannel = supabase.channel('online-users', {
    config: { presence: { key: crypto.randomUUID() } }
  });

  presenceChannel.on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState();
    const count = Object.keys(state).length;
    document.getElementById('user-count').textContent = count;
  });

  await presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ online_at: new Date().toISOString() });
    }
  });
}

// ── Boot ──
renderAvatars();
(async () => {
  await initSupabase();
  loadLiveFeed();
  trackPresence();
})();
