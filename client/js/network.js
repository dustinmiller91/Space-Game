/**
 * network.js — Client/server communication.
 *
 * REST for loading views. WebSocket for future real-time push updates.
 */
const Network = {

  async fetchGalaxy()    { return (await fetch('/api/galaxy')).json(); },
  async fetchSystem(id)  { return (await fetch(`/api/system/${id}`)).json(); },
  async fetchBody(id)    { return (await fetch(`/api/body/${id}`)).json(); },

  // WebSocket (for future real-time updates)

  ws: null,
  handlers: {},

  connect(userId) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${location.host}/ws/${userId}`);
    this.ws.onopen    = () => console.log('[net] connected');
    this.ws.onclose   = () => { console.log('[net] reconnecting...'); setTimeout(() => this.connect(userId), 3000); };
    this.ws.onerror   = (e) => console.error('[net] error', e);
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        (this.handlers[msg.type] || []).forEach(cb => cb(msg));
      } catch (err) { console.error('[net] parse error', err); }
    };
  },

  send(data) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data)); },
  on(type, cb) { (this.handlers[type] = this.handlers[type] || []).push(cb); },
  off(type) { delete this.handlers[type]; },
};