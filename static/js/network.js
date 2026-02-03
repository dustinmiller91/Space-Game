// Server communication via WebSocket

export class ServerConnection {
    constructor(onMessage) {
        this.ws = null;
        this.onMessage = onMessage;
        this.connect();
    }
    
    connect() {
        this.ws = new WebSocket('ws://localhost:8000/ws');
        
        this.ws.onopen = () => {
            console.log('Connected to server');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.onMessage(data);
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from server');
            setTimeout(() => this.connect(), 3000); // Reconnect after 3s
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
}
