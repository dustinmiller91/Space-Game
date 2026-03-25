/**
 * network.js — Client/Server communication.
 *
 * Provides both REST (fetch) and WebSocket interfaces
 * for talking to the FastAPI game server.
 */
const Network = {

  ws: null,
  handlers: {},
  connected: false,
  userId: 1,  // default test player

  // ── REST API ──────────────────────────────────────────────

  async fetchGalaxy() {
    const res = await fetch('/api/galaxy');
    return res.json();
  },

  async fetchSystem(systemId) {
    const res = await fetch(`/api/system/${systemId}`);
    return res.json();
  },

  async fetchPlanet(planetId) {
    const res = await fetch(`/api/planet/${planetId}`);
    return res.json();
  },

  async fetchStar(starId) {
    const res = await fetch(`/api/star/${starId}`);
    return res.json();
  },

  // ── WebSocket ─────────────────────────────────────────────

  connect(userId) {
    if (userId !== undefined) this.userId = userId;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/${this.userId}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      console.log('[net] WebSocket connected');
      this._fire('open', null);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this._fire(data.type, data);
      } catch (e) {
        console.error('[net] parse error', e);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      console.log('[net] WebSocket closed — reconnecting in 3s');
      setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = (err) => {
      console.error('[net] WebSocket error', err);
    };
  },

  /**
   * Send a JSON message to the server.
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  },

  /**
   * Request system data via WebSocket.
   */
  requestSystem(systemId) {
    this.send({ type: 'get_system', system_id: systemId });
  },

  /**
   * Request planet details via WebSocket.
   */
  requestPlanet(planetId) {
    this.send({ type: 'get_planet', planet_id: planetId });
  },

  /**
   * Request current resource totals for a system.
   */
  requestResources(systemId) {
    this.send({ type: 'get_resources', system_id: systemId });
  },

  // ── Event handling ────────────────────────────────────────

  /**
   * Register a handler for a message type.
   * Usage: Network.on('system_data', (data) => { ... })
   */
  on(type, callback) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(callback);
  },

  /**
   * Remove all handlers for a message type.
   */
  off(type) {
    delete this.handlers[type];
  },

  _fire(type, data) {
    const cbs = this.handlers[type] || [];
    cbs.forEach(cb => {
      try { cb(data); } catch (e) { console.error(`[net] handler error (${type})`, e); }
    });
  },
};